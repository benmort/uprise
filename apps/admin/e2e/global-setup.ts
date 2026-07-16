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

export default async function globalSetup() {
  const user = readEnv("BASIC_AUTH_USERNAME") || "admin";
  const pass = readEnv("BASIC_AUTH_PASSWORD") || "decolonise2026";

  if (!process.env.E2E_SKIP_SEED) {
    try {
      execSync("npm --prefix ../api run seed:demo", { cwd: __dirname + "/..", stdio: "inherit" });
    } catch (e) {
      console.warn("[e2e] seed:demo failed (continuing — data may already exist):", (e as Error).message);
    }
  }

  // Mint the organiser session FIRST — the id resolution below needs it (Bearer wins in the guard).
  const orgToken = await login(ORGANISER);
  const volToken = await login(VOLUNTEER);

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

  const dir = resolve(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });

  // Organiser: cookie + (for parity) the volunteer id on the web origin.
  writeFileSync(
    resolve(dir, "state.json"),
    JSON.stringify(
      stateFor(orgToken, ids.volunteerId ? [{ origin: WEB_URL, localStorage: [{ name: "uprise.volunteerId", value: ids.volunteerId }] }] : []),
      null,
      2,
    ),
  );
  // Volunteer: cookie + the volunteer id on the FIELD origin (the PWA reads it from localStorage).
  writeFileSync(
    resolve(dir, "volunteer.json"),
    JSON.stringify(
      stateFor(volToken, ids.volunteerId ? [{ origin: FIELD_URL, localStorage: [{ name: "uprise.volunteerId", value: ids.volunteerId }] }] : []),
      null,
      2,
    ),
  );
  writeFileSync(resolve(dir, "context.json"), JSON.stringify({ user, pass, ids }, null, 2));
  console.log("[e2e] resolved ids:", ids, "org session:", orgToken ? "ok" : "none", "volunteer session:", volToken ? "ok" : "none");
}
