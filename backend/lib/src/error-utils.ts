/**
 * Sanitizes error messages to prevent exposing sensitive information to clients
 * @param error - The error object or message to sanitize
 * @param includeDetails - Whether to include safe error details (default: false in production)
 * @returns A sanitized error message safe for client consumption
 */
export function sanitizeErrorMessage(error: unknown, includeDetails = false): string {
	// Handle different error types
	if (!error) {
		return 'An unexpected error occurred';
	}

	let message = 'Internal server error';
	
	if (typeof error === 'string') {
		message = error;
	} else if (error instanceof Error) {
		message = error.message || 'An unexpected error occurred';
	} else if (typeof error === 'object' && error !== null && 'message' in error) {
		message = String((error as { message: unknown }).message || 'An unexpected error occurred');
	}

	// Remove potentially sensitive information
	// Check for common patterns that might expose secrets
	const sensitivePatterns = [
		/secret/i,
		/key/i,
		/password/i,
		/token/i,
		/api[_-]?key/i,
		/private[_-]?key/i,
		/credential/i,
		/authorization/i,
		/aws[_-]?access/i,
		/aws[_-]?secret/i,
	];

	// If message contains sensitive patterns, sanitize it
	for (const pattern of sensitivePatterns) {
		if (pattern.test(message)) {
			// Don't expose the actual error if it might contain secrets
			return 'An unexpected error occurred';
		}
	}

	// In production, only return generic messages unless includeDetails is true
	const stage = process.env.STAGE || 'dev';
	if ((stage === 'prod' || stage === 'production') && !includeDetails) {
		// Return generic message in production
		return 'Internal server error';
	}

	// In development, return the sanitized message
	// But truncate to prevent extremely long error messages
	if (message.length > 200) {
		return message.substring(0, 197) + '...';
	}

	return message;
}

/**
 * Creates a safe error response object for API responses
 * @param error - The error object
 * @param statusCode - HTTP status code (default: 500)
 * @returns A safe error response object
 */
export function createErrorResponse(
	error: unknown,
	statusCode = 500
): { error: string; message?: string; statusCode: number } {
	const message = sanitizeErrorMessage(error);
	
	return {
		error: 'Internal server error',
		message: statusCode >= 500 ? undefined : message, // Only include message for client errors (4xx), not server errors (5xx)
		statusCode,
	};
}

/**
 * Creates a standardized Lambda/API Gateway error response
 * @param error - The error object
 * @param defaultMessage - Default error message if sanitization removes the original
 * @param statusCode - HTTP status code (default: 500)
 * @returns A Lambda-compatible error response
 */
export function createLambdaErrorResponse(
	error: unknown,
	defaultMessage = 'Internal server error',
	statusCode = 500
): {
	statusCode: number;
	headers: { 'content-type': string };
	body: string;
} {
	const safeMessage = sanitizeErrorMessage(error);
	const message = safeMessage || defaultMessage;
	
	return {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			error: defaultMessage,
			message: statusCode >= 500 ? undefined : message // Only include message for client errors (4xx)
		})
	};
}

