// Per-tenant PWA manifest. The field app is one host serving every tenant (the tenant comes
// from the volunteer's session, not the URL), so the manifest must be resolved per-request from
// the session cookie — a static file can't be tenant-branded. The <link rel="manifest"> is set
// `crossOrigin="use-credentials"` (layout.tsx) so the browser sends the cookie with this fetch.
//
// The volunteer's tenant name + square logo become the installed app's name + icon
// ("Common Threads — Field", their logo). ANY failure — no cookie (dev / logged out), a dead
// API, a volunteer without a tenant — falls back to the neutral "Field" manifest, so the app is
// always installable. PWA branding is captured at install time and fixed thereafter (inherent).

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

// Neutral fallback icons (the Uprise mark), used when the tenant has no usable logo.
const FALLBACK_ICONS = [
  { src: "/uprise-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
];

function iconType(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// Declare the tenant logo at the launcher's preferred sizes so Android picks it over the
// generic marks (the source is scaled to fit). purpose "any" — a non-square logo would be
// cropped as "maskable", so we let the launcher pad it instead.
function tenantIcons(logo: string) {
  const type = iconType(logo);
  return [
    { src: logo, sizes: "192x192", type, purpose: "any" },
    { src: logo, sizes: "512x512", type, purpose: "any" },
  ];
}

function manifest(name: string, shortName: string, icons: unknown[]) {
  return {
    name,
    short_name: shortName,
    description: "Door-knocking for canvassers — offline-first.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#465fff",
    icons,
  };
}

function respond(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/manifest+json",
      // Per-user (per-tenant) + revalidated often: never share across users via a CDN.
      "Cache-Control": "private, no-cache",
    },
  });
}

async function readJson(res: PromiseSettledResult<Response>): Promise<Record<string, unknown> | null> {
  if (res.status !== "fulfilled" || !res.value.ok) return null;
  try {
    return (await res.value.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const neutral = manifest("Field", "Field", FALLBACK_ICONS);
  try {
    const cookie = req.headers.get("cookie");
    if (!cookie || !cookie.includes("auth_token")) return respond(neutral);

    const [checkSettled, orgSettled] = await Promise.allSettled([
      fetch(`${API_URL}/auth/check`, { headers: { cookie }, cache: "no-store" }),
      fetch(`${API_URL}/org-profile`, { headers: { cookie }, cache: "no-store" }),
    ]);

    // Tenant name — the active membership's, falling back to an "acting-as" active tenant.
    let name: string | null = null;
    const check = await readJson(checkSettled);
    const user = check?.user as
      | { tenantId?: string; memberships?: Array<{ tenantId: string; tenantName: string }>; activeTenant?: { name?: string } }
      | null
      | undefined;
    if (user) {
      const memberships = user.memberships ?? [];
      const current = memberships.find((m) => m.tenantId === user.tenantId) ?? memberships[0];
      name = current?.tenantName ?? user.activeTenant?.name ?? null;
    }
    if (!name) return respond(neutral);

    // Square block logo for the icon (session-tenant-scoped); the raw endpoint returns the
    // profile directly, but tolerate a { data } envelope too.
    const org = await readJson(orgSettled);
    const logo =
      (org?.logoBlockUrl as string | undefined) ??
      ((org?.data as Record<string, unknown> | undefined)?.logoBlockUrl as string | undefined) ??
      null;

    return respond(manifest(`${name} — Field`, name, logo ? tenantIcons(logo) : FALLBACK_ICONS));
  } catch {
    return respond(neutral);
  }
}
