/**
 * Fetch with Cognito token automatically added to Authorization header
 */
export async function apiFetchWithAuth(url, options = {}, token) {
	const headers = {
		...options.headers,
		'Authorization': `Bearer ${token}`
	};
	return apiFetch(url, { ...options, headers });
}

export async function apiFetch(url, options = {}) {
	try {
		const response = await fetch(url, options);
		const contentType = response.headers.get('content-type');
		const isJson = contentType && contentType.includes('application/json');
		
		let body;
		try {
			body = isJson ? await response.json() : await response.text();
		} catch (e) {
			body = null;
		}

		if (!response.ok) {
			const error = new Error(body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`);
			error.status = response.status;
			error.body = body;
			throw error;
		}

		return { data: body, response };
	} catch (error) {
		if (error.status) {
			throw error;
		}
		// Network or other errors
		const networkError = new Error(`Network error: ${error.message}`);
		networkError.originalError = error;
		throw networkError;
	}
}

export function formatApiError(error) {
	if (error.status) {
		const bodyStr = typeof error.body === 'string' ? error.body : JSON.stringify(error.body);
		return `Error ${error.status}: ${error.message}${bodyStr ? ` - ${bodyStr}` : ''}`;
	}
	return error.message || 'An unexpected error occurred';
}

