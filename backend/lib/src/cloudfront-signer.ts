import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Generates a CloudFront signed URL for private content
 * Uses RSA-SHA1 signing with a custom policy
 * 
 * @param resourceUrl - The CloudFront URL to sign (e.g., https://d1234.cloudfront.net/path/to/file.zip)
 * @param privateKey - The private key content (PEM format)
 * @param keyPairId - The CloudFront key pair ID
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed CloudFront URL
 */
export function getCloudFrontSignedUrl(
	resourceUrl: string,
	privateKey: string,
	keyPairId: string,
	expiresIn: number = 3600
): string {
	const url = new URL(resourceUrl);
	const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

	// Create custom policy JSON (CloudFront format)
	// Resource must be the full URL or wildcard pattern
	const policy = {
		Statement: [
			{
				Resource: resourceUrl,
				Condition: {
					DateLessThan: {
						'AWS:EpochTime': expiresAt
					}
				}
			}
		]
	};

	const policyJson = JSON.stringify(policy);
	
	// Base64 encode policy and URL-safe encode
	const policyBase64 = Buffer.from(policyJson, 'utf-8').toString('base64')
		.replace(/\+/g, '-')
		.replace(/=/g, '_')
		.replace(/\//g, '~');

	// Sign the policy with RSA-SHA1
	const sign = createSign('RSA-SHA1');
	sign.update(policyJson);
	const signature = sign.sign(privateKey, 'base64')
		.replace(/\+/g, '-')
		.replace(/=/g, '_')
		.replace(/\//g, '~');

	// Build signed URL
	const signedUrl = `${resourceUrl}?Policy=${policyBase64}&Signature=${signature}&Key-Pair-Id=${keyPairId}`;

	return signedUrl;
}

/**
 * Reads CloudFront private key from SSM or environment variable
 * For local development, reads from file system
 */
export async function getCloudFrontPrivateKey(stage: string): Promise<string | undefined> {
	const envProc = (globalThis as any).process;
	
	// In Lambda, read from SSM Parameter Store
	if (envProc?.env?.AWS_LAMBDA_FUNCTION_NAME) {
		const { getConfigValueFromSsm } = await import('./ssm-config');
		return getConfigValueFromSsm(stage, 'CloudFrontPrivateKey');
	}
	
	// Local development: read from environment variable or file
	const keyFromEnv = envProc?.env?.CLOUDFRONT_PRIVATE_KEY;
	if (keyFromEnv) {
		return keyFromEnv;
	}
	
	// Try to read from file (for local development)
	try {
		const keyPath = join(process.cwd(), 'cloudfront-private-key.pem');
		return readFileSync(keyPath, 'utf-8');
	} catch {
		return undefined;
	}
}

/**
 * Gets CloudFront key pair ID from SSM or environment variable
 */
export async function getCloudFrontKeyPairId(stage: string): Promise<string | undefined> {
	const envProc = (globalThis as any).process;
	
	// In Lambda, read from SSM Parameter Store
	if (envProc?.env?.AWS_LAMBDA_FUNCTION_NAME) {
		const { getConfigValueFromSsm } = await import('./ssm-config');
		return getConfigValueFromSsm(stage, 'CloudFrontKeyPairId');
	}
	
	// Local development: read from environment variable
	return envProc?.env?.CLOUDFRONT_KEY_PAIR_ID;
}
