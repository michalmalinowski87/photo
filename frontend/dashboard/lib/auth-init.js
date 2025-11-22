/**
 * Shared authentication initialization utility
 * Sets up token sharing and checks for authentication
 */

import { initAuth, getIdToken } from './auth';
import { setupTokenSharingListener, requestTokensFromOtherDomains } from './token-sharing';
import { setupDashboardAuthStatusListener } from './dashboard-auth-status';

/**
 * Initialize authentication and token sharing
 * Call this in useEffect on protected pages
 * 
 * @param {Function} onTokenFound - Callback when token is found
 * @param {Function} onNoToken - Callback when no token is found
 */
export function initializeAuth(onTokenFound, onNoToken) {
	// Setup auth status listener for landing page to check auth
	setupDashboardAuthStatusListener();
	
	// Setup token sharing listener
	setupTokenSharingListener();
	
	// Request tokens from landing domain if available (legacy - dashboard is now source of truth)
	// Give it a moment to receive tokens before checking localStorage
	setTimeout(() => {
		// Initialize auth and try to get token
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
			getIdToken()
				.then((token) => {
					if (onTokenFound) onTokenFound(token);
				})
				.catch(() => {
					// No valid session, check localStorage for manual token
					const stored = localStorage.getItem('idToken');
					if (stored) {
						// Verify token is not expired
						try {
							const payload = JSON.parse(atob(stored.split('.')[1]));
							const now = Math.floor(Date.now() / 1000);
							if (payload.exp && payload.exp > now) {
								if (onTokenFound) onTokenFound(stored);
								return;
							}
						} catch (e) {
							// Invalid token
						}
					}
					// No valid token found
					if (onNoToken) onNoToken();
				});
		} else {
			// Fallback to localStorage for manual token
			const stored = localStorage.getItem('idToken');
			if (stored) {
				// Verify token is not expired
				try {
					const payload = JSON.parse(atob(stored.split('.')[1]));
					const now = Math.floor(Date.now() / 1000);
					if (payload.exp && payload.exp > now) {
						if (onTokenFound) onTokenFound(stored);
						return;
					}
				} catch (e) {
					// Invalid token
				}
			}
			// No valid token found
			if (onNoToken) onNoToken();
		}
	}, 200); // Wait 200ms for postMessage to complete
	
	// Also request tokens immediately
	requestTokensFromOtherDomains();
}

/**
 * Redirect to dashboard login page
 * @param {string} returnUrl - URL to return to after login
 */
export function redirectToLandingSignIn(returnUrl = '/galleries') {
	// Redirect to dashboard login page instead of landing sign-in
	const dashboardUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
	window.location.href = `${dashboardUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
}

