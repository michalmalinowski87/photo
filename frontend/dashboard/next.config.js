const path = require("path");

// Bundle analyzer setup
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@photocloud/gallery-components"],
  // Optimize package imports to reduce bundle size
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-query",
      "react-virtuoso",
    ],
  },
  // Enable compression for better performance on slow connections
  compress: true,
  // Fail build on ESLint errors
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Fail build on TypeScript errors
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // Resolve modules from root node_modules in yarn workspace
    // This ensures Next.js can find dependencies even when they're hoisted to the root
    // __dirname is frontend/dashboard, so we go up 2 levels to reach the monorepo root
    const rootNodeModules = path.resolve(__dirname, "../../node_modules");
    const localNodeModules = path.resolve(__dirname, "node_modules");
    const nextNodeModules = path.resolve(localNodeModules, "next");

    // Add both local and root node_modules to resolve paths
    // Local is first to ensure dependencies resolve from local when available
    // This ensures webpack can find dependencies whether they're hoisted or local
    config.resolve.modules = [localNodeModules, rootNodeModules, "node_modules"];

    // For Next.js 15, ensure React and React-DOM resolve from Next.js's bundled versions
    // This prevents "Invalid hook call" errors caused by multiple React instances
    // Next.js bundles React in next/dist/compiled/react, which is the source of truth
    const nextReactPath = path.resolve(nextNodeModules, "dist/compiled/react");
    const nextReactDomPath = path.resolve(nextNodeModules, "dist/compiled/react-dom");

    config.resolve.alias = {
      ...config.resolve.alias,
      // Ensure React resolves from Next.js's bundled version
      react: nextReactPath,
      "react-dom": nextReactDomPath,
      // Also handle react/jsx-runtime
      "react/jsx-runtime": path.resolve(nextReactPath, "jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(nextReactPath, "jsx-dev-runtime"),
    };

    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
