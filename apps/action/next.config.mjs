/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@yarns/ui", "@yarns/api-client", "@yarns/contracts"],
};

export default nextConfig;
