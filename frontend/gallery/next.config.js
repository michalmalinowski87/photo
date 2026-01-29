const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ['@photocloud/gallery-components'],
	// Allow dev requests when accessed via Traefik/local HTTPS (e.g. gallery.lvh.me, *.lvh.me)
	allowedDevOrigins: [
		'dashboard.lvh.me',
		'photocloud.lvh.me',
		'gallery.lvh.me',
		'*.lvh.me',
	],
	// Optimize images
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'dat3mi5gqa8v2.cloudfront.net',
			},
		],
		// Enable image optimization
		formats: ['image/avif', 'image/webp'],
		// Reduce image quality slightly for better performance (default is 75)
		deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
		imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
	},
	// Enable compression
	compress: true,
	// Optimize production builds
	swcMinify: true,
	// Enable experimental features for better performance
	experimental: {
		optimizePackageImports: ['@tanstack/react-query', 'lightgallery'],
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

