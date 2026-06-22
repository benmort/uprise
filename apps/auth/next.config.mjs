/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @yarns/ui is consumed as TS/TSX source; api-client/contracts as built dist.
  transpilePackages: ["@yarns/ui", "@yarns/api-client", "@yarns/contracts"],
};

export default nextConfig;
