/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @yarns/ui is consumed as TS/TSX source; api-client/contracts as built dist.
  transpilePackages: ["@yarns/ui", "@yarns/api-client", "@yarns/contracts"],
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
