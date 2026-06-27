import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seeds demo data, logs in the seeded demo organiser to mint a real session, and
 * writes a Playwright storageState carrying the httpOnly `auth_token` cookie (meld
 * doc 14 cutover — the app no longer reads sessionStorage creds). Cookies are
 * host-scoped (port-agnostic), so one `localhost` cookie is sent to both web (:3000)
 * and api (:3001). Also resolves seeded IDs for dynamic-route specs.
 */
const REPO = resolve(__dirname, "../../..");
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
const COOKIE_HOST = process.env.E2E_COOKIE_DOMAIN || "localhost";
const ORGANISER = { email: "demo.organiser@yarns.test", password: "demo-organiser-pw" };

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
  if (v && typeof v === "object") for (const k of ["items", "audiences", "blasts", "data", "results", "rows"]) if (Array.isArray(v[k])) return v[k];
  return [];
}

export default async function globalSetup() {
  const user = readEnv("BASIC_AUTH_USERNAME") || "admin";
  const pass = readEnv("BASIC_AUTH_PASSWORD") || "decolonise2026";
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  if (!process.env.E2E_SKIP_SEED) {
    try {
      execSync("npm --prefix ../api run seed:demo", { cwd: __dirname + "/..", stdio: "inherit" });
    } catch (e) {
      console.warn("[e2e] seed:demo failed (continuing — data may already exist):", (e as Error).message);
    }
  }

  const get = async (path: string) => {
    try {
      const res = await fetch(`${API}${path}`, { headers: { Authorization: auth } });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? json;
    } catch {
      return null;
    }
  };

  const ids: Record<string, string | undefined> = {};
  const campaigns = asArray(await get("/canvass/campaigns"));
  ids.campaignId = (campaigns.find((c) => c.name?.startsWith("Demo")) || campaigns[0])?.id;
  const volunteers = asArray(await get("/canvass/volunteers"));
  ids.volunteerId = (volunteers.find((u) => u.email === "demo.volunteer@yarns.test") || volunteers[0])?.id;
  if (ids.volunteerId) {
    const assigns = asArray(await get(`/canvass/assignments?volunteerId=${ids.volunteerId}`));
    ids.turfId = assigns[0]?.turfId;
    ids.stopId = assigns[0]?.walkLists?.[0]?.items?.[0]?.id;
  }
  ids.contactId = asArray(await get("/contacts?query=Ada"))[0]?.id;
  ids.audienceId = asArray(await get("/audiences"))[0]?.id;
  ids.blastId = asArray(await get("/blasts"))[0]?.id;

  // Mint a real session for the seeded demo organiser (cookie auth, doc 14).
  let token = "";
  try {
    const res = await fetch(`${API}/iam/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ORGANISER),
    });
    const json = await res.json().catch(() => null);
    token = (json?.data?.token ?? json?.token ?? "") as string;
  } catch (e) {
    console.warn("[e2e] organiser login failed — authed specs will redirect:", (e as Error).message);
  }

  const dir = resolve(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });
  // Playwright storageState: the host-scoped session cookie + the volunteer id.
  const storageState = {
    cookies: token
      ? [
          {
            name: "auth_token",
            value: token,
            domain: COOKIE_HOST,
            path: "/",
            httpOnly: true,
            secure: false,
            sameSite: "Lax" as const,
            expires: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
          },
        ]
      : [],
    origins: ids.volunteerId
      ? [
          {
            origin: process.env.WEB_URL || "http://localhost:3000",
            localStorage: [{ name: "yarns.volunteerId", value: ids.volunteerId }],
          },
        ]
      : [],
  };
  writeFileSync(resolve(dir, "state.json"), JSON.stringify(storageState, null, 2));
  writeFileSync(resolve(dir, "context.json"), JSON.stringify({ user, pass, ids }, null, 2));
  console.log("[e2e] resolved ids:", ids, "session:", token ? "ok" : "none");
}
