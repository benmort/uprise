// UI-audit capture harness. Screenshots every route with real seeded content for
// visual comparison against the design (docs/ui-audit/design + the 3 reference PNGs).
//
// Prerequisites:
//   1. API on :3001, web on :3000 (pnpm dev).
//   2. Demo data seeded:  npm --prefix apps/api run seed:demo
//   3. playwright installed (uses system Chrome via channel:'chrome').
//
// Run:  node apps/admin/scripts/capture-surfaces.mjs
// Output: docs/ui-audit/dev/<surface>.png
//
// Auth: env super-admin (BASIC_AUTH_*) injected into sessionStorage; the demo
// volunteer id into localStorage so the field PWA renders the assigned turf.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const OUT = resolve(REPO, "docs/ui-audit/dev");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

// Read env super-admin creds from apps/api/.env (dev convenience; not committed).
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const env = readFileSync(resolve(REPO, "apps/api/.env"), "utf8");
    const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}
const USER = readEnv("BASIC_AUTH_USERNAME");
const PASS = readEnv("BASIC_AUTH_PASSWORD");
const authHeader = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: authHeader } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data ?? json;
}

// API list endpoints return either an array or a paginated object — find the array.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["items", "audiences", "blasts", "data", "results", "rows"]) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
}

// Resolve the seeded ids so dynamic routes render real content.
async function resolveIds() {
  const ids = {};
  const campaigns = asArray(await api("/canvass/campaigns"));
  const demo = campaigns.find((c) => c.name?.startsWith("Demo")) || campaigns[0];
  ids.campaignId = demo?.id;
  const volunteers = asArray(await api("/canvass/volunteers"));
  const cv = volunteers.find((u) => u.email === "demo.volunteer@uprise.test") || volunteers[0];
  ids.volunteerId = cv?.id;
  if (ids.volunteerId) {
    const assigns = asArray(await api(`/canvass/assignments?volunteerId=${ids.volunteerId}`));
    const a = assigns[0];
    ids.turfId = a?.turfId;
    ids.stopId = a?.walkLists?.[0]?.items?.[0]?.id;
  }
  ids.contactId = asArray(await api("/contacts?query=Ada"))[0]?.id;
  const audiences = asArray(await api("/audiences"));
  ids.audienceId = (audiences.find((x) => x.name === "Tour Example Audience") || audiences[0])?.id;
  const blasts = asArray(await api("/blasts"));
  ids.blastId = (blasts.find((x) => x.title === "Tour Example Blast") || blasts[0])?.id;
  return ids;
}

function mainRoutes(id) {
  return [
    ["dashboard", "/dashboard"],
    ["audience", "/audience"],
    id.audienceId && ["audience-detail", `/audience/${id.audienceId}`],
    ["inbox", "/inbox"],
    ["analytics", "/analytics"],
    id.blastId && ["blast-detail", `/blasts/${id.blastId}`],
    id.blastId && ["composer", `/blasts/${id.blastId}/composer`],
    ["canvass", "/canvass"],
    ["canvass-new", "/canvass/new"],
    ["canvass-volunteers", "/canvass/volunteers"],
    id.campaignId && ["B2-turf", `/canvass/${id.campaignId}/turf`],
    id.campaignId && ["B3-walklists", `/canvass/${id.campaignId}/walklists`],
    id.campaignId && ["B4-live", `/canvass/${id.campaignId}/live`],
    id.campaignId && ["B6-results", `/canvass/${id.campaignId}/results`],
    id.campaignId && ["G7-goals", `/canvass/${id.campaignId}/goals`],
    id.campaignId && ["G8-shifts", `/canvass/${id.campaignId}/shifts`],
    id.campaignId && ["G10-qa", `/canvass/${id.campaignId}/qa`],
    id.contactId && ["E1-contact", `/contacts/${id.contactId}`],
    ["engagement", "/engagement"],
    ["C3-dispositions", "/engagement/dispositions"],
    ["C4-canned", "/engagement/canned-responses"],
    ["C2-surveys", "/engagement/surveys"],
    ["C1-scripts", "/engagement/scripts"],
    ["D-journeys", "/journeys"],
    ["compliance", "/compliance"],
    ["settings", "/settings"],
    ["settings-integrations", "/settings/integrations"],
    ["settings-roles", "/settings/roles"],
  ].filter(Boolean);
}

function fieldRoutes(id) {
  return [
    ["A1-field", "/"],
    id.turfId && ["A2-walk", `/${id.turfId}`],
    id.turfId && id.stopId && ["A3-door", `/${id.turfId}/door/${id.stopId}`],
    // "me" (sync & profile) is a fullscreen drawer now, not a route — no standalone URL to capture.
  ].filter(Boolean);
}

async function shoot(context, viewport, deviceScaleFactor, routes) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  for (const [name, path] of routes) {
    try {
      await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1400); // let maps/polling settle
      await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: viewport.width > 500 });
      console.log(`  ✓ ${name}  (${path})`);
    } catch (e) {
      console.log(`  ✗ ${name}  (${path}) — ${e.message.split("\n")[0]}`);
    }
  }
  await page.close();
}

async function main() {
  if (!USER || !PASS) throw new Error("BASIC_AUTH_USERNAME/PASSWORD not found in apps/api/.env");
  mkdirSync(OUT, { recursive: true });
  const ids = await resolveIds();
  console.log("Resolved ids:", ids);

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB,
          localStorage: [{ name: "uprise.volunteerId", value: ids.volunteerId || "" }],
        },
      ],
    },
  });
  // sessionStorage isn't covered by storageState — set it before every navigation.
  await context.addInitScript(
    ([u, p]) => {
      try {
        window.sessionStorage.setItem("yarn_auth_credentials", JSON.stringify({ username: u, password: p }));
      } catch {}
    },
    [USER, PASS],
  );

  console.log("Desktop (main) surfaces:");
  await shoot(context, { width: 1280, height: 900 }, 1, mainRoutes(ids));
  console.log("Mobile (field) surfaces:");
  await shoot(context, { width: 392, height: 812 }, 2, fieldRoutes(ids));

  await browser.close();
  console.log(`\nDone → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
