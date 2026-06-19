import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seeds demo data, then resolves the seeded IDs so dynamic-route specs have real
 * content. Writes e2e/.auth/context.json (creds + ids) for the auth fixture.
 */
const REPO = resolve(__dirname, "../../..");
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

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

  // Seed demo data (idempotent). Skip with E2E_SKIP_SEED=1.
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
  const canvassers = asArray(await get("/canvass/canvassers"));
  ids.canvasserId = (canvassers.find((u) => u.email === "demo.canvasser@yarns.test") || canvassers[0])?.id;
  if (ids.canvasserId) {
    const assigns = asArray(await get(`/canvass/assignments?canvasserId=${ids.canvasserId}`));
    ids.turfId = assigns[0]?.turfId;
    ids.stopId = assigns[0]?.walkLists?.[0]?.items?.[0]?.id;
  }
  ids.contactId = asArray(await get("/contacts?query=Ada"))[0]?.id;
  ids.audienceId = asArray(await get("/audiences"))[0]?.id;
  ids.blastId = asArray(await get("/blasts"))[0]?.id;

  const dir = resolve(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "context.json"), JSON.stringify({ user, pass, ids }, null, 2));
  console.log("[e2e] resolved ids:", ids);
}
