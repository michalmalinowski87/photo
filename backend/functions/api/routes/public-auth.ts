import { Router, Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, SignUpCommand, ResendConfirmationCodeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand, AdminGetUserCommand, ConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getRequiredConfigValue } from '../../../lib/src/ssm-config';
import { getCompanyConfig } from '../../../lib/src/company-config';
import { getSenderEmail } from '../../../lib/src/email-config';
import { createWelcomeEmail, createReferralProgramInfoEmail } from '../../../lib/src/email';
import { sendRawEmailWithAttachments } from '../../../lib/src/raw-email';
import { findUserIdByReferralCode } from '../../../lib/src/referral';

const router = Router();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

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

const MAX_CODES_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Check rate limit for email verification codes
 * Returns { allowed: boolean, remainingCodes: number, resetAt: number | null }
 * 
 * TTL is set at record creation (first attempt) to 1 hour from that moment.
 * If TTL has elapsed (even if DynamoDB hasn't deleted it yet due to scheduler delay),
 * we delete the record and start fresh.
 */
async function checkRateLimit(email: string, rateLimitTable: string): Promise<{ allowed: boolean; remainingCodes: number; resetAt: number | null }> {
	const normalizedEmail = email.toLowerCase().trim();
	
	try {
		const result = await ddb.send(new GetCommand({
			TableName: rateLimitTable,
			Key: { email: normalizedEmail }
		}));

		if (!result.Item) {
			// No rate limit record exists, allow the request
			return { allowed: true, remainingCodes: MAX_CODES_PER_HOUR, resetAt: null };
		}

		const record = result.Item;
		const now = Date.now();
		const nowInSeconds = Math.floor(now / 1000);

		// Check if TTL has elapsed (accounting for DynamoDB scheduler delay)
		// If TTL is in the past, delete the record and start fresh
		if (record.ttl && record.ttl < nowInSeconds) {
			// TTL has elapsed, delete the record and allow fresh start
			try {
				await ddb.send(new DeleteCommand({
					TableName: rateLimitTable,
					Key: { email: normalizedEmail }
				}));
			} catch (deleteError: any) {
				// Log but continue - record will be cleaned up by DynamoDB eventually
				const logger = (req as any).logger;
				logger?.warn('Failed to delete expired rate limit record', {
					email: normalizedEmail,
					error: deleteError.message
				}, deleteError);
			}
			return { allowed: true, remainingCodes: MAX_CODES_PER_HOUR, resetAt: null };
		}

		const windowStart = now - RATE_LIMIT_WINDOW_MS;

		// Filter out codes sent outside the current window
		const recentCodes = (record.codes || []).filter((timestamp: number) => timestamp > windowStart);

		if (recentCodes.length >= MAX_CODES_PER_HOUR) {
			// Rate limit exceeded
			// Reset time is based on when the TTL expires (1 hour from record creation)
			const resetAt = record.ttl ? record.ttl * 1000 : now + RATE_LIMIT_WINDOW_MS;
			return { 
				allowed: false, 
				remainingCodes: 0, 
				resetAt 
			};
		}

		// Update the record to remove old codes (but keep the original TTL)
		if (recentCodes.length < record.codes.length) {
			await ddb.send(new UpdateCommand({
				TableName: rateLimitTable,
				Key: { email: normalizedEmail },
				UpdateExpression: 'SET codes = :codes',
				ExpressionAttributeValues: {
					':codes': recentCodes
				}
			}));
		}

		// Reset time is based on when the TTL expires (1 hour from record creation)
		const resetAt = record.ttl ? record.ttl * 1000 : null;

		return { 
			allowed: true, 
			remainingCodes: MAX_CODES_PER_HOUR - recentCodes.length, 
			resetAt 
		};
	} catch (error: any) {
		// On error, log but allow the request (fail open for availability)
		const logger = (req as any).logger;
		logger?.error('Rate limit check failed', {
			email: normalizedEmail,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		return { allowed: true, remainingCodes: MAX_CODES_PER_HOUR, resetAt: null };
	}
}

/**
 * Record a code send event for rate limiting
 * 
 * TTL is set to exactly 1 hour from now when creating a new record.
 * For existing records, we preserve the original TTL (set at record creation).
 */
async function recordCodeSend(email: string, rateLimitTable: string): Promise<void> {
	const normalizedEmail = email.toLowerCase().trim();
	const now = Date.now();
	const nowInSeconds = Math.floor(now / 1000);

	try {
		const result = await ddb.send(new GetCommand({
			TableName: rateLimitTable,
			Key: { email: normalizedEmail }
		}));

		const existingRecord = result.Item;
		const windowStart = now - RATE_LIMIT_WINDOW_MS;

		// Check if we need to create a new record (no existing record or TTL expired)
		const shouldCreateNewRecord = !existingRecord || 
			(existingRecord.ttl && existingRecord.ttl < nowInSeconds);

		if (shouldCreateNewRecord) {
			// Create a new record with TTL set to 1 hour from now
			const ttl = nowInSeconds + Math.floor(RATE_LIMIT_WINDOW_MS / 1000);
			await ddb.send(new PutCommand({
				TableName: rateLimitTable,
				Item: {
					email: normalizedEmail,
					codes: [now],
					ttl: ttl,
					lastSent: new Date(now).toISOString()
				}
			}));
		} else {
			// Update existing record - preserve original TTL, just add new code
			const existingCodes = (existingRecord.codes || []).filter((timestamp: number) => timestamp > windowStart);
			const updatedCodes = [...existingCodes, now];

			await ddb.send(new PutCommand({
				TableName: rateLimitTable,
				Item: {
					email: normalizedEmail,
					codes: updatedCodes,
					ttl: existingRecord.ttl, // Preserve original TTL set at record creation
					lastSent: new Date(now).toISOString()
				}
			}));
		}
	} catch (error: any) {
		// Log error but don't fail the request
		const logger = (req as any).logger;
		logger?.error('Failed to record code send', {
			email: normalizedEmail,
			errorName: error.name,
			errorMessage: error.message
		}, error);
	}
}

/**
 * Public endpoint for signup with rate limiting
 */
router.post('/signup', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	// Use COGNITO_USER_POOL_CLIENT_ID (from infra) or COGNITO_CLIENT_ID (fallback)
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;
	const rateLimitTable = envProc?.env?.EMAIL_CODE_RATE_LIMIT_TABLE as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}

	if (!rateLimitTable) {
		return res.status(500).json({ error: 'Missing rate limit table configuration' });
	}

	const { email, password, consents } = req.body ?? {};

	if (!email || !password) {
		return res.status(400).json({ error: 'Email and password are required' });
	}

	// Require legal consents (fail closed)
	if (
		!consents ||
		!consents.terms?.version ||
		!consents.terms?.acceptedAt ||
		!consents.privacy?.version ||
		!consents.privacy?.acceptedAt
	) {
		return res.status(400).json({ error: 'Legal consents are required' });
	}

	const normalizedEmail = email.toLowerCase().trim();

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(normalizedEmail, rateLimitTable);
	if (!rateLimit.allowed) {
		const resetAt = rateLimit.resetAt || Date.now() + RATE_LIMIT_WINDOW_MS;
		const minutesUntilReset = Math.ceil((resetAt - Date.now()) / (60 * 1000));
		
		logger?.warn('Signup rate limit exceeded', { email: normalizedEmail });
		return res.status(429).json({ 
			error: 'Sprawdź swoją skrzynkę email - kod weryfikacyjny mógł już dotrzeć. Sprawdź również folder spam. Jeśli nie otrzymałeś kodu, możesz spróbować ponownie za ' + minutesUntilReset + ' minut.',
			code: 'RATE_LIMIT_EXCEEDED',
			resetAt: resetAt,
			minutesUntilReset: minutesUntilReset
		});
	}

	try {
		// Use public SignUp API - sends verification code, user stays in UNCONFIRMED state
		await cognito.send(new SignUpCommand({
			ClientId: clientId,
			Username: normalizedEmail,
			Password: password,
			UserAttributes: [
				{ Name: 'email', Value: normalizedEmail }
			]
		}));

		// Record the code send for rate limiting
		await recordCodeSend(normalizedEmail, rateLimitTable);

		logger?.info('Signup successful', { email: normalizedEmail });
		return res.json({ message: 'Account created successfully. Verification code sent to email. Please check spam folder too.' });
	} catch (error: any) {
		logger?.error('Signup failed', {
			error: { name: error.name, message: error.message },
			email: normalizedEmail
		});

		if (error.name === 'UsernameExistsException') {
			return res.status(409).json({ error: 'User already exists' });
		}
		if (error.name === 'InvalidPasswordException') {
			return res.status(400).json({ error: 'Password does not meet requirements' });
		}
		if (error.name === 'InvalidParameterException') {
			return res.status(400).json({ error: 'Invalid parameters' });
		}

		return res.status(500).json({ error: 'Failed to create account', message: error.message });
	}
});

/**
 * Extract client identifier (IP address) from request
 * Falls back to 'unknown' if IP is not available
 */
function getClientId(req: Request): string {
	const ip = req.ip || (req as any).requestContext?.identity?.sourceIp || '';
	return ip || 'unknown';
}

/**
 * Check if a client (by IP) is shadow-banned (too many failed validation attempts)
 * Returns { shadowBanned: boolean, ttl?: number }
 */
async function checkClientShadowBan(clientId: string, validationTable: string): Promise<{ shadowBanned: boolean; ttl?: number }> {
	const now = Date.now();
	const nowInSeconds = Math.floor(now / 1000);

	try {
		const result = await ddb.send(new GetCommand({
			TableName: validationTable,
			Key: { clientId }
		}));

		if (!result.Item) {
			return { shadowBanned: false };
		}

		const record = result.Item;
		
		// Check if TTL has elapsed
		if (record.ttl && record.ttl < nowInSeconds) {
			// TTL expired, delete and allow validation
			try {
				await ddb.send(new DeleteCommand({
					TableName: validationTable,
					Key: { clientId }
				}));
			} catch (deleteError: any) {
				// Log but continue - record will be cleaned up by DynamoDB eventually
				// Note: logger not available in helper function, errors will be logged at call site
			}
			return { shadowBanned: false };
		}

		// Check the actual shadowBanned flag - only shadow-ban if explicitly set to true
		const isShadowBanned = record.shadowBanned === true;
		return { shadowBanned: isShadowBanned, ttl: record.ttl };
	} catch (error: any) {
		// On error, log but allow validation (fail open) - errors logged at call site
		return { shadowBanned: false };
	}
}

/**
 * Record a failed referral code validation attempt for a client (by IP)
 * If this is the Nth failure in 24h, shadow-ban the client for 24h
 * Only tracks failures to avoid shadow-banning legitimate users on shared IPs (e.g., public computers)
 */
async function recordClientValidationFailure(clientId: string, validationTable: string): Promise<void> {
	const now = Date.now();
	const nowInSeconds = Math.floor(now / 1000);
	const SHADOW_BAN_THRESHOLD = 5; // Shadow-ban after 5 failed attempts
	const SHADOW_BAN_TTL_SECONDS = 24 * 60 * 60; // 24 hours
	const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

	if (!validationTable) {
		throw new Error(`Validation table name is missing. clientId: ${clientId}`);
	}

	if (!clientId || clientId === 'unknown') {
		throw new Error(`Invalid clientId: ${clientId}. Cannot record validation failure.`);
	}

	try {
		const getResult = await ddb.send(new GetCommand({
			TableName: validationTable,
			Key: { clientId }
		}));

		const existingRecord = getResult.Item;
		const windowStart = now - WINDOW_MS;

		// Filter out failures outside the current window
		const recentFailures = (existingRecord?.failures || []).filter((timestamp: number) => timestamp > windowStart);
		const updatedFailures = [...recentFailures, now];

		// Check if we should shadow-ban (threshold reached)
		const shouldShadowBan = updatedFailures.length >= SHADOW_BAN_THRESHOLD;
		const ttl = shouldShadowBan ? nowInSeconds + SHADOW_BAN_TTL_SECONDS : (existingRecord?.ttl || nowInSeconds + SHADOW_BAN_TTL_SECONDS);

		const putItem = {
			clientId,
			failures: updatedFailures,
			ttl: ttl,
			shadowBanned: shouldShadowBan,
			lastFailure: new Date(now).toISOString()
		};

		const putResult = await ddb.send(new PutCommand({
			TableName: validationTable,
			Item: putItem
		}));

		// Verify write succeeded (PutCommand doesn't throw on success, but we can check for errors)
		if (!putResult) {
			throw new Error('PutCommand returned undefined result');
		}

		if (shouldShadowBan) {
			// Log shadow-ban at call site, but also log here for debugging
			const logger = (globalThis as any).process?.env?.STAGE ? undefined : console;
			logger?.warn('Client shadow-banned', { clientId, failureCount: updatedFailures.length });
		}
	} catch (error: any) {
		// Re-throw error with more context so call site can log it properly
		const enhancedError = new Error(`Failed to record validation failure: ${error?.message || 'Unknown error'}. Table: ${validationTable}, ClientId: ${clientId}`);
		(enhancedError as any).originalError = error;
		(enhancedError as any).errorName = error?.name;
		(enhancedError as any).errorCode = error?.code;
		throw enhancedError;
	}
}

/**
 * Public endpoint to validate referral code before signup
 * Prevents creating Cognito account if referral code is invalid
 * Implements shadow-banning for clients (by IP) after 5 failed validation attempts
 * Only tracks failures to avoid shadow-banning legitimate users on shared IPs (e.g., public computers)
 */
router.post('/validate-referral-code', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process || process;
	const validationTable = envProc?.env?.REFERRAL_CODE_VALIDATION_TABLE as string;

	if (!validationTable) {
		return res.status(500).json({ error: 'Missing referral code validation table configuration' });
	}

	const { referralCode: referralCodeBody } = req.body ?? {};
	const referralCode = typeof referralCodeBody === 'string' ? referralCodeBody.trim().toUpperCase() : undefined;

	if (!referralCode) {
		return res.status(400).json({ error: 'Referral code is required' });
	}

	const clientId = getClientId(req);
	
	// Log table and client info for debugging
	logger?.debug('Validation request received', { 
		clientId, 
		validationTable, 
		referralCode: referralCode.slice(0, 8),
		tableConfigured: !!validationTable,
		clientIdValid: !!(clientId && clientId !== 'unknown')
	});

	// Check if client (by IP) is shadow-banned and validate referral code in parallel for better performance
	const [shadowBanCheck, referrerUserId] = await Promise.all([
		checkClientShadowBan(clientId, validationTable).catch((err) => {
			logger?.warn('Shadow-ban check failed, allowing validation', { clientId, error: err?.message });
			return { shadowBanned: false };
		}),
		findUserIdByReferralCode(referralCode).catch(() => null) // Catch errors and return null
	]);

	if (shadowBanCheck.shadowBanned) {
		logger?.info('Referral code validation rejected (client shadow-banned)', { clientId, referralCode: referralCode.slice(0, 8) });
		return res.status(400).json({
			error: 'The referral code is no longer valid. The referrer account may have been removed.',
			code: 'REFERRER_ACCOUNT_REMOVED'
		});
	}

	// Validate referral code result
	if (referrerUserId === null) {
		logger?.warn('Referral code validation failed (not found)', { clientId, referralCode: referralCode.slice(0, 8), validationTable });
		// Record failure and shadow-ban if threshold reached
		try {
			logger?.info('Attempting to record validation failure', { 
				clientId, 
				validationTable, 
				referralCode: referralCode.slice(0, 8),
				tableExists: !!validationTable,
				clientIdValid: !!(clientId && clientId !== 'unknown')
			});
			await recordClientValidationFailure(clientId, validationTable);
			logger?.info('Validation failure recorded successfully', { 
				clientId, 
				referralCode: referralCode.slice(0, 8),
				validationTable
			});
		} catch (recordErr: any) {
			// Log detailed error - this is critical for debugging
			logger?.error('CRITICAL: Failed to record validation failure', { 
				clientId, 
				validationTable,
				error: recordErr?.message, 
				errorName: recordErr?.name,
				errorCode: recordErr?.code,
				awsErrorCode: recordErr?.$metadata?.httpStatusCode,
				stack: recordErr?.stack,
				originalError: recordErr?.originalError,
				referralCode: referralCode.slice(0, 8)
			});
			// Don't fail the request - user should still get error response
		}
		return res.status(400).json({
			error: 'The referral code is no longer valid. The referrer account may have been removed.',
			code: 'REFERRER_ACCOUNT_REMOVED'
		});
	}

	// Code is valid - don't record as failure (allows legitimate users on shared IPs)
	logger?.info('Referral code validated successfully', { clientId, referralCode: referralCode.slice(0, 8) });
	return res.json({ valid: true, message: 'Referral code is valid' });
});

/**
 * Public endpoint for resending verification code with rate limiting
 */
router.post('/resend-verification-code', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	// Use COGNITO_USER_POOL_CLIENT_ID (from infra) or COGNITO_CLIENT_ID (fallback)
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;
	const rateLimitTable = envProc?.env?.EMAIL_CODE_RATE_LIMIT_TABLE as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}

	if (!rateLimitTable) {
		return res.status(500).json({ error: 'Missing rate limit table configuration' });
	}

	const { email } = req.body;

	if (!email) {
		return res.status(400).json({ error: 'Email is required' });
	}

	const normalizedEmail = email.toLowerCase().trim();

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(normalizedEmail, rateLimitTable);
	if (!rateLimit.allowed) {
		const resetAt = rateLimit.resetAt || Date.now() + RATE_LIMIT_WINDOW_MS;
		const minutesUntilReset = Math.ceil((resetAt - Date.now()) / (60 * 1000));
		
		logger?.warn('Resend code rate limit exceeded', { email: normalizedEmail });
		return res.status(429).json({ 
			error: 'Sprawdź swoją skrzynkę email - kod weryfikacyjny mógł już dotrzeć. Sprawdź również folder spam i wszystkie wcześniejsze wiadomości. Jeśli nadal nie możesz znaleźć kodu, możesz spróbować ponownie za ' + minutesUntilReset + ' minut.',
			code: 'RATE_LIMIT_EXCEEDED',
			resetAt: resetAt,
			minutesUntilReset: minutesUntilReset
		});
	}

	try {
		// Use public ResendConfirmationCode API - now works with AutoVerifiedAttributes enabled
		await cognito.send(new ResendConfirmationCodeCommand({
			ClientId: clientId,
			Username: normalizedEmail
		}));

		// Record the code send for rate limiting
		await recordCodeSend(normalizedEmail, rateLimitTable);

		logger?.info('Verification code resent', { email: normalizedEmail });
		return res.json({ message: 'Kod weryfikacyjny został wysłany ponownie' });
	} catch (error: any) {
		logger?.error('Resend verification code failed', {
			error: { name: error.name, message: error.message },
			email: normalizedEmail
		});

		if (error.name === 'UserNotFoundException') {
			// Don't leak existence - still count rate limit but return success message
			await recordCodeSend(normalizedEmail, rateLimitTable);
			return res.json({ message: 'Jeśli konto istnieje, kod został wysłany' });
		}
		if (error.name === 'LimitExceededException') {
			return res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj za godzinę.' });
		}
		if (error.name === 'InvalidParameterException') {
			return res.status(400).json({ error: 'Invalid email address' });
		}

		return res.status(500).json({ error: 'Failed to resend verification code', message: error.message });
	}
});

/**
 * Public endpoint for initiating password reset with rate limiting
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	// Use COGNITO_USER_POOL_CLIENT_ID (from infra) or COGNITO_CLIENT_ID (fallback)
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;
	const rateLimitTable = envProc?.env?.EMAIL_CODE_RATE_LIMIT_TABLE as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}

	if (!rateLimitTable) {
		return res.status(500).json({ error: 'Missing rate limit table configuration' });
	}

	const { email } = req.body;

	if (!email) {
		return res.status(400).json({ error: 'Email is required' });
	}

	const normalizedEmail = email.toLowerCase().trim();

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(normalizedEmail, rateLimitTable);
	if (!rateLimit.allowed) {
		const resetAt = rateLimit.resetAt || Date.now() + RATE_LIMIT_WINDOW_MS;
		const minutesUntilReset = Math.ceil((resetAt - Date.now()) / (60 * 1000));
		
		logger?.warn('Password reset rate limit exceeded', { email: normalizedEmail });
		return res.status(429).json({ 
			error: 'Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć. Sprawdź również folder spam. Jeśli nie otrzymałeś kodu, możesz spróbować ponownie za ' + minutesUntilReset + ' minut.',
			code: 'RATE_LIMIT_EXCEEDED',
			resetAt: resetAt,
			minutesUntilReset: minutesUntilReset
		});
	}

	// Check if user exists first (using admin API to avoid sending email if user doesn't exist)
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	let userExists = false;

	if (userPoolId) {
		try {
			await cognito.send(new AdminGetUserCommand({
				UserPoolId: userPoolId,
				Username: normalizedEmail
			}));
			userExists = true;
		} catch (checkError: any) {
			// User doesn't exist - don't send email but still return success
			if (checkError.name === 'UserNotFoundException') {
				userExists = false;
			} else {
				// Other error checking user - log but continue (fail open for availability)
				logger?.warn('Failed to check user existence', {
					error: { name: checkError.name, message: checkError.message },
					email: normalizedEmail
				});
				// Assume user exists to be safe (but we'll catch errors from ForgotPassword)
				userExists = true;
			}
		}
	}

	// Only send email if user exists
	if (userExists) {
		try {
			// Use public ForgotPassword API - sends verification code to email
			await cognito.send(new ForgotPasswordCommand({
				ClientId: clientId,
				Username: normalizedEmail
			}));

			// Record the code send for rate limiting
			await recordCodeSend(normalizedEmail, rateLimitTable);

			logger?.info('Password reset code sent', { email: normalizedEmail });
		} catch (error: any) {
			logger?.error('Password reset failed', {
				error: { name: error.name, message: error.message },
				email: normalizedEmail
			});

			// Handle specific errors but still return success to prevent user enumeration
			if (error.name === 'LimitExceededException') {
				return res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj za godzinę.' });
			}
			if (error.name === 'InvalidParameterException') {
				return res.status(400).json({ error: 'Invalid email address' });
			}

			// For other errors, still record rate limit and return success
			await recordCodeSend(normalizedEmail, rateLimitTable);
		}
	} else {
		// User doesn't exist - still record rate limit to prevent enumeration
		await recordCodeSend(normalizedEmail, rateLimitTable);
		logger?.info('Password reset requested for non-existent user', { email: normalizedEmail });
	}

	// Always return success message to prevent user enumeration
	return res.json({ message: 'Jeśli konto istnieje, kod resetowania hasła został wysłany na adres email.' });
});

/**
 * Public endpoint for resending password reset code with rate limiting
 */
router.post('/resend-reset-code', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	// Use COGNITO_USER_POOL_CLIENT_ID (from infra) or COGNITO_CLIENT_ID (fallback)
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;
	const rateLimitTable = envProc?.env?.EMAIL_CODE_RATE_LIMIT_TABLE as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}

	if (!rateLimitTable) {
		return res.status(500).json({ error: 'Missing rate limit table configuration' });
	}

	const { email } = req.body;

	if (!email) {
		return res.status(400).json({ error: 'Email is required' });
	}

	const normalizedEmail = email.toLowerCase().trim();

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(normalizedEmail, rateLimitTable);
	if (!rateLimit.allowed) {
		const resetAt = rateLimit.resetAt || Date.now() + RATE_LIMIT_WINDOW_MS;
		const minutesUntilReset = Math.ceil((resetAt - Date.now()) / (60 * 1000));
		
		logger?.warn('Resend reset code rate limit exceeded', { email: normalizedEmail });
		return res.status(429).json({ 
			error: 'Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć. Sprawdź również folder spam i wszystkie wcześniejsze wiadomości. Jeśli nadal nie możesz znaleźć kodu, możesz spróbować ponownie za ' + minutesUntilReset + ' minut.',
			code: 'RATE_LIMIT_EXCEEDED',
			resetAt: resetAt,
			minutesUntilReset: minutesUntilReset
		});
	}

	// Check if user exists first (using admin API to avoid sending email if user doesn't exist)
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	let userExists = false;

	if (userPoolId) {
		try {
			await cognito.send(new AdminGetUserCommand({
				UserPoolId: userPoolId,
				Username: normalizedEmail
			}));
			userExists = true;
		} catch (checkError: any) {
			// User doesn't exist - don't send email but still return success
			if (checkError.name === 'UserNotFoundException') {
				userExists = false;
			} else {
				// Other error checking user - log but continue (fail open for availability)
				logger?.warn('Failed to check user existence', {
					error: { name: checkError.name, message: checkError.message },
					email: normalizedEmail
				});
				// Assume user exists to be safe (but we'll catch errors from ForgotPassword)
				userExists = true;
			}
		}
	}

	// Only send email if user exists
	if (userExists) {
		try {
			// Use public ForgotPassword API again - same API as initial request
			await cognito.send(new ForgotPasswordCommand({
				ClientId: clientId,
				Username: normalizedEmail
			}));

			// Record the code send for rate limiting
			await recordCodeSend(normalizedEmail, rateLimitTable);

			logger?.info('Password reset code resent', { email: normalizedEmail });
		} catch (error: any) {
			logger?.error('Resend reset code failed', {
				error: { name: error.name, message: error.message },
				email: normalizedEmail
			});

			if (error.name === 'LimitExceededException') {
				return res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj za godzinę.' });
			}
			if (error.name === 'InvalidParameterException') {
				return res.status(400).json({ error: 'Invalid email address' });
			}

			// For other errors, still record rate limit and return success
			await recordCodeSend(normalizedEmail, rateLimitTable);
		}
	} else {
		// User doesn't exist - still record rate limit to prevent enumeration
		await recordCodeSend(normalizedEmail, rateLimitTable);
		logger?.info('Resend reset code requested for non-existent user', { email: normalizedEmail });
	}

	// Always return success message to prevent user enumeration
	return res.json({ message: 'Jeśli konto istnieje, kod został wysłany' });
});

/**
 * Public endpoint for confirming password reset with code and new password
 */
router.post('/confirm-forgot-password', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	// Use COGNITO_USER_POOL_CLIENT_ID (from infra) or COGNITO_CLIENT_ID (fallback)
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}

	const { email, code, password } = req.body;

	if (!email || !code || !password) {
		return res.status(400).json({ error: 'Email, code, and password are required' });
	}

	const normalizedEmail = email.toLowerCase().trim();

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}

	// Validate code format (6 digits)
	if (!/^\d{6}$/.test(code)) {
		return res.status(400).json({ error: 'Code must be 6 digits' });
	}

	try {
		// Use public ConfirmForgotPassword API - confirms code and sets new password
		await cognito.send(new ConfirmForgotPasswordCommand({
			ClientId: clientId,
			Username: normalizedEmail,
			ConfirmationCode: code,
			Password: password
		}));

		logger?.info('Password reset confirmed successfully', { email: normalizedEmail });
		return res.json({ message: 'Hasło zostało zresetowane pomyślnie' });
	} catch (error: any) {
		logger?.error('Confirm password reset failed', {
			error: { name: error.name, message: error.message },
			email: normalizedEmail
		});

		if (error.name === 'CodeMismatchException') {
			return res.status(400).json({ error: 'Nieprawidłowy kod weryfikacyjny' });
		}
		if (error.name === 'ExpiredCodeException') {
			return res.status(400).json({ error: 'Kod weryfikacyjny wygasł. Wyślij nowy kod.' });
		}
		if (error.name === 'InvalidPasswordException') {
			return res.status(400).json({ error: 'Hasło nie spełnia wymagań bezpieczeństwa' });
		}
		if (error.name === 'UserNotFoundException') {
			return res.status(404).json({ error: 'User not found' });
		}
		if (error.name === 'InvalidParameterException') {
			return res.status(400).json({ error: 'Invalid parameters' });
		}

		return res.status(500).json({ error: 'Failed to reset password', message: error.message });
	}
});

/**
 * Public endpoint for checking subdomain availability.
 * Used by the dashboard signup flow (best-effort).
 */
router.get('/subdomain-availability', async (req: Request, res: Response) => {
	const envProc = (globalThis as any).process;
	const subdomainsTable = envProc?.env?.SUBDOMAINS_TABLE as string;
	const raw = (req.query?.subdomain ?? '') as string;
	const subdomain = normalizeSubdomain(raw);

	if (!subdomain) {
		return res.status(400).json({ error: 'subdomain is required' });
	}

	const validation = validateSubdomain(subdomain);
	if (!validation.ok) {
		return res.json({ subdomain, available: false, reason: validation.code, message: validation.message });
	}

	if (!subdomainsTable) {
		return res.status(500).json({ error: 'Missing SUBDOMAINS_TABLE configuration' });
	}

	try {
		const existing = await ddb.send(new GetCommand({ TableName: subdomainsTable, Key: { subdomain } }));
		if (existing.Item) {
			return res.json({ subdomain, available: false, reason: 'TAKEN' });
		}
		return res.json({ subdomain, available: true });
	} catch (err: any) {
		// Fail closed on availability (treat as unavailable if we can't check)
		return res.json({ subdomain, available: false, reason: 'CHECK_FAILED' });
	}
});

/**
 * Public endpoint for confirming signup and optionally claiming a subdomain.
 * This is called after the user enters the email verification code.
 */
router.post('/confirm-signup', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const clientId = (envProc?.env?.COGNITO_USER_POOL_CLIENT_ID || envProc?.env?.COGNITO_CLIENT_ID) as string;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const subdomainsTable = envProc?.env?.SUBDOMAINS_TABLE as string;

	if (!clientId) {
		return res.status(500).json({ error: 'Missing Cognito client ID configuration' });
	}
	if (!userPoolId) {
		return res.status(500).json({ error: 'Missing Cognito user pool ID configuration' });
	}
	if (!usersTable) {
		return res.status(500).json({ error: 'Missing USERS_TABLE configuration' });
	}
	if (!subdomainsTable) {
		return res.status(500).json({ error: 'Missing SUBDOMAINS_TABLE configuration' });
	}

	const { email, code, subdomain: rawSubdomain, consents, referralCode: referralCodeBody } = req.body ?? {};
	const normalizedEmail = String(email ?? '').toLowerCase().trim();
	const referralCode = typeof referralCodeBody === 'string' ? referralCodeBody.trim().toUpperCase() : undefined;

	// Validate email + code
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(normalizedEmail)) {
		return res.status(400).json({ error: 'Invalid email format' });
	}
	if (!/^\d{6}$/.test(String(code ?? ''))) {
		return res.status(400).json({ error: 'Code must be 6 digits' });
	}

	// Require legal consents (fail closed)
	if (
		!consents ||
		!consents.terms?.version ||
		!consents.terms?.acceptedAt ||
		!consents.privacy?.version ||
		!consents.privacy?.acceptedAt
	) {
		return res.status(400).json({ error: 'Legal consents are required' });
	}

	// 0) If user sent a referral code, resolve it (validation was done at signup time, but we still need to resolve for storage)
	let resolvedReferrerUserId: string | null = null;
	if (referralCode) {
		try {
			resolvedReferrerUserId = await findUserIdByReferralCode(referralCode);
			// Note: If null, we continue without referral (validation was done earlier at signup)
			if (resolvedReferrerUserId) {
				logger?.info('Referral code resolved at confirm-signup', { referralCode: referralCode.slice(0, 8) });
			}
		} catch (refErr: any) {
			logger?.warn('Could not resolve referral code at confirm-signup', { referralCode: referralCode?.slice(0, 8), error: refErr?.message });
			// Continue without referral - validation was done at signup time
		}
	}

	// 1) Confirm signup in Cognito
	try {
		await cognito.send(new ConfirmSignUpCommand({
			ClientId: clientId,
			Username: normalizedEmail,
			ConfirmationCode: String(code)
		}));
	} catch (err: any) {
		// If already confirmed, do not allow claiming here (public endpoint).
		if (err?.name === 'NotAuthorizedException') {
			return res.status(409).json({ error: 'User is already confirmed. Please sign in to manage your subdomain.' });
		}
		logger?.warn('ConfirmSignUp failed', { email: normalizedEmail, errorName: err?.name, errorMessage: err?.message });
		return res.status(400).json({ error: 'Failed to confirm signup', message: err?.message || 'Unknown error' });
	}

	// 2) Look up userId (sub) from Cognito (AdminGetUser requires pool id)
	let userId: string | null = null;
	try {
		const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: normalizedEmail }));
		const subAttr = (user.UserAttributes || []).find((a) => a?.Name === 'sub');
		userId = subAttr?.Value ?? null;
	} catch (err: any) {
		logger?.error('AdminGetUser failed after confirmation', { email: normalizedEmail, errorName: err?.name, errorMessage: err?.message });
	}

	if (!userId) {
		// Account is confirmed, but we can't safely claim a subdomain without a stable userId
		return res.json({ verified: true, subdomainClaimed: false, subdomainError: { code: 'USER_ID_MISSING', message: 'Account verified, but could not finalize subdomain setup. Please try later.' } });
	}

	// 2.5) Upsert user record with legal consents and optional referral link (always, regardless of subdomain)
	const referredByUserId =
		referralCode && resolvedReferrerUserId && resolvedReferrerUserId !== userId
			? resolvedReferrerUserId
			: undefined;
	if (referredByUserId && referralCode) {
		logger?.info('Referral link stored for new user', { userId, referredByUserId });
	}
	
	// Determine referral discount percentage at signup time (based on referrer's status at that moment)
	// This ensures: 1) First 9 referrals get 10%, 10th+ get 15% (not all get 15% if referrer becomes Top Inviter later)
	// 2) If referrer account is deleted, user still gets the discount they were promised
	let referredDiscountPercent: number | undefined = undefined;
	if (referredByUserId) {
		try {
			const referrerResult = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId: referredByUserId },
				ProjectionExpression: 'topInviterBadge, referralSuccessCount'
			}));
			const referrerTopInviterBadge = (referrerResult.Item as { topInviterBadge?: boolean } | undefined)?.topInviterBadge === true;
			const referrerSuccessCount = (referrerResult.Item as { referralSuccessCount?: number } | undefined)?.referralSuccessCount ?? 0;
			const isTopInviter = referrerTopInviterBadge || referrerSuccessCount >= 10;
			referredDiscountPercent = isTopInviter ? 15 : 10;
			logger?.info('Referral discount percent determined at signup', { userId, referredByUserId, referredDiscountPercent, referrerSuccessCount });
		} catch (refErr: any) {
			logger?.warn('Could not determine referral discount percent at signup', { userId, referredByUserId, error: refErr?.message });
			// Default to 10% if we can't determine (referrer may have been deleted, but user should still get discount)
			referredDiscountPercent = 10;
		}
	}
	
	try {
		const now = new Date().toISOString();
		const setParts = ['email = :e', 'updatedAt = :u', 'createdAt = if_not_exists(createdAt, :u)', '#legal = :legal'];
		const values: Record<string, unknown> = {
			':e': normalizedEmail,
			':u': now,
			':legal': { terms: consents.terms, privacy: consents.privacy }
		};
		if (referredByUserId && referralCode) {
			setParts.push('referredByUserId = :ref', 'referredByReferralCode = :refCode');
			values[':ref'] = referredByUserId;
			values[':refCode'] = referralCode;
			if (referredDiscountPercent !== undefined) {
				setParts.push('referredDiscountPercent = :refDiscount');
				values[':refDiscount'] = referredDiscountPercent;
			}
		}
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: `SET ${setParts.join(', ')}`,
			ExpressionAttributeNames: { '#legal': 'legal' },
			ExpressionAttributeValues: values
		}));
	} catch (err: any) {
		logger?.warn('Failed to store legal consents', { userId, errorName: err?.name, errorMessage: err?.message });
	}

	// 2.6) Welcome email (no attachments)
	// Best-effort: failing to send email should not block account verification.
	try {
		const sender = await getSenderEmail();
		const dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
		const landingUrl = await getRequiredConfigValue(stage, 'PublicLandingUrl', { envVarName: 'PUBLIC_LANDING_URL' });
		const privacyUrl = `${landingUrl.replace(/\/+$/, '')}/privacy`;
		const termsUrl = `${landingUrl.replace(/\/+$/, '')}/terms`;
		const company = await getCompanyConfig();

		const template = createWelcomeEmail({ dashboardUrl, landingUrl, privacyUrl, termsUrl, companyName: company.company_name, isReferred: !!referredByUserId });

		if (!sender) {
			logger?.warn('Welcome email skipped: sender email not configured (SENDER_EMAIL or SSM SenderEmail)', { email: normalizedEmail });
		} else {
			await sendRawEmailWithAttachments({
				to: normalizedEmail,
				from: sender,
				subject: template.subject,
				html: template.html || template.text,
				attachments: []
			});
			logger?.info('Welcome email sent', { email: normalizedEmail });
		}
		} catch (err: any) {
			logger?.warn('Welcome email failed', { email: normalizedEmail, errorName: err?.name, errorMessage: err?.message });
		}

		// 2.7) Second email: referral program info (no code – user not eligible yet). Polish.
		try {
			const senderForRef = await getSenderEmail();
			const dashboardUrlForRef = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
			const templateRef = createReferralProgramInfoEmail({ dashboardUrl: dashboardUrlForRef, isReferred: !!referredByUserId });
			if (senderForRef) {
				await sendRawEmailWithAttachments({
					to: normalizedEmail,
					from: senderForRef,
					subject: templateRef.subject,
					html: templateRef.html || templateRef.text,
					attachments: []
				});
				logger?.info('Referral program info email sent', { email: normalizedEmail });
			}
		} catch (err: any) {
			logger?.warn('Referral program info email failed', { email: normalizedEmail, errorName: err?.name, errorMessage: err?.message });
		}

	// 3) Best-effort claim subdomain (optional)
	const subdomain = normalizeSubdomain(rawSubdomain);
	if (!subdomain) {
		// No subdomain requested: just return verified.
		return res.json({ verified: true, subdomainClaimed: false });
	}

	const validation = validateSubdomain(subdomain);
	if (!validation.ok) {
		return res.json({ verified: true, subdomainClaimed: false, subdomainError: { code: validation.code, message: validation.message } });
	}

	try {
		const now = new Date().toISOString();

		// Claim the subdomain (unique constraint)
		await ddb.send(new PutCommand({
			TableName: subdomainsTable,
			Item: { subdomain, userId, createdAt: now },
			ConditionExpression: 'attribute_not_exists(subdomain)'
		}));

		// Upsert the user record to store the chosen subdomain
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET subdomain = :s, email = :e, updatedAt = :u, createdAt = if_not_exists(createdAt, :u)',
			ExpressionAttributeValues: {
				':s': subdomain,
				':e': normalizedEmail,
				':u': now
			}
		}));

		return res.json({ verified: true, subdomainClaimed: true, subdomain });
	} catch (err: any) {
		// Conditional failure = taken
		if (err?.name === 'ConditionalCheckFailedException') {
			return res.json({ verified: true, subdomainClaimed: false, subdomainError: { code: 'TAKEN', message: 'This subdomain is already taken' } });
		}
		logger?.error('Claim subdomain failed', { subdomain, userId, errorName: err?.name, errorMessage: err?.message });
		return res.json({ verified: true, subdomainClaimed: false, subdomainError: { code: 'CLAIM_FAILED', message: 'Account verified, but failed to claim subdomain. Please try later.' } });
	}
});

export { router as publicAuthRoutes };
