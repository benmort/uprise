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
    return [
      { source: "/for-campaigners", destination: "/campaigners", permanent: true },
      // status.uprise.org.au is the address people type during an outage, and it serves this
      // app: land it on the status page rather than the homepage. Host-conditional rather than
      // middleware — this site has none, and a redirect rule needs no runtime. 307 (temporary)
      // because the subdomain's meaning could change; a 301 would be cached in browsers forever.
      // Inert until the domain is pointed at this project, which is a DNS + Vercel step.
      {
        source: "/",
        has: [{ type: "host", value: "status.uprise.org.au" }],
        destination: "/status",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
