import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seeds demo data, mints real sessions for the demo organiser AND the demo volunteer, resolves the
 * seeded IDs, and writes Playwright storageStates carrying the httpOnly `auth_token` cookie (meld
 * doc 14). Locally the cookie is host-scoped to `localhost` (port-agnostic, so one cookie reaches
 * web :3000, api :3001, field :3005); in ngrok mode it's the parent-domain `.dev.uprise.org.au`
 * Secure cookie shared across the subdomains (the real SSO).
 *
 * IMPORTANT: the seeded IDs are resolved with the organiser's SESSION token (Bearer), not Basic
 * auth. The list endpoints are ORGANISER-role + tenant-scoped, so Basic auth (no principal) returned
 * nothing — which left context.json `ids` empty and silently skipped every deep-journey test. A
 * Bearer header wins in the API's auth guard, so this authenticates as the demo organiser properly.
 *
 * E2E_TARGET defaulting is inlined (mirrors playwright.config): a shared local .ts import trips
 * Playwright's TS loader on Node 23.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const REPO = resolve(__dirname, "../../..");
const API =
  process.env.NEXT_PUBLIC_API_URL || (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");
const COOKIE_HOST = process.env.E2E_COOKIE_DOMAIN || (IS_NGROK ? ".dev.uprise.org.au" : "localhost");
const COOKIE_SECURE = IS_NGROK;
const WEB_URL = process.env.WEB_URL || (IS_NGROK ? "https://admin.dev.uprise.org.au" : "http://localhost:3000");
const FIELD_URL = process.env.FIELD_URL || (IS_NGROK ? "https://field.dev.uprise.org.au" : "http://localhost:3005");
const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };
const VOLUNTEER = { email: "demo.volunteer@uprise.test", password: "demo-volunteer-pw" };
const OWNER = { email: "demo.owner@uprise.test", password: "demo-owner-pw" };

/**
 * Slug of the tenant a given worker owns. Worker 0 keeps the primary demo tenant so a serial run
 * (workers: 1) is byte-identical to what it always was; workers 1..n-1 get their own.
 */
function tenantSlugForWorker(index: number): string | null {
  return index === 0 ? null : `e2e-worker-${index}`;
}

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  try {
    const env = readFileSync(resolve(REPO, "apps/api/.env"), "utf8");
    const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object")
    for (const k of ["items", "audiences", "blasts", "data", "results", "rows"]) if (Array.isArray(v[k])) return v[k];
  return [];
}

/** Mint an opaque session token for a set of credentials (returns "" on failure). */
async function login(creds: { email: string; password: string }): Promise<string> {
  try {
    const res = await fetch(`${API}/iam/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const json = await res.json().catch(() => null);
    return (json?.data?.token ?? json?.token ?? "") as string;
  } catch {
    return "";
  }
}

/** A Playwright storageState carrying the session cookie (+ optional per-origin localStorage). */
function stateFor(token: string, origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> = []) {
  return {
    cookies: token
      ? [
          {
            name: "auth_token",
            value: token,
            domain: COOKIE_HOST,
            path: "/",
            httpOnly: true,
            secure: COOKIE_SECURE,
            sameSite: "Lax" as const,
            expires: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
          },
        ]
      : [],
    origins,
  };
}

/** Create the worker's tenant if it isn't there yet, and return its id. */
async function ensureWorkerTenant(ownerToken: string, slug: string): Promise<string | null> {
  const existing = await fetch(`${API}/tenants?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const found = asArray(existing?.data ?? existing).find((t: any) => t?.slug === slug);
  if (found?.id) return found.id;

  const res = await fetch(`${API}/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ slug, name: `E2E ${slug}` }),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = await res.json().catch(() => null);
  return (json?.data?.id ?? json?.id ?? null) as string | null;
}

/** Point a freshly-minted session at one specific tenant. */
async function selectTenant(token: string, tenantId: string): Promise<boolean> {
  const res = await fetch(`${API}/iam/select-tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tenantId }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export default async function globalSetup(config?: { workers?: number }) {
  const user = readEnv("BASIC_AUTH_USERNAME") || "admin";
  const pass = readEnv("BASIC_AUTH_PASSWORD") || "decolonise2026";
  const workers = Math.max(1, Number(config?.workers ?? 1));

  if (!process.env.E2E_SKIP_SEED) {
    try {
      execSync("npm --prefix ../api run seed:demo", { cwd: __dirname + "/..", stdio: "inherit" });
    } catch (e) {
      console.warn("[e2e] seed:demo failed (continuing — data may already exist):", (e as Error).message);
    }
  }

  /**
   * A TENANT PER WORKER.
   *
   * With one shared tenant, raising `workers` measurably made the suite worse: 109 passed / 2
   * failed / 5 flaky serially became 104 / 7 / 13 at four workers, and every newly-failing test
   * was one that CREATES or MUTATES state — audience syncs, blast create/schedule, invite
   * acceptance, campaign creation. Even with fullyParallel:false, separate files racing on the
   * same tenant collide: one spec's blast list is another spec's fixture.
   *
   * Identity is global and membership carries the role, so the same demo users can belong to
   * every worker tenant — no per-worker accounts needed. Each worker then gets its own session
   * pinned to its own tenant via /iam/select-tenant, and its own seeded ids.
   *
   * Worker 0 keeps the primary demo tenant, so a serial run is byte-identical to what it was.
   */
  const ownerToken = workers > 1 ? await login(OWNER) : "";
  const dir = resolve(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });

  for (let index = 0; index < workers; index += 1) {
    const slug = tenantSlugForWorker(index);

    let tenantId: string | null = null;
    if (slug) {
      if (!ownerToken) {
        console.warn(`[e2e] worker ${index}: no owner session — falling back to the shared tenant`);
      } else {
        tenantId = await ensureWorkerTenant(ownerToken, slug);
        if (!tenantId) {
          console.warn(`[e2e] worker ${index}: could not provision "${slug}" — falling back to shared`);
        } else if (!process.env.E2E_SKIP_SEED) {
          try {
            execSync("npm --prefix ../api run seed:demo", {
              cwd: __dirname + "/..",
              stdio: "inherit",
              env: { ...process.env, SEED_TENANT_SLUG: slug },
            });
          } catch (e) {
            console.warn(`[e2e] seeding "${slug}" failed:`, (e as Error).message);
          }
        }
      }
    }

    // Fresh tokens per worker: select-tenant re-points a session, so sharing one token across
    // workers would have each worker silently move the others' tenant out from under them.
    const orgToken = await login(ORGANISER);
    const volToken = await login(VOLUNTEER);
    if (tenantId) {
      await selectTenant(orgToken, tenantId);
      await selectTenant(volToken, tenantId);
    }

    const get = async (path: string) => {
      try {
        const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${orgToken}` } });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data ?? json;
      } catch {
        return null;
      }
    };

    const ids: Record<string, string | undefined> = {};
    if (orgToken) {
      const campaigns = asArray(await get("/canvass/campaigns"));
      ids.campaignId = (campaigns.find((c) => c.name?.startsWith("Demo")) || campaigns[0])?.id;
      const volunteers = asArray(await get("/canvass/volunteers"));
      ids.volunteerId = (volunteers.find((u) => u.email === VOLUNTEER.email) || volunteers[0])?.id;
      if (ids.volunteerId) {
        const assigns = asArray(await get(`/canvass/assignments?volunteerId=${ids.volunteerId}`));
        ids.turfId = assigns[0]?.turfId;
        ids.walkListId = assigns[0]?.walkLists?.[0]?.id;
        ids.stopId = assigns[0]?.walkLists?.[0]?.items?.[0]?.id;
      }
      ids.contactId = asArray(await get("/contacts?query=Ada"))[0]?.id;
      ids.audienceId = asArray(await get("/audiences"))[0]?.id;
      ids.blastId = asArray(await get("/blasts"))[0]?.id;
    }

    const orgOrigins = ids.volunteerId
      ? [{ origin: WEB_URL, localStorage: [{ name: "uprise.volunteerId", value: ids.volunteerId }] }]
      : [];
    const volOrigins = ids.volunteerId
      ? [{ origin: FIELD_URL, localStorage: [{ name: "uprise.volunteerId", value: ids.volunteerId }] }]
      : [];

    // Worker 0 also writes the UNSUFFIXED names, so anything still reading state.json /
    // context.json (and the config's default storageState) keeps working unchanged.
    const names =
      index === 0
        ? [`state-${index}.json`, "state.json"]
        : [`state-${index}.json`];
    for (const name of names) writeFileSync(resolve(dir, name), JSON.stringify(stateFor(orgToken, orgOrigins), null, 2));

    const volNames = index === 0 ? [`volunteer-${index}.json`, "volunteer.json"] : [`volunteer-${index}.json`];
    for (const name of volNames) writeFileSync(resolve(dir, name), JSON.stringify(stateFor(volToken, volOrigins), null, 2));

    const ctxNames = index === 0 ? [`context-${index}.json`, "context.json"] : [`context-${index}.json`];
    for (const name of ctxNames) writeFileSync(resolve(dir, name), JSON.stringify({ user, pass, ids, tenantSlug: slug, tenantId }, null, 2));

    console.log(
      `[e2e] worker ${index}${slug ? ` (${slug})` : " (primary)"} ids:`,
      ids,
      "org:",
      orgToken ? "ok" : "none",
      "volunteer:",
      volToken ? "ok" : "none",
    );
  }
}
