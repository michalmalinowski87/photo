const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ['@photocloud/gallery-components'],
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'dat3mi5gqa8v2.cloudfront.net',
			},
		],
	},
	webpack: (config, { isServer }) => {
		// Resolve modules from root node_modules in yarn workspace
		const rootNodeModules = path.resolve(__dirname, '../../node_modules');
		const localNodeModules = path.resolve(__dirname, 'node_modules');
		
		// Add both local and root node_modules to resolve paths
		config.resolve.modules = [localNodeModules, rootNodeModules, 'node_modules'];

		// Only alias React for client builds to avoid SSG issues
		if (!isServer) {
			config.resolve.alias = {
				...config.resolve.alias,
				react: path.resolve(rootNodeModules, 'react'),
				'react-dom': path.resolve(rootNodeModules, 'react-dom'),
				'@': path.resolve(__dirname, '.'),
			};
		} else {
			config.resolve.alias = {
				...config.resolve.alias,
				'@': path.resolve(__dirname, '.'),
			};
		}

		// Handle Node.js modules in browser (client-side only)
		if (!isServer) {
			config.resolve.fallback = {
				...config.resolve.fallback,
				fs: false,
				encoding: false,
				path: false,
				crypto: false,
			};
		}

		return config;
	},
};
module.exports = nextConfig;

