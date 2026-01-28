import { Router, Request, Response } from 'express';
import { getUserIdFromEvent } from '../../../lib/src/auth';
import { reqToEvent } from './helpers';
import { wrapHandler } from './handlerWrapper';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
// User deletion endpoints moved to separate Lambda (userDeletion.ts)

// Dev endpoints (only available in dev/staging) - loaded conditionally to avoid bundling issues
let devSetUserLastLogin: any = null;
let devTriggerUserDeletion: any = null;
let devTriggerInactivityScanner: any = null;

try {
	// Path is relative to this file: backend/functions/api/routes/auth.ts
	// So ../../dev/ resolves to backend/functions/dev/
	devSetUserLastLogin = require('../../dev/setUserLastLogin');
	devTriggerUserDeletion = require('../../dev/triggerUserDeletion');
	devTriggerInactivityScanner = require('../../dev/triggerInactivityScanner');
} catch (e) {
	// Ignore - dev modules not available during bundling or runtime
}

const router = Router();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

const RESERVED_SUBDOMAINS = new Set([
	'dashboard',
	'photocloud',
	'api',
	'auth',
	'www',
	'gallery',
	'landing',
	'static',
	'cdn'
]);

function normalizeSubdomain(input: unknown): string {
	return String(input ?? '').trim().toLowerCase();
}

function validateSubdomain(subdomain: string): { ok: true } | { ok: false; code: string; message: string } {
	if (!subdomain) {
		return { ok: false, code: 'MISSING', message: 'Subdomain is required' };
	}
	if (subdomain.length < 3 || subdomain.length > 30) {
		return { ok: false, code: 'INVALID_LENGTH', message: 'Subdomain must be 3-30 characters long' };
	}
	if (!/^[a-z0-9-]+$/.test(subdomain)) {
		return { ok: false, code: 'INVALID_CHARS', message: 'Only lowercase letters (a-z), digits (0-9) and hyphen (-) are allowed' };
	}
	if (!/^[a-z0-9].*[a-z0-9]$/.test(subdomain)) {
		return { ok: false, code: 'INVALID_EDGE', message: 'Subdomain must start and end with a letter or digit' };
	}
	if (RESERVED_SUBDOMAINS.has(subdomain)) {
		return { ok: false, code: 'RESERVED', message: 'This subdomain is reserved' };
	}
	return { ok: true };
}

router.get('/business-info', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	try {
		const result = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));

		const userData = result.Item || {};
		
		// Convert defaultWatermarkUrl from S3 to CloudFront if needed
		let defaultWatermarkUrl = userData.defaultWatermarkUrl || undefined;
		if (defaultWatermarkUrl && typeof defaultWatermarkUrl === 'string') {
			const envProc = (globalThis as any).process;
			const stage = envProc?.env?.STAGE || 'dev';
			// Dynamic import to avoid circular dependencies
			const ssmConfig = await import('../../../lib/src/ssm-config');
			const cloudfrontDomain = await ssmConfig.getConfigValueFromSsm(stage, 'CloudFrontDomain') || undefined;
			
			if (cloudfrontDomain && defaultWatermarkUrl) {
				const isS3Url = defaultWatermarkUrl.includes('.s3.') || defaultWatermarkUrl.includes('s3.amazonaws.com');
				const isCloudFrontUrl = defaultWatermarkUrl.includes(cloudfrontDomain);
				
				if (isS3Url && !isCloudFrontUrl) {
					try {
						const urlObj = new URL(defaultWatermarkUrl);
						const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						if (s3Key) {
							defaultWatermarkUrl = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
						}
					} catch {
						// URL parsing failed, keep original
					}
				}
			}
		}
		
		const businessInfo = {
			businessName: userData.businessName || '',
			email: userData.contactEmail || '',
			phone: userData.phone || '',
			address: userData.address || '',
			nip: userData.nip || '',
			welcomePopupShown: userData.welcomePopupShown === true,
			tutorialNextStepsDisabled: userData.tutorialNextStepsDisabled === true,
			tutorialClientSendDisabled: userData.tutorialClientSendDisabled === true,
			defaultWatermarkUrl,
			defaultWatermarkPosition: userData.defaultWatermarkPosition || undefined
		};

		return res.json(businessInfo);
	} catch (error: any) {
		logger?.error('Get business info failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return res.status(500).json({ error: 'Failed to get business information', message: error.message });
	}
});

router.put('/business-info', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const { businessName, email, phone, address, nip, welcomePopupShown, tutorialNextStepsDisabled, tutorialClientSendDisabled, defaultWatermarkUrl, defaultWatermarkPosition } = req.body;

	if (email !== undefined && email !== '' && email !== null) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return res.status(400).json({ error: 'Invalid email format' });
		}
	}

	// Use UpdateCommand to only update provided fields - prevents data loss
	// Check if user exists to determine if we need to set createdAt
	let existingData: any = {};
	try {
		const getResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId },
			ProjectionExpression: 'createdAt'
		}));
		existingData = getResult.Item || {};
	} catch (err) {
		logger?.info('User record not found, will set createdAt', { userId });
	}

	// Build update expression dynamically based on what fields are provided
	const updateExpressions: string[] = [];
	const expressionAttributeValues: Record<string, any> = {
		':updatedAt': new Date().toISOString()
	};
	updateExpressions.push('updatedAt = :updatedAt');

	// Set createdAt only if user doesn't exist yet
	if (!existingData.createdAt) {
		updateExpressions.push('createdAt = :updatedAt');
	}

	if (businessName !== undefined) {
		updateExpressions.push('businessName = :businessName');
		expressionAttributeValues[':businessName'] = String(businessName).trim() || '';
	}

	if (email !== undefined) {
		updateExpressions.push('contactEmail = :contactEmail');
		expressionAttributeValues[':contactEmail'] = email !== null && email !== '' ? email.trim().toLowerCase() : '';
	}

	if (phone !== undefined) {
		updateExpressions.push('phone = :phone');
		expressionAttributeValues[':phone'] = String(phone).trim() || '';
	}

	if (address !== undefined) {
		updateExpressions.push('address = :address');
		expressionAttributeValues[':address'] = String(address).trim() || '';
	}

	if (nip !== undefined) {
		updateExpressions.push('nip = :nip');
		expressionAttributeValues[':nip'] = String(nip).trim() || '';
	}

	if (welcomePopupShown !== undefined) {
		updateExpressions.push('welcomePopupShown = :welcomePopupShown');
		expressionAttributeValues[':welcomePopupShown'] = Boolean(welcomePopupShown);
		logger?.debug('Updating welcomePopupShown', { 
			userId, 
			welcomePopupShown, 
			convertedValue: Boolean(welcomePopupShown) 
		});
	}

	if (tutorialNextStepsDisabled !== undefined) {
		updateExpressions.push('tutorialNextStepsDisabled = :tutorialNextStepsDisabled');
		expressionAttributeValues[':tutorialNextStepsDisabled'] = Boolean(tutorialNextStepsDisabled);
	}

	if (tutorialClientSendDisabled !== undefined) {
		updateExpressions.push('tutorialClientSendDisabled = :tutorialClientSendDisabled');
		expressionAttributeValues[':tutorialClientSendDisabled'] = Boolean(tutorialClientSendDisabled);
	}

	if (defaultWatermarkUrl !== undefined) {
		if (defaultWatermarkUrl === null || defaultWatermarkUrl === '') {
			updateExpressions.push('defaultWatermarkUrl = :emptyString');
			expressionAttributeValues[':emptyString'] = '';
		} else if (typeof defaultWatermarkUrl === 'string') {
			updateExpressions.push('defaultWatermarkUrl = :defaultWatermarkUrl');
			expressionAttributeValues[':defaultWatermarkUrl'] = defaultWatermarkUrl.trim();
		}
	}

	if (defaultWatermarkPosition !== undefined) {
		if (defaultWatermarkPosition === null) {
			updateExpressions.push('defaultWatermarkPosition = :emptyString');
			expressionAttributeValues[':emptyString'] = '';
		} else if (typeof defaultWatermarkPosition === 'object' && defaultWatermarkPosition !== null) {
			// Validate the object structure - support both new format (x, y) and legacy format (position string)
			const position = defaultWatermarkPosition as {
				x?: number;
				y?: number;
				scale?: number;
				opacity?: number;
				// Legacy support
				position?: string;
			};
			
			// Validate position enum (legacy format)
			const validPositions = [
				'top-left', 'top-center', 'top-right',
				'middle-left', 'center', 'middle-right',
				'bottom-left', 'bottom-center', 'bottom-right'
			];
			
			if (position.position && !validPositions.includes(position.position)) {
				return res.status(400).json({ error: 'Invalid watermark position' });
			}
			
			// Validate x, y percentages (0-100)
			if (position.x !== undefined && (position.x < 0 || position.x > 100)) {
				return res.status(400).json({ error: 'Watermark x position must be between 0 and 100' });
			}
			
			if (position.y !== undefined && (position.y < 0 || position.y > 100)) {
				return res.status(400).json({ error: 'Watermark y position must be between 0 and 100' });
			}
			
			// Validate scale range (0.1 to 3.0)
			if (position.scale !== undefined && (position.scale < 0.1 || position.scale > 3.0)) {
				return res.status(400).json({ error: 'Watermark scale must be between 0.1 and 3.0' });
			}
			
			
			// Validate opacity range (0.1 to 1.0)
			if (position.opacity !== undefined && (position.opacity < 0.1 || position.opacity > 1.0)) {
				return res.status(400).json({ error: 'Watermark opacity must be between 0.1 and 1.0' });
			}
			
			updateExpressions.push('defaultWatermarkPosition = :defaultWatermarkPosition');
			expressionAttributeValues[':defaultWatermarkPosition'] = position;
		}
	}

	const updateExpression = `SET ${updateExpressions.join(', ')}`;

	try {
		logger?.debug('Updating business info', { 
			userId, 
			updateExpression, 
			expressionAttributeValues,
			fieldsToUpdate: Object.keys(req.body).filter(key => req.body[key] !== undefined)
		});

		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: updateExpression,
			ExpressionAttributeValues: expressionAttributeValues
		}));

		logger?.info('Business info updated successfully', { userId, updatedFields: updateExpressions });
		return res.json({ message: 'Business information updated successfully' });
	} catch (error: any) {
		logger?.error('Update business info failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return res.status(500).json({ error: 'Failed to update business information', message: error.message });
	}
});

router.post('/change-password', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const userPoolClientId = envProc?.env?.COGNITO_USER_POOL_CLIENT_ID as string;

	if (!userPoolId || !userPoolClientId) {
		return res.status(500).json({ error: 'Missing Cognito configuration' });
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const { currentPassword, newPassword } = req.body;

	if (!currentPassword || !newPassword) {
		return res.status(400).json({ error: 'currentPassword and newPassword are required' });
	}

	if (newPassword.length < 8) {
		return res.status(400).json({ error: 'Password must be at least 8 characters long' });
	}

	try {
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
				return res.status(401).json({ error: 'Current password is incorrect' });
			}
			throw authError;
		}

		await cognito.send(new AdminSetUserPasswordCommand({
			UserPoolId: userPoolId,
			Username: userId,
			Password: newPassword,
			Permanent: true
		}));

		logger?.info('Password changed successfully', { userId });
		return res.json({ message: 'Password changed successfully' });
	} catch (error: any) {
		logger?.error('Change password failed', {
			error: { name: error.name, message: error.message },
			userId
		});

		if (error.name === 'InvalidPasswordException') {
			return res.status(400).json({ error: 'New password does not meet requirements' });
		}

		return res.status(500).json({ error: 'Failed to change password', message: error.message });
	}
});

/**
 * Claim a tenant subdomain (one-time).
 * If the user already has a subdomain, this returns 409.
 */
router.post('/subdomain', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const subdomainsTable = envProc?.env?.SUBDOMAINS_TABLE as string;

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}
	if (!subdomainsTable) {
		return res.status(500).json({ error: 'Missing SUBDOMAINS_TABLE configuration' });
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const requested = normalizeSubdomain(req.body?.subdomain);
	const validation = validateSubdomain(requested);
	if (!validation.ok) {
		return res.status(400).json({ error: validation.message, code: validation.code });
	}

	try {
		// Enforce one-time set: if user already has a subdomain, don't allow overwrite
		const existingUser = await ddb.send(new GetCommand({ TableName: usersTable, Key: { userId } }));
		if (existingUser.Item?.subdomain) {
			return res.status(409).json({ error: 'Subdomain already set' });
		}

		const now = new Date().toISOString();
		await ddb.send(new PutCommand({
			TableName: subdomainsTable,
			Item: { subdomain: requested, userId, createdAt: now },
			ConditionExpression: 'attribute_not_exists(subdomain)'
		}));

		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET subdomain = :s, updatedAt = :u, createdAt = if_not_exists(createdAt, :u)',
			ExpressionAttributeValues: { ':s': requested, ':u': now }
		}));

		return res.json({ subdomain: requested });
	} catch (error: any) {
		if (error?.name === 'ConditionalCheckFailedException') {
			return res.status(409).json({ error: 'Subdomain is already taken' });
		}
		logger?.error('Claim subdomain failed', { userId, errorName: error?.name, errorMessage: error?.message });
		return res.status(500).json({ error: 'Failed to claim subdomain' });
	}
});

// User deletion endpoints moved to separate Lambda (userDeletion.ts):
// - POST /auth/request-deletion
// - POST /auth/cancel-deletion
// - GET /auth/deletion-status
// - GET /auth/undo-deletion/:token

// Dev endpoints (only available in dev/staging)
if (devSetUserLastLogin) {
	router.post('/dev/set-last-login/:userId', wrapHandler(devSetUserLastLogin.handler));
}

if (devTriggerUserDeletion) {
	router.post('/dev/trigger-deletion/:userId', wrapHandler(devTriggerUserDeletion.handler));
}

if (devTriggerInactivityScanner) {
	router.post('/dev/trigger-inactivity-scanner', wrapHandler(devTriggerInactivityScanner.handler));
}

export { router as authRoutes };

