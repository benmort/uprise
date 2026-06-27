/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts"],
};

export default nextConfig;
