// Marketing screenshot pipeline — authenticated captures of the real product surfaces, written
// straight into the marketing site's public dir with a manifest of true pixel dimensions.
//
// Why this exists: the homepage's screenshots drifted into lies. One was labelled "canvasser app"
// while showing the admin dashboard full of leftover TailAdmin template data; the CTA shot still
// advertised "Upgrade To Pro". Hand-taken screenshots rot silently. This makes them reproducible.
//
// Prerequisites:
//   1. api on :3001, admin on :3000, field on :3005   (pnpm dev:apps)
//   2. demo data seeded:  npm --prefix apps/api run seed:demo
//   3. playwright available (uses system Chrome via channel:"chrome")
//
// Run:   node apps/admin/scripts/marketing-shots.mjs            # all shots, both themes
//        node apps/admin/scripts/marketing-shots.mjs inbox turf  # only named shots
//
// Output: apps/product-marketing/public/images/marketing/screens/<name>[-dark]@2x.png
//         + screens.json  — { name: { file, width, height, alt, capturedAt } }
//
// The manifest is the point: components read width/height from it instead of hardcoding, which is
// what stopped the declared-vs-actual aspect bugs (mobile-screenshot.png was declared 410x554 and
// was actually 770x1490, so the frame cropped it).
//
// Auth: POST /iam/sessions → the httpOnly `auth_token` cookie, the same path e2e/global-setup.ts
// uses. The older capture-surfaces.mjs injects sessionStorage + a Basic header, which is the
// pre-doc-14 scheme — middleware.ts now 307s every one of those to the auth app.
//
// Theme: a plain `theme` cookie. theme-provider.tsx's NO_FLASH_THEME_SCRIPT applies `.dark` before
// paint, so the very first frame is correctly themed — no toggle click, no settle wait.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const OUT = resolve(REPO, "apps/product-marketing/public/images/marketing/screens");
const MANIFEST = resolve(OUT, "screens.json");

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
const ADMIN = process.env.WEB_URL || "http://localhost:3000";
const FIELD = process.env.FIELD_URL || "http://localhost:3005";
const COOKIE_HOST = process.env.SHOTS_COOKIE_DOMAIN || "localhost";

const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };
const VOLUNTEER = { email: "demo.volunteer@uprise.test", password: "demo-volunteer-pw" };

// Wide-browser framing, retina. 1512x900 matches the hero slot's ~2.19:1 crop from the top.
const DESKTOP = { width: 1512, height: 900 };
const MOBILE = { width: 402, height: 874 };

/** Mint an opaque session token, or "" on failure. */
async function login(creds) {
  try {
    const res = await fetch(`${API}/iam/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const json = await res.json().catch(() => null);
    return json?.data?.token ?? json?.token ?? "";
  } catch {
    return "";
  }
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["items", "audiences", "blasts", "data", "results", "rows"]) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
}

/** Authenticated GET against the API with the session token (Bearer, not Basic). */
async function api(path, token) {
  try {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? json;
  } catch {
    return null;
  }
}

/** Seeded ids so the dynamic routes render real content rather than a not-found. */
async function resolveIds(token) {
  const ids = {};
  const campaigns = asArray(await api("/canvass/campaigns", token));
  ids.campaignId = (campaigns.find((c) => c.name?.startsWith("Demo")) || campaigns[0])?.id;
  const volunteers = asArray(await api("/canvass/volunteers", token));
  ids.volunteerId = (volunteers.find((u) => u.email === VOLUNTEER.email) || volunteers[0])?.id;
  if (ids.volunteerId) {
    const assigns = asArray(await api(`/canvass/assignments?volunteerId=${ids.volunteerId}`, token));
    ids.turfId = assigns[0]?.turfId;
    ids.stopId = assigns[0]?.walkLists?.[0]?.items?.[0]?.id;
  }
  return ids;
}

/**
 * The shots. `settle` is generous where a Mapbox canvas or a polling surface has to finish — an
 * unsettled map screenshots as grey tiles, which is worse than no screenshot.
 * `alt` lives here so the manifest carries honest alt text to the components; getting this wrong is
 * how the old hero ended up claiming to be the canvasser app.
 */
function shotList(ids) {
  return [
    {
      name: "dashboard",
      app: "admin",
      path: "/dashboard",
      settle: 6000,
      alt: "The Uprise campaign dashboard: doors knocked, contact rate and volunteer activity for a live doorknock campaign",
    },
    {
      name: "inbox",
      app: "admin",
      path: "/inbox",
      settle: 4000,
      alt: "The Uprise shared team inbox, with SMS conversations from supporters claimed across the team",
    },
    {
      name: "demographics",
      app: "admin",
      path: "/data/demographics?ind=median_age&view=map",
      settle: 20000,
      alt: "ABS census demographics mapped across Australia in Uprise, shaded by median age",
    },
    {
      name: "datasets",
      app: "admin",
      path: "/data/datasets",
      settle: 5000,
      alt: "The Uprise Australian datasets library, listing federal, state and local government boundary sets with row counts",
    },
    ids.campaignId && {
      name: "turf",
      app: "admin",
      path: `/canvass/${ids.campaignId}/turf`,
      settle: 14000,
      alt: "Cutting canvassing turf on a map in Uprise, dividing a suburb into walkable blocks",
    },
    ids.campaignId && {
      name: "results",
      app: "admin",
      path: `/canvass/${ids.campaignId}/results`,
      settle: 5000,
      alt: "Canvassing results in Uprise, breaking door knocks down by outcome",
    },
    {
      name: "branding",
      app: "admin",
      path: "/settings/branding",
      settle: 3000,
      alt: "White-label branding settings in Uprise: an organisation's logos, brand colours and custom styling",
    },
    // The canvasser app is a separate PWA on :3005 — captured at phone size, as a volunteer.
    {
      name: "field-walk",
      app: "field",
      path: ids.turfId ? `/${ids.turfId}` : "/",
      viewport: MOBILE,
      as: "volunteer",
      settle: 9000,
      alt: "The Uprise canvasser app on a phone, showing the next doors on a walk list",
    },
  ].filter(Boolean);
}

/** PNG intrinsic size straight from the IHDR chunk — avoids a dependency just to read dimensions. */
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function contextFor(browser, token, theme, volunteerId) {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  await context.addCookies([
    { name: "auth_token", value: token, domain: COOKIE_HOST, path: "/" },
    { name: "theme", value: theme, domain: COOKIE_HOST, path: "/" },
  ]);
  if (volunteerId) {
    // The field PWA reads its volunteer from localStorage; set it per-origin before navigation.
    await context.addInitScript((id) => {
      try {
        window.localStorage.setItem("uprise.volunteerId", id);
      } catch {}
    }, volunteerId);
  }
  return context;
}

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });

  const organiserToken = await login(ORGANISER);
  const volunteerToken = await login(VOLUNTEER);
  if (!organiserToken) {
    throw new Error(
      `could not sign in as ${ORGANISER.email} at ${API}. Is the api up and the demo seeded?\n` +
        `  pnpm dev:apps  &&  npm --prefix apps/api run seed:demo`,
    );
  }

  const ids = await resolveIds(organiserToken);
  console.log("resolved ids:", ids);
  let shots = shotList(ids);
  if (only.length) shots = shots.filter((s) => only.includes(s.name));
  if (!shots.length) throw new Error(`no shots matched: ${only.join(", ")}`);

  const browser = await chromium.launch({ channel: "chrome" });
  const manifest = existingManifest();
  const capturedAt = new Date().toISOString();

  for (const theme of ["light", "dark"]) {
    const orgCtx = await contextFor(browser, organiserToken, theme);
    const volCtx = await contextFor(browser, volunteerToken || organiserToken, theme, ids.volunteerId);
    console.log(`\n${theme}:`);

    for (const shot of shots) {
      const ctx = shot.as === "volunteer" ? volCtx : orgCtx;
      const base = shot.app === "field" ? FIELD : ADMIN;
      const suffix = theme === "dark" ? "-dark" : "";
      const key = `${shot.name}${suffix}`;
      const file = `${key}@2x.png`;
      const target = resolve(OUT, file);
      const page = await ctx.newPage();
      try {
        await page.setViewportSize(shot.viewport ?? DESKTOP);
        await page.goto(`${base}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(shot.settle ?? 4000);
        await page.screenshot({ path: target });
        const size = pngSize(target);
        manifest[key] = {
          file: `/images/marketing/screens/${file}`,
          width: size?.width ?? null,
          height: size?.height ?? null,
          alt: shot.alt,
          route: shot.path,
          theme,
          capturedAt,
          bytes: statSync(target).size,
        };
        console.log(`  ✓ ${key}  ${size?.width}x${size?.height}  ${(statSync(target).size / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.log(`  ✗ ${key}  (${shot.path}) — ${String(e).split("\n")[0]}`);
      } finally {
        await page.close();
      }
    }
    await orgCtx.close();
    await volCtx.close();
  }

  await browser.close();
  writeFileSync(MANIFEST, `${JSON.stringify(sortKeys(manifest), null, 2)}\n`);
  console.log(`\nmanifest → ${MANIFEST}`);
  console.log("REVIEW EVERY SHOT before committing — check for template leftovers and empty states.");
}

function existingManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return {};
  }
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
