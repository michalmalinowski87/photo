import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing USERS_TABLE configuration' })
		};
	}

	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	try {
		const result = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId },
			ProjectionExpression: 'watermarks'
		}));

		const watermarks = result.Item?.watermarks || [];
		
		// Convert S3 URLs to CloudFront URLs if needed
		const stage = envProc?.env?.STAGE || 'dev';
		const ssmConfig = await import('../../lib/src/ssm-config');
		const cloudfrontDomain = await ssmConfig.getConfigValueFromSsm(stage, 'CloudFrontDomain') || undefined;

		const processedWatermarks = watermarks.map((wm: any) => {
			let url = wm.url;
			if (cloudfrontDomain && url) {
				const isS3Url = url.includes('.s3.') || url.includes('s3.amazonaws.com');
				const isCloudFrontUrl = url.includes(cloudfrontDomain);
				
				if (isS3Url && !isCloudFrontUrl) {
					try {
						const urlObj = new URL(url);
						const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						if (s3Key) {
							url = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
						}
					} catch {
						// URL parsing failed, keep original
					}
				}
			}
			return { ...wm, url };
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ watermarks: processedWatermarks })
		};
	} catch (error: any) {
		logger?.error('List watermarks failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list watermarks', message: error.message })
		};
	}
});
