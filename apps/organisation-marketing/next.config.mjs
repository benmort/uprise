/** @type {import('next').NextConfig} */
const nextConfig = {
  // Validation builds set NEXT_DIST_DIR (e.g. .next-validate) so `next build`
  // never clobbers the `.next` a running `next dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts"],
  // The pricing page became the FAQs page — keep the old path working.
  async redirects() {
    return [{ source: "/pricing", destination: "/faqs", permanent: true }];
  },
};

export default nextConfig;
