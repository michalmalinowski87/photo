import { Router, Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, SignUpCommand, ResendConfirmationCodeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const router = Router();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

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

export { router as publicAuthRoutes };
