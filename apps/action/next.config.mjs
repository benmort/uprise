/**
 * Where the public poll viewer lives. The viewer is the admin app's chrome-less `/p/*` route
 * (so it REUSES the exact PollBody/QuestionBody/charts/map), and we redirect the friendly
 * `action` `/insights/*` URLs onto it — a cross-app Next rewrite can't proxy admin's `_next`
 * assets, so a redirect is the only faithful option.
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
  async redirects() {
    return [
      { source: "/insights/:pollId", destination: `${ADMIN_URL}/p/:pollId`, permanent: false },
      {
        source: "/insights/:pollId/questions/:code",
        destination: `${ADMIN_URL}/p/:pollId/questions/:code`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
