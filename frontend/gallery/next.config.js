const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ['@photocloud/gallery-components'],
	webpack: (config, { isServer }) => {
		// Resolve React and React-DOM from root node_modules in yarn workspace
		// This ensures Next.js can find React even when it's hoisted to the root
		const rootNodeModules = path.resolve(__dirname, '../../node_modules');
		config.resolve.alias = {
			...config.resolve.alias,
			react: path.resolve(rootNodeModules, 'react'),
			'react-dom': path.resolve(rootNodeModules, 'react-dom'),
		};
		return config;
	},
};
module.exports = nextConfig;

