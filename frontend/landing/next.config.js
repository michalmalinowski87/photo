const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Resolve modules from the root node_modules in yarn workspaces
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../../node_modules'),
      'node_modules',
    ];
    // Add alias for shared-auth
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared-auth': path.resolve(__dirname, '../shared-auth'),
    };
    return config;
  },
};

module.exports = nextConfig;

