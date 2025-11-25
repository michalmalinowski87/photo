import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const userPoolClientId = envProc?.env?.COGNITO_USER_POOL_CLIENT_ID as string;

	if (!userPoolId || !userPoolClientId) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing Cognito configuration' })
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

	const body = event?.body ? JSON.parse(event.body) : {};
	const { currentPassword, newPassword } = body;

	if (!currentPassword || !newPassword) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'currentPassword and newPassword are required' })
		};
	}

	if (newPassword.length < 8) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Password must be at least 8 characters long' })
		};
	}

	try {
		// First, verify the current password by attempting to authenticate
		try {
			await cognito.send(new AdminInitiateAuthCommand({
				UserPoolId: userPoolId,
				ClientId: userPoolClientId,
				AuthFlow: 'ADMIN_NO_SRP_AUTH',
				AuthParameters: {
					USERNAME: userId,
					PASSWORD: currentPassword
				}
			}));
		} catch (authError: any) {
			if (authError.name === 'NotAuthorizedException' || authError.name === 'InvalidPasswordException') {
				return {
					statusCode: 401,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Current password is incorrect' })
				};
			}
			throw authError;
		}

		// If current password is correct, set the new password
		await cognito.send(new AdminSetUserPasswordCommand({
			UserPoolId: userPoolId,
			Username: userId,
			Password: newPassword,
			Permanent: true
		}));

		logger?.info('Password changed successfully', { userId });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Password changed successfully' })
		};
	} catch (error: any) {
		logger?.error('Change password failed', {
			error: {
				name: error.name,
				message: error.message
			},
			userId
		});

		if (error.name === 'InvalidPasswordException') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'New password does not meet requirements' })
			};
		}

		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to change password', message: error.message })
		};
	}
});

