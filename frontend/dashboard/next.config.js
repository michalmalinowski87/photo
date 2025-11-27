/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@photocloud/gallery-components"],
  // Fail build on ESLint errors
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Fail build on TypeScript errors
  typescript: {
    ignoreBuildErrors: false,
  },
};
module.exports = nextConfig;
