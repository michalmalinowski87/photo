import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getUserIdFromEvent } from '../../../lib/src/auth';
import { reqToEvent } from './helpers';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createUserDeletionSchedule, cancelUserDeletionSchedule } from '../../../lib/src/user-deletion-scheduler';
import { createDeletionRequestEmail, createDeletionCancelledEmail } from '../../../lib/src/email';
import { getConfigValueFromSsm, getRequiredConfigValue } from '../../../lib/src/ssm-config';
import { getSenderEmail } from '../../../lib/src/email-config';

const router = Router();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

router.post('/request-deletion', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const stage = envProc?.env?.STAGE as string || 'dev';
	
	let finalSender: string;
	let finalDashboardUrl: string;
	let finalApiUrl: string;
	let deletionLambdaArn: string | undefined;
	let scheduleRoleArn: string | undefined;
	let dlqArn: string | undefined;

	try {
		[finalSender, finalDashboardUrl, finalApiUrl, deletionLambdaArn, scheduleRoleArn, dlqArn] = await Promise.all([
			getRequiredConfigValue(stage, 'SenderEmail', { envVarName: 'SENDER_EMAIL' }),
			getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' }),
			getRequiredConfigValue(stage, 'PublicApiUrl', { envVarName: 'PUBLIC_API_URL' }),
			getConfigValueFromSsm(stage, 'UserDeletionLambdaArn'),
			getConfigValueFromSsm(stage, 'UserDeletionScheduleRoleArn'),
			getConfigValueFromSsm(stage, 'UserDeletionDlqArn'),
		]);
	} catch (error: any) {
		logger?.error('Missing configuration', { error: error.message });
		return res.status(500).json({ error: 'Missing configuration', message: error.message });
	}

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}
	if (!deletionLambdaArn || !scheduleRoleArn || !dlqArn) {
		return res.status(500).json({
			error: 'Missing deletion scheduler configuration',
			message:
				`Missing one or more required SSM parameters under /PhotoHub/${stage}: ` +
				'UserDeletionLambdaArn, UserDeletionScheduleRoleArn, UserDeletionDlqArn',
		});
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const { confirmationPhrase } = req.body;

	if (confirmationPhrase !== 'Potwierdzam') {
		return res.status(400).json({ error: 'Invalid confirmation phrase. Please type Potwierdzam to confirm.' });
	}

	try {
		// Get email from JWT claims
		const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
		const emailFromToken = claims.email || '';

		logger?.debug('Extracting email for deletion request', {
			userId,
			hasEmailInClaims: !!claims.email,
			emailFromToken: emailFromToken || 'not found'
		});

		// Get current user data
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));

		if (!userResult.Item) {
			return res.status(404).json({ error: 'User not found' });
		}

		const user = userResult.Item as any;

		// Check if already pending deletion
		if (user.status === 'pendingDeletion') {
			return res.status(400).json({ error: 'Deletion already scheduled', deletionScheduledAt: user.deletionScheduledAt });
		}

		const email = user.email || emailFromToken || '';
		
		logger?.debug('Email resolution for deletion', {
			userId,
			userEmail: user.email || 'not set',
			emailFromToken: emailFromToken || 'not found',
			resolvedEmail: email || 'NOT FOUND'
		});

		if (!email) {
			logger?.warn('Email not found for user deletion request', {
				userId,
				hasUserEmail: !!user.email,
				hasEmailFromToken: !!emailFromToken
			});
			return res.status(400).json({ error: 'Email not found. Please ensure your account has a valid email address.' });
		}

		// Calculate deletion date (3 days from now)
		const deletionScheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

		// Generate secure undo token
		const undoToken = randomBytes(32).toString('hex');

		// Update user status - preserve all existing data, only change status
		// IMPORTANT: Email should NOT be nullified here - only during actual deletion in performUserDeletion
		const updateData: any = {
			...user, // Preserve all existing fields
			userId,
			status: 'pendingDeletion',
			deletionScheduledAt,
			deletionReason: 'manual',
			deletionRequestedAt: new Date().toISOString(),
			undoToken,
			updatedAt: new Date().toISOString()
		};

		// Explicitly ensure email is preserved - never nullify during request phase
		// Email will only be nullified during actual deletion in performUserDeletion.ts
		if ('email' in user) {
			updateData.email = user.email;
		}

		await ddb.send(new PutCommand({
			TableName: usersTable,
			Item: updateData
		}));

		// Create EventBridge schedule
		if (deletionLambdaArn && scheduleRoleArn) {
			try {
				await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
				logger?.info('Created EventBridge schedule for user deletion', { userId, deletionScheduledAt });
			} catch (scheduleErr: any) {
				logger?.error('Failed to create EventBridge schedule for user deletion', {
					error: { name: scheduleErr.name, message: scheduleErr.message },
					userId,
					deletionScheduledAt
				});
				// Continue even if schedule creation fails - user is still marked for deletion
			}
		} else {
			logger?.warn('EventBridge Scheduler not configured - user deletion schedule not created', {
				userId,
				hasDeletionLambdaArn: !!deletionLambdaArn,
				hasScheduleRoleArn: !!scheduleRoleArn
			});
		}

		// Send confirmation email with undo link
		if (finalSender) {
			// Use frontend dashboard URL for undo deletion link (nicer URL, frontend handles the flow)
			const undoLink = `${finalDashboardUrl}/auth/undo-deletion/${undoToken}`;
			const emailTemplate = createDeletionRequestEmail(email, undoLink, deletionScheduledAt);
			
			try {
				await ses.send(new SendEmailCommand({
					Source: finalSender,
					Destination: { ToAddresses: [email] },
					Message: {
						Subject: { Data: emailTemplate.subject },
						Body: {
							Text: { Data: emailTemplate.text },
							Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
						}
					}
				}));
				logger?.info('Deletion request confirmation email sent', { userId, email });
			} catch (emailErr: any) {
				logger?.error('Failed to send deletion request confirmation email', {
					error: { name: emailErr.name, message: emailErr.message },
					userId,
					email
				});
				// Continue even if email fails - deletion is still scheduled
			}
		}

		logger?.info('User deletion requested', { userId, deletionScheduledAt });
		return res.json({
			deletionScheduledAt,
			status: 'pendingDeletion'
		});
	} catch (error: any) {
		logger?.error('Request deletion failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return res.status(500).json({ error: 'Failed to request deletion', message: error.message });
	}
});

router.post('/cancel-deletion', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const sender = await getSenderEmail();

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}

	const event = reqToEvent(req);
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	try {
		// Get current user data
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));

		if (!userResult.Item) {
			return res.status(404).json({ error: 'User not found' });
		}

		const user = userResult.Item as any;

		// Check if deletion is pending
		if (user.status !== 'pendingDeletion') {
			return res.status(400).json({ error: 'No pending deletion to cancel' });
		}

		// Cancel EventBridge schedule
		try {
			await cancelUserDeletionSchedule(userId);
			logger?.info('Canceled EventBridge schedule for user deletion', { userId });
		} catch (scheduleErr: any) {
			logger?.warn('Failed to cancel EventBridge schedule (may not exist)', {
				error: scheduleErr.message,
				userId
			});
			// Continue even if schedule cancellation fails
		}

		// Update user status - user was never deleted, only status changed, so just update status and clear deletion fields
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE deletionScheduledAt, deletionReason, deletionRequestedAt, undoToken',
			ExpressionAttributeNames: {
				'#status': 'status'
			},
			ExpressionAttributeValues: {
				':status': 'active',
				':updatedAt': new Date().toISOString()
			}
		}));

		// Send cancellation email
		const userEmail = user.email;
		if (sender && userEmail) {
			const emailTemplate = createDeletionCancelledEmail(userEmail);
			
			try {
				await ses.send(new SendEmailCommand({
					Source: sender,
					Destination: { ToAddresses: [userEmail] },
					Message: {
						Subject: { Data: emailTemplate.subject },
						Body: {
							Text: { Data: emailTemplate.text },
							Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
						}
					}
				}));
				logger?.info('Deletion cancellation email sent', { userId, email: userEmail });
			} catch (emailErr: any) {
				logger?.error('Failed to send deletion cancellation email', {
					error: { name: emailErr.name, message: emailErr.message },
					userId,
					email: userEmail
				});
				// Continue even if email fails
			}
		}

		logger?.info('User deletion cancelled', { userId });
		return res.json({ message: 'Deletion cancelled successfully' });
	} catch (error: any) {
		logger?.error('Cancel deletion failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return res.status(500).json({ error: 'Failed to cancel deletion', message: error.message });
	}
});

router.get('/deletion-status', async (req: Request, res: Response) => {
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

		if (!result.Item) {
			return res.status(404).json({ error: 'User not found' });
		}

		const user = result.Item as any;
		const status = user.status || 'active';

		return res.json({
			status,
			deletionScheduledAt: user.deletionScheduledAt,
			deletionReason: user.deletionReason
		});
	} catch (error: any) {
		logger?.error('Get deletion status failed', {
			error: { name: error.name, message: error.message },
			userId
		});
		return res.status(500).json({ error: 'Failed to get deletion status', message: error.message });
	}
});

// Public undo deletion route (no auth required - uses token in URL)
const publicUndoDeletionRouter = Router();
publicUndoDeletionRouter.get('/undo-deletion/:token', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const sender = await getSenderEmail();
	let dashboardUrl: string;
	try {
		dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
	} catch (error: any) {
		logger?.error('Missing configuration', { error: error.message });
		return res.status(500).json({ error: 'Missing configuration', message: error.message });
	}

	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}

	const token = req.params.token;
	if (!token) {
		return res.status(400).json({ error: 'Token is required' });
	}

	try {
		// Scan for user with matching token (token is stored in user record)
		// Note: In production, consider using a separate table with token as partition key for better performance
		const scanResult = await ddb.send(new ScanCommand({
			TableName: usersTable,
			FilterExpression: 'undoToken = :token AND #status = :status',
			ExpressionAttributeNames: {
				'#status': 'status'
			},
			ExpressionAttributeValues: {
				':token': token,
				':status': 'pendingDeletion'
			}
		}));

		if (!scanResult.Items || scanResult.Items.length === 0) {
			return res.status(404).json({ error: 'Invalid or expired token' });
		}

		const user = scanResult.Items[0] as any;
		const userId = user.userId;

		// Check if deletion time has elapsed
		if (user.deletionScheduledAt) {
			const deletionDate = new Date(user.deletionScheduledAt);
			const now = new Date();
			if (deletionDate <= now) {
				return res.status(400).json({ 
					error: 'Deletion has already been processed',
					message: 'Deletion has already been processed. Your account cannot be restored.',
					deletionDate: user.deletionScheduledAt
				});
			}
		}

		// Cancel EventBridge schedule
		try {
			await cancelUserDeletionSchedule(userId);
			logger?.info('Canceled EventBridge schedule for user deletion', { userId });
		} catch (scheduleErr: any) {
			logger?.warn('Failed to cancel EventBridge schedule (may not exist)', {
				error: scheduleErr.message,
				userId
			});
			// Continue even if schedule cancellation fails
		}

		// Update user status - user was never deleted, only status changed, so just update status and clear deletion fields
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE deletionScheduledAt, deletionReason, deletionRequestedAt, undoToken',
			ExpressionAttributeNames: {
				'#status': 'status'
			},
			ExpressionAttributeValues: {
				':status': 'active',
				':updatedAt': new Date().toISOString()
			}
		}));

		// Send cancellation email
		const userEmail = user.email;
		if (sender && userEmail) {
			const emailTemplate = createDeletionCancelledEmail(userEmail);
			
			try {
				await ses.send(new SendEmailCommand({
					Source: sender,
					Destination: { ToAddresses: [userEmail] },
					Message: {
						Subject: { Data: emailTemplate.subject },
						Body: {
							Text: { Data: emailTemplate.text },
							Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
						}
					}
				}));
				logger?.info('Deletion cancellation email sent', { userId, email: userEmail });
			} catch (emailErr: any) {
				logger?.error('Failed to send deletion cancellation email', {
					error: { name: emailErr.name, message: emailErr.message },
					userId,
					email: userEmail
				});
				// Continue even if email fails
			}
		}

		logger?.info('User deletion cancelled via token', { userId });

		// Return HTML page for user to see confirmation
		const loginUrl = `${dashboardUrl}/login`;
		return res.status(200).send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Usunięcie konta anulowane</title>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
					.success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 4px; margin: 20px 0; }
					.button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
				</style>
			</head>
			<body>
				<h1>Usunięcie konta zostało anulowane</h1>
				<div class="success">
					<p><strong>Sukces!</strong> Usunięcie Twojego konta zostało pomyślnie anulowane.</p>
					<p>Twoje konto pozostaje aktywne i możesz z niego normalnie korzystać.</p>
				</div>
				<p>Zostaniesz wylogowany i będziesz mógł zalogować się ponownie z pełnym dostępem do konta.</p>
				<a href="${loginUrl}" class="button">Przejdź do logowania</a>
			</body>
			</html>
		`);
	} catch (error: any) {
		logger?.error('Undo deletion failed', {
			error: { name: error.name, message: error.message },
			token
		});
		return res.status(500).json({ error: 'Failed to undo deletion', message: error.message });
	}
});

export { router as userDeletionRoutes };
export { publicUndoDeletionRouter as undoDeletionPublicRoutes };

