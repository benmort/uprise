/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @uprise/ui is consumed as TS/TSX source; api-client/contracts as built dist.
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts"],
  // Keep the pre-rename paths working (in-flight emails, bookmarks, old links).
  // Query strings (?token=, ?return_to=) are carried over automatically.
  async redirects() {
    return [
      { source: "/login", destination: "/sign-in", permanent: false },
      { source: "/2fa", destination: "/two-factor-auth", permanent: false },
      { source: "/magic-link", destination: "/sign-in/magic-link", permanent: false },
    ];
  },
};

export default nextConfig;
