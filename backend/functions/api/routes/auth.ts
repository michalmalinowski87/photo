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
		const businessInfo = {
			businessName: userData.businessName || '',
			email: userData.contactEmail || '',
			phone: userData.phone || '',
			address: userData.address || '',
			nip: userData.nip || '',
			welcomePopupShown: userData.welcomePopupShown === true,
			tutorialNextStepsDisabled: userData.tutorialNextStepsDisabled === true,
			tutorialClientSendDisabled: userData.tutorialClientSendDisabled === true
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

	const { businessName, email, phone, address, nip, welcomePopupShown, tutorialNextStepsDisabled, tutorialClientSendDisabled } = req.body;

	if (email !== undefined && email !== '' && email !== null) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return res.status(400).json({ error: 'Invalid email format' });
		}
	}

	let existingData: any = {};
	try {
		const getResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));
		existingData = getResult.Item || {};
	} catch (err) {
		logger?.info('User record not found, creating new', { userId });
	}

	const updateData: any = {
		userId,
		updatedAt: new Date().toISOString()
	};

	if (businessName !== undefined) {
		updateData.businessName = String(businessName).trim() || '';
	} else if (existingData.businessName !== undefined) {
		updateData.businessName = existingData.businessName;
	}

	if (email !== undefined) {
		updateData.contactEmail = email !== null && email !== '' ? email.trim().toLowerCase() : '';
	} else if (existingData.contactEmail !== undefined) {
		updateData.contactEmail = existingData.contactEmail;
	}

	if (phone !== undefined) {
		updateData.phone = String(phone).trim() || '';
	} else if (existingData.phone !== undefined) {
		updateData.phone = existingData.phone;
	}

	if (address !== undefined) {
		updateData.address = String(address).trim() || '';
	} else if (existingData.address !== undefined) {
		updateData.address = existingData.address;
	}

	if (nip !== undefined) {
		updateData.nip = String(nip).trim() || '';
	} else if (existingData.nip !== undefined) {
		updateData.nip = existingData.nip;
	}

	if (welcomePopupShown !== undefined) {
		updateData.welcomePopupShown = Boolean(welcomePopupShown);
	} else if (existingData.welcomePopupShown !== undefined) {
		updateData.welcomePopupShown = existingData.welcomePopupShown;
	}

	if (tutorialNextStepsDisabled !== undefined) {
		updateData.tutorialNextStepsDisabled = Boolean(tutorialNextStepsDisabled);
	} else if (existingData.tutorialNextStepsDisabled !== undefined) {
		updateData.tutorialNextStepsDisabled = existingData.tutorialNextStepsDisabled;
	}

	if (tutorialClientSendDisabled !== undefined) {
		updateData.tutorialClientSendDisabled = Boolean(tutorialClientSendDisabled);
	} else if (existingData.tutorialClientSendDisabled !== undefined) {
		updateData.tutorialClientSendDisabled = existingData.tutorialClientSendDisabled;
	}

	if (!existingData.createdAt) {
		updateData.createdAt = updateData.updatedAt;
	}

	try {
		await ddb.send(new PutCommand({
			TableName: usersTable,
			Item: updateData
		}));

		logger?.info('Business info updated successfully', { userId });
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

