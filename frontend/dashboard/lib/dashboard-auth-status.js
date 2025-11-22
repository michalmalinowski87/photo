/**
 * Dashboard Auth Status Listener
 * 
 * Allows dashboard to respond to auth status requests from landing page
 * Works via postMessage from iframe or direct window communication
 */

const AUTH_STATUS_REQUEST = 'PHOTOHUB_AUTH_STATUS_REQUEST';
const AUTH_STATUS_RESPONSE = 'PHOTOHUB_AUTH_STATUS_RESPONSE';

/**
 * Check auth status and return result
 */
function getAuthStatus() {
	const idToken = localStorage.getItem('idToken');
	let isAuthenticated = false;

	if (idToken) {
		try {
			const payload = JSON.parse(atob(idToken.split('.')[1]));
			const now = Math.floor(Date.now() / 1000);
			if (payload.exp && payload.exp > now) {
				isAuthenticated = true;
			}
		} catch (e) {
			// Invalid token
			isAuthenticated = false;
		}
	}

	return isAuthenticated;
}

/**
 * Setup listener for auth status requests from landing page
 * Call this in dashboard app initialization
 */
export function setupDashboardAuthStatusListener() {
	if (typeof window === 'undefined') return;

	window.addEventListener('message', (event) => {
		// Validate origin
		const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL;
		if (!landingUrl) return;

		try {
			const landingOrigin = new URL(landingUrl).origin;
			// Accept messages from landing page or same origin
			if (event.origin !== landingOrigin && event.origin !== window.location.origin) {
				return;
			}
		} catch {
			return;
		}

		const data = event.data;
		if (data && data.type === AUTH_STATUS_REQUEST) {
			const isAuthenticated = getAuthStatus();

			// Respond with auth status
			const response = {
				type: AUTH_STATUS_RESPONSE,
				requestId: data.requestId,
				isAuthenticated,
				source: window.location.origin
			};

			// Send response back to requester
			if (event.source && event.source.postMessage) {
				try {
					event.source.postMessage(response, event.origin);
				} catch (e) {
					// Ignore postMessage errors
				}
			}
		}
	});

	// Also listen for storage events to broadcast auth changes
	window.addEventListener('storage', (e) => {
		if (e.key === 'idToken') {
			// Token changed, broadcast to all windows
			const isAuthenticated = getAuthStatus();
			window.postMessage({
				type: 'PHOTOHUB_AUTH_STATUS_CHANGED',
				isAuthenticated,
				source: window.location.origin
			}, '*');
		}
	});
}

