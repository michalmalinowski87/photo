const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 15: Bundle external packages for Pages Router for faster startup times
  experimental: {
    bundlePagesRouterDependencies: true,
  },
  webpack: (config, { isServer, webpack }) => {
    // Resolve modules from local node_modules first (important for nohoisted packages like @swc)
    // Then fall back to root node_modules for other packages
    const localNodeModules = path.resolve(__dirname, 'node_modules');
    const rootNodeModules = path.resolve(__dirname, '../../node_modules');
    
    // Ensure local node_modules is checked first for all resolutions
    config.resolve.modules = [
      localNodeModules, // Local node_modules first (for nohoisted packages)
      rootNodeModules,  // Root node_modules (for hoisted packages)
      'node_modules',
    ];
    
    // Ensure webpack loaders also resolve from local node_modules first
    // This is critical for Next.js internal loaders like next-flight-client-entry-loader
    if (!config.resolveLoader) {
      config.resolveLoader = {};
    }
    config.resolveLoader.modules = [
      localNodeModules, // Local node_modules first for loaders
      rootNodeModules,
      'node_modules',
    ];
    
    // Add alias for shared-auth
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared-auth': path.resolve(__dirname, '../shared-auth'),
    };
    
    // Ensure Next.js can find its internal modules and loaders
    // This helps resolve next-flight-client-entry-loader and other Next.js internals
    const nextPath = path.resolve(localNodeModules, 'next');
    if (nextPath) {
      // Ensure Next.js internal loaders resolve correctly
      config.resolve.alias = {
        ...config.resolve.alias,
        'next/dist/compiled': path.resolve(nextPath, 'dist/compiled'),
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;
