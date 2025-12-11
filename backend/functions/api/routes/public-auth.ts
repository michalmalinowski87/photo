import { Router, Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, SignUpCommand, ResendConfirmationCodeCommand } from '@aws-sdk/client-cognito-identity-provider';

const router = Router();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const MAX_CODES_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Check rate limit for email verification codes
 * Returns { allowed: boolean, remainingCodes: number, resetAt: number | null }
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
		const windowStart = now - RATE_LIMIT_WINDOW_MS;

		// Filter out codes sent outside the current window
		const recentCodes = (record.codes || []).filter((timestamp: number) => timestamp > windowStart);

		if (recentCodes.length >= MAX_CODES_PER_HOUR) {
			// Rate limit exceeded
			const oldestCodeInWindow = Math.min(...recentCodes);
			const resetAt = oldestCodeInWindow + RATE_LIMIT_WINDOW_MS;
			return { 
				allowed: false, 
				remainingCodes: 0, 
				resetAt 
			};
		}

		// Update the record to remove old codes
		if (recentCodes.length < record.codes.length) {
			const ttl = Math.floor((now + RATE_LIMIT_WINDOW_MS) / 1000); // TTL in seconds
			await ddb.send(new UpdateCommand({
				TableName: rateLimitTable,
				Key: { email: normalizedEmail },
				UpdateExpression: 'SET codes = :codes, ttl = :ttl',
				ExpressionAttributeValues: {
					':codes': recentCodes,
					':ttl': ttl
				}
			}));
		}

		return { 
			allowed: true, 
			remainingCodes: MAX_CODES_PER_HOUR - recentCodes.length, 
			resetAt: recentCodes.length > 0 ? Math.min(...recentCodes) + RATE_LIMIT_WINDOW_MS : null 
		};
	} catch (error: any) {
		// On error, log but allow the request (fail open for availability)
		console.error('Rate limit check failed:', error);
		return { allowed: true, remainingCodes: MAX_CODES_PER_HOUR, resetAt: null };
	}
}

/**
 * Record a code send event for rate limiting
 */
async function recordCodeSend(email: string, rateLimitTable: string): Promise<void> {
	const normalizedEmail = email.toLowerCase().trim();
	const now = Date.now();

	try {
		const result = await ddb.send(new GetCommand({
			TableName: rateLimitTable,
			Key: { email: normalizedEmail }
		}));

		const windowStart = now - RATE_LIMIT_WINDOW_MS;
		const existingCodes = (result.Item?.codes || []).filter((timestamp: number) => timestamp > windowStart);
		const updatedCodes = [...existingCodes, now];

		// Calculate TTL based on the oldest code in the window (or current time if no codes)
		// This ensures the record persists until the oldest code expires
		const oldestCode = updatedCodes.length > 0 ? Math.min(...updatedCodes) : now;
		const ttl = Math.floor((oldestCode + RATE_LIMIT_WINDOW_MS) / 1000); // TTL in seconds

		await ddb.send(new PutCommand({
			TableName: rateLimitTable,
			Item: {
				email: normalizedEmail,
				codes: updatedCodes,
				ttl: ttl,
				lastSent: new Date(now).toISOString()
			}
		}));
	} catch (error: any) {
		// Log error but don't fail the request
		console.error('Failed to record code send:', error);
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

	const { email, password } = req.body;

	if (!email || !password) {
		return res.status(400).json({ error: 'Email and password are required' });
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
		// Use public ResendConfirmationCode API - works for UNCONFIRMED users
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

export { router as publicAuthRoutes };
