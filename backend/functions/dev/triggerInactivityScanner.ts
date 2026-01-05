import { lambdaLogger } from '../../../packages/logger/src';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';

const lambda = new LambdaClient({});

/**
 * Dev endpoint to manually trigger inactivity scanner
 * Only available in development/staging environments
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	// Access environment variables - try process.env directly first, then fallback to globalThis.process.env
	const stage = (process.env.STAGE || (globalThis as any).process?.env?.STAGE) as string;

	// Only allow in dev/staging
	if (stage === 'prod') {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'This endpoint is not available in production' })
		};
	}

	// Get Lambda function name from SSM Parameter Store (more reliable than environment variables)
	// Fallback to environment variable for backward compatibility
	const inactivityScannerFnName = await getConfigValueFromSsm(stage, 'InactivityScannerFnName') 
		|| process.env.INACTIVITY_SCANNER_FN_NAME 
		|| (globalThis as any).process?.env?.INACTIVITY_SCANNER_FN_NAME;
	
	if (!inactivityScannerFnName || inactivityScannerFnName.trim() === '') {
		logger?.error('Missing INACTIVITY_SCANNER_FN_NAME', {
			stage,
			ssmValue: await getConfigValueFromSsm(stage, 'InactivityScannerFnName'),
			envValue: process.env.INACTIVITY_SCANNER_FN_NAME
		});
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Missing INACTIVITY_SCANNER_FN_NAME configuration',
				message: 'Could not find InactivityScannerFnName in SSM Parameter Store or environment variables'
			})
		};
	}

	try {
		// Invoke inactivity scanner Lambda
		const result = await lambda.send(new InvokeCommand({
			FunctionName: inactivityScannerFnName,
			InvocationType: 'RequestResponse', // Synchronous to get result
			Payload: JSON.stringify({})
		}));

		const responsePayload = result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : {};

		logger.info('Triggered inactivity scanner', { result: responsePayload });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Inactivity scanner triggered',
				result: responsePayload
			})
		};
	} catch (error: any) {
		logger.error('Failed to trigger inactivity scanner', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				error: 'Failed to trigger inactivity scanner',
				message: error.message
			})
		};
	}
});

