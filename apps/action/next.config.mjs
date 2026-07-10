/**
 * The action app keeps its own public insights layout and IFRAMES the admin app's chrome-less
 * `/embed/insights/*` route (so it REUSES the exact PollBody/QuestionBody/charts/map) into it.
 * We expose the resolved admin origin as NEXT_PUBLIC_ADMIN_ORIGIN so the iframe src can be built.
 *
 * Resolution order: an explicit NEXT_PUBLIC_ADMIN_URL wins; otherwise derive the admin host from
 * the deployed API host (api.<env>.uprise.org.au → admin.<env>.uprise.org.au) so dev and prod
 * need no extra env var; otherwise fall back to local admin on :3000.
 */
function resolveAdminUrl() {
  if (process.env.NEXT_PUBLIC_ADMIN_URL) return process.env.NEXT_PUBLIC_ADMIN_URL;
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    try {
      const u = new URL(api);
      if (u.hostname.startsWith("api.") && u.hostname.endsWith("uprise.org.au")) {
        return `${u.protocol}//admin.${u.hostname.slice("api.".length)}`;
      }
    } catch {
      // fall through to the local default
    }
  }
  return "http://localhost:3000";
}

const ADMIN_URL = resolveAdminUrl();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Validation builds set NEXT_DIST_DIR (e.g. .next-validate) so `next build`
  // never clobbers the `.next` a running `next dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts"],
  // The resolved admin origin, inlined so the client iframe can point at /embed/insights/*.
  env: { NEXT_PUBLIC_ADMIN_ORIGIN: ADMIN_URL },
};

export default nextConfig;
