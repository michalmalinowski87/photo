import { EnvConfig } from '@photocloud/config';

export function getEnv(): EnvConfig {
	const stage = (process.env.STAGE as 'dev' | 'prod') || 'dev';
	const awsRegion = process.env.AWS_REGION || 'eu-central-1';
	return {
		stage,
		awsRegion,
		userPoolId: process.env.COGNITO_USER_POOL_ID || '',
		userPoolClientId: process.env.COGNITO_USER_POOL_CLIENT_ID || '',
		galleriesBucketName: process.env.GALLERIES_BUCKET || '',
		paymentCurrency: 'PLN'
	};
}

export function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var ${name}`);
	return v;
}

