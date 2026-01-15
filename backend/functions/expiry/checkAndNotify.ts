import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
import { createExpiryWarningEmail, createExpiryFinalWarningEmail } from '../../lib/src/email';
import { getSenderEmail } from '../../lib/src/email-config';
import { getConfigWithEnvFallback } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

import { lambdaLogger } from '../../../packages/logger/src';

async function getOwnerEmail(gallery: any, userPoolId: string | undefined, logger: any): Promise<string | undefined> {
	// First try ownerEmail from gallery record
	if (gallery.ownerEmail) {
		return gallery.ownerEmail;
	}

	// Fallback: get from Cognito
	if (userPoolId && gallery.ownerId) {
		try {
			const cognitoResponse = await cognito.send(new AdminGetUserCommand({
				UserPoolId: userPoolId,
				Username: gallery.ownerId
			}));
			const emailAttr = cognitoResponse.UserAttributes?.find((attr: any) => attr.Name === 'email');
			if (emailAttr?.Value) {
				return emailAttr.Value;
			}
		} catch (err: any) {
			logger.warn('Failed to get owner email from Cognito', {
				error: err.message,
				galleryId: gallery.galleryId,
				ownerId: gallery.ownerId
			});
		}
	}

	return undefined;
}

async function sendEmail(to: string, template: any, sender: string, logger: any, context: string) {
	try {
		const result = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [to] },
			Message: {
				Subject: { Data: template.subject },
				Body: {
					Text: { Data: template.text },
					Html: template.html ? { Data: template.html } : undefined
				}
			}
		}));
		logger.info(`SES email sent successfully - ${context}`, {
			messageId: result.MessageId,
			to,
			requestId: result.$metadata?.requestId
		});
		return true;
	} catch (err: any) {
		logger.error(`SES send failed - ${context}`, {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId
			},
			to
		});
		return false;
	}
}

/**
 * Helper function to atomically set expiry warning flag AFTER successful email send
 * Uses conditional update to prevent race conditions and duplicate sends
 * Only sets flag if it's not already set (prevents duplicates)
 */
async function setExpiryWarningFlag(
	galleriesTable: string,
	galleryId: string,
	flagName: 'expiryWarning7dSent' | 'expiryWarning24hSent',
	logger: any
): Promise<boolean> {
	try {
		// Use conditional update: only set flag if it's not already set
		// This prevents duplicate emails even if function runs concurrently
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: `SET ${flagName} = :sent`,
			ConditionExpression: `attribute_not_exists(${flagName}) OR ${flagName} <> :sent`,
			ExpressionAttributeValues: { ':sent': true }
		}));
		return true;
	} catch (updateErr: any) {
		// ConditionalCheckFailedException means flag was already set - this is OK
		if (updateErr.name === 'ConditionalCheckFailedException') {
			logger.info(`Expiry warning flag already set (skipping duplicate send)`, { 
				galleryId, 
				flagName 
			});
			return false; // Flag already set, don't send email
		}
		logger.warn(`Failed to update ${flagName} flag`, { 
			error: updateErr.message, 
			galleryId 
		});
		return false; // On error, log but don't fail - flag will be set on next successful send
	}
}

/**
 * Check if expiry warning flag is already set (without modifying it)
 * Used to skip processing if email was already sent
 */
async function isExpiryWarningFlagSet(
	galleriesTable: string,
	galleryId: string,
	flagName: 'expiryWarning7dSent' | 'expiryWarning24hSent',
	currentValue: boolean | undefined
): Promise<boolean> {
	// If we already have the value from the scan, use it (most common case)
	if (currentValue === true) {
		return true;
	}
	// If explicitly false or undefined, it's not set
	return false;
}

/**
 * Process galleries in batches with rate limiting
 */
async function processGalleryBatch(
	galleries: any[],
	batchSize: number,
	delayMs: number,
	processFn: (gallery: any) => Promise<void>
): Promise<void> {
	for (let i = 0; i < galleries.length; i += batchSize) {
		const batch = galleries.slice(i, i + batchSize);
		await Promise.all(batch.map(processFn));
		
		// Add delay between batches to avoid overwhelming SES
		if (i + batchSize < galleries.length) {
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}
}

import { getSenderEmail } from '../../lib/src/email-config';
import { getConfigWithEnvFallback } from '../../lib/src/ssm-config';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const sender = await getSenderEmail();
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const apiUrl = await getConfigWithEnvFallback(stage, 'PublicGalleryUrl', 'PUBLIC_GALLERY_URL') || '';
	
	if (!galleriesTable || !sender) return;

	const now = Date.now();
	const sevenDaysFromNow = now + 7 * 24 * 3600 * 1000;
	const twentyFourHoursFromNow = now + 24 * 3600 * 1000;
	
	// Rate limiting: Maximum emails per execution to prevent quota exhaustion
	// SES sandbox limit is 200/day, so we limit to 50 per run (4 runs/day = max 200)
	const MAX_EMAILS_PER_RUN = 50;
	let emailsSent = 0;
	
	// Scan galleries for expiry warnings
	// Note: Deletion is handled by EventBridge Scheduler, not this function
	// This function sends warning emails (7 days for paid, 24h for unpaid)
	// Using scan is acceptable here since:
	// 1. We run every 6 hours (4x per day) - reasonable cost vs frequency balance
	// 2. Most galleries won't match the filter (expiring in next 7 days)
	const allItems: any[] = [];
	let lastEvaluatedKey: any = undefined;
	
	// Scan all galleries
	do {
		const scanParams: any = {
			TableName: galleriesTable
		};
		
		if (lastEvaluatedKey) {
			scanParams.ExclusiveStartKey = lastEvaluatedKey;
		}
		
		const res = await ddb.send(new ScanCommand(scanParams));
		if (res.Items) {
			allItems.push(...res.Items);
		}
		lastEvaluatedKey = res.LastEvaluatedKey;
	} while (lastEvaluatedKey);
	
	logger.info('Found galleries to check for expiry warnings', { count: allItems.length });
	
	// Filter galleries that need expiry warnings
	const galleriesToProcess: any[] = [];
	
	for (const item of allItems) {
		const galleryId = item.galleryId as string;
		const galleryName = item.galleryName as string | undefined;
		const clientEmail = item.clientEmail as string | undefined;
		const expiresAt = item.expiresAt ? Date.parse(item.expiresAt as string) : undefined;
		const expiryWarning7dSent = item.expiryWarning7dSent as boolean | undefined;
		const expiryWarning24hSent = item.expiryWarning24hSent as boolean | undefined;
		const state = item.state as string | undefined;
		
		// Skip if no expiry date
		if (!expiresAt) {
			continue;
		}
		
		// Check payment status to determine if this is an UNPAID gallery
		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
		let isPaid = false;
		if (transactionsTable) {
			try {
				const { getPaidTransactionForGallery } = require('../../lib/src/transactions');
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch (err) {
				isPaid = state === 'PAID_ACTIVE';
			}
		} else {
			isPaid = state === 'PAID_ACTIVE';
		}
		
		const expiryDate = expiresAt;
		
		// Only process if expiry is within 7 days (for paid) or 24h (for unpaid)
		// Note: Actual deletion is handled by EventBridge Scheduler, not this function
		if (isPaid && expiryDate > sevenDaysFromNow) continue;
		if (!isPaid && expiryDate > twentyFourHoursFromNow) continue;
		
		// Skip already-expired galleries - EventBridge Scheduler will handle deletion
		if (expiryDate <= now) {
			logger.info('Gallery already expired - EventBridge Scheduler will handle deletion', { galleryId });
			continue;
		}
		
		// Skip test galleries - don't send expiry warnings for galleries with "Test" in the name
		// This prevents test galleries from consuming email quota
		const isTestGallery = galleryName?.toLowerCase().includes('test') || false;
		if (isTestGallery) {
			logger.info('Skipping test gallery (no expiry warnings)', { galleryId, galleryName });
			continue;
		}
		
		// Determine which warnings need to be sent
		const needs7dWarning = isPaid && expiryDate > now && expiryDate <= sevenDaysFromNow && !expiryWarning7dSent;
		const needs24hWarning = expiryDate > now && expiryDate <= twentyFourHoursFromNow && !expiryWarning24hSent;
		
		if (needs7dWarning || needs24hWarning) {
			galleriesToProcess.push({
				...item,
				galleryId,
				galleryName,
				clientEmail,
				expiryDate,
				isPaid,
				needs7dWarning,
				needs24hWarning,
				expiryWarning7dSent, // Include flag values for reliability checks
				expiryWarning24hSent
			});
		}
	}
	
	logger.info('Galleries requiring expiry warnings', { 
		total: galleriesToProcess.length,
		rateLimit: MAX_EMAILS_PER_RUN
	});
	
	// Process galleries in batches with rate limiting
	const BATCH_SIZE = 10; // Process 10 galleries at a time
	const BATCH_DELAY_MS = 1000; // 1 second delay between batches
	
	await processGalleryBatch(
		galleriesToProcess.slice(0, MAX_EMAILS_PER_RUN), // Limit to max emails per run
		BATCH_SIZE,
		BATCH_DELAY_MS,
		async (item: any) => {
			// Check rate limit before processing
			if (emailsSent >= MAX_EMAILS_PER_RUN) {
				logger.warn('Rate limit reached, skipping remaining galleries', { 
					emailsSent, 
					maxAllowed: MAX_EMAILS_PER_RUN 
				});
				return;
			}
			
			const { galleryId, galleryName, clientEmail, expiryDate, isPaid, needs7dWarning, needs24hWarning, expiryWarning7dSent, expiryWarning24hSent } = item;
			
			// Double-check: Skip test galleries (safety check in case they slipped through)
			const isTestGallery = galleryName?.toLowerCase().includes('test') || false;
			if (isTestGallery) {
				logger.info('Skipping test gallery in batch processing', { galleryId, galleryName });
				return;
			}
			
			const link = apiUrl ? `${apiUrl}/${galleryId}` : `https://your-frontend/${galleryId}`;
			const daysRemaining = Math.ceil((expiryDate - now) / (24 * 3600 * 1000));
			
			// Get owner email (from gallery or Cognito)
			const ownerEmail = await getOwnerEmail(item, userPoolId, logger);
			
			// Helper to check and increment email count
			const canSendEmail = (): boolean => emailsSent < MAX_EMAILS_PER_RUN;
			const recordEmailSent = (sent: boolean): void => {
				if (sent) emailsSent++;
			};
			
			// For UNPAID galleries: send 24h warning before expiry
			if (needs24hWarning && !isPaid && canSendEmail()) {
				// Check if flag is already set (from scan data)
				const alreadySent = await isExpiryWarningFlagSet(galleriesTable, galleryId, 'expiryWarning24hSent', expiryWarning24hSent);
				if (alreadySent) {
					return; // Already sent, skip
				}
				
				const template = createExpiryFinalWarningEmail(galleryId, galleryName || galleryId, link);
				
				// Send to photographer only (client doesn't need to know about unpaid drafts)
				if (ownerEmail) {
					const sent = await sendEmail(ownerEmail, template, sender, logger, 'UNPAID Gallery Expiry Warning 24h - Photographer');
					if (sent) {
						recordEmailSent(true);
						// Only set flag AFTER successful email send - ensures reliability
						await setExpiryWarningFlag(galleriesTable, galleryId, 'expiryWarning24hSent', logger);
					}
					// If email failed, flag remains unset so it will retry on next run
				}
			}
			
			// For paid galleries: 7-day warning
			if (needs7dWarning && isPaid) {
				// Check if flag is already set (from scan data)
				const alreadySent = await isExpiryWarningFlagSet(galleriesTable, galleryId, 'expiryWarning7dSent', expiryWarning7dSent);
				if (!alreadySent && canSendEmail()) {
					const template = createExpiryWarningEmail(galleryId, galleryName || galleryId, daysRemaining, link);
					let allEmailsSent = true;
					
					// Send to photographer
					if (ownerEmail && canSendEmail()) {
						const sent = await sendEmail(ownerEmail, template, sender, logger, 'Expiry Warning 7d - Photographer');
						if (sent) {
							recordEmailSent(true);
						} else {
							allEmailsSent = false;
						}
					}
					
					// Send to client
					if (clientEmail && canSendEmail()) {
						const sent = await sendEmail(clientEmail, template, sender, logger, 'Expiry Warning 7d - Client');
						if (sent) {
							recordEmailSent(true);
						} else {
							allEmailsSent = false;
						}
					}
					
					// Only set flag AFTER all emails sent successfully
					if (allEmailsSent) {
						await setExpiryWarningFlag(galleriesTable, galleryId, 'expiryWarning7dSent', logger);
					}
					// If any email failed, flag remains unset so it will retry on next run
				}
			}
			
			// For paid galleries: 24-hour warning
			if (needs24hWarning && isPaid && canSendEmail()) {
				// Check if flag is already set (from scan data)
				const alreadySent = await isExpiryWarningFlagSet(galleriesTable, galleryId, 'expiryWarning24hSent', expiryWarning24hSent);
				if (alreadySent) {
					return; // Already sent, skip
				}
				
				const template = createExpiryFinalWarningEmail(galleryId, galleryName || galleryId, link);
				let allEmailsSent = true;
				
				// Send to photographer
				if (ownerEmail && canSendEmail()) {
					const sent = await sendEmail(ownerEmail, template, sender, logger, 'Expiry Warning 24h - Photographer');
					if (sent) {
						recordEmailSent(true);
					} else {
						allEmailsSent = false;
					}
				}
				
				// Send to client
				if (clientEmail && canSendEmail()) {
					const sent = await sendEmail(clientEmail, template, sender, logger, 'Expiry Warning 24h - Client');
					if (sent) {
						recordEmailSent(true);
					} else {
						allEmailsSent = false;
					}
				}
				
				// Only set flag AFTER all emails sent successfully
				if (allEmailsSent) {
					await setExpiryWarningFlag(galleriesTable, galleryId, 'expiryWarning24hSent', logger);
				}
				// If any email failed, flag remains unset so it will retry on next run
			}
		}
	);
	
	logger.info('Expiry warning check completed', {
		totalGalleries: allItems.length,
		galleriesProcessed: Math.min(galleriesToProcess.length, MAX_EMAILS_PER_RUN),
		emailsSent,
		rateLimitReached: emailsSent >= MAX_EMAILS_PER_RUN
	});
});


