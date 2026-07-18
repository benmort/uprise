/** @type {import('next').NextConfig} */
const nextConfig = {
  // Validation builds set NEXT_DIST_DIR (e.g. .next-validate) so `next build`
  // never clobbers the `.next` a running `next dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts"],
  // The "For Campaigners" page moved to /campaigners — 301 the old URL so existing
  // links, bookmarks and search results don't break.
  async redirects() {
    return [{ source: "/for-campaigners", destination: "/campaigners", permanent: true }];
  },
};

export default nextConfig;
