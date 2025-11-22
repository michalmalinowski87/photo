/**
 * Dashboard Auth Status Check
 * 
 * Allows landing page to check if user is authenticated on dashboard domain
 * Uses postMessage API to communicate with dashboard
 */

const AUTH_STATUS_REQUEST = 'PHOTOHUB_AUTH_STATUS_REQUEST';
const AUTH_STATUS_RESPONSE = 'PHOTOHUB_AUTH_STATUS_RESPONSE';

let authStatusListener: ((isAuthenticated: boolean) => void) | null = null;
let requestId = 0;

/**
 * Check if user is authenticated on dashboard domain
 * Uses a hidden iframe to communicate with dashboard domain
 * Returns a promise that resolves to true/false
 */
export function checkDashboardAuthStatus(): Promise<boolean> {
	return new Promise((resolve) => {
		if (typeof window === 'undefined') {
			resolve(false);
			return;
		}

		const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL;
		if (!dashboardUrl) {
			resolve(false);
			return;
		}

		const currentRequestId = ++requestId;
		let resolved = false;
		
		// Create hidden iframe pointing to dashboard domain
		const iframe = document.createElement('iframe');
		iframe.style.display = 'none';
		iframe.style.width = '0';
		iframe.style.height = '0';
		iframe.style.border = 'none';
		iframe.style.position = 'absolute';
		iframe.style.left = '-9999px';
		
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				window.removeEventListener('message', messageHandler);
				window.removeEventListener('message', readyHandler);
				if (iframe.parentNode) {
					document.body.removeChild(iframe);
				}
				resolve(false); // Timeout - assume not authenticated
			}
		}, 3000); // 3 second timeout

		// Listen for ready signal from iframe
		const readyHandler = (event: MessageEvent) => {
			try {
				const dashboardOrigin = new URL(dashboardUrl).origin;
				if (event.origin !== dashboardOrigin) {
					return;
				}
			} catch {
				return;
			}

			const data = event.data;
			if (data && data.type === 'PHOTOHUB_AUTH_CHECK_READY' && !resolved && iframe.contentWindow) {
				// Iframe is ready, send request immediately
				try {
					iframe.contentWindow.postMessage({
						type: AUTH_STATUS_REQUEST,
						requestId: currentRequestId,
						source: window.location.origin
					}, dashboardUrl);
				} catch (e) {
					// Ignore errors
				}
			}
		};

		const messageHandler = (event: MessageEvent) => {
			// Validate origin - must be from dashboard domain
			try {
				const dashboardOrigin = new URL(dashboardUrl).origin;
				if (event.origin !== dashboardOrigin) {
					return;
				}
			} catch {
				return;
			}

			const data = event.data;
			if (data && data.type === AUTH_STATUS_RESPONSE && data.requestId === currentRequestId) {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					window.removeEventListener('message', messageHandler);
					window.removeEventListener('message', readyHandler);
					if (iframe.parentNode) {
						document.body.removeChild(iframe);
					}
					resolve(data.isAuthenticated || false);
				}
			}
		};

		window.addEventListener('message', messageHandler);
		window.addEventListener('message', readyHandler);

		// When iframe loads, send auth status request
		iframe.onload = () => {
			// Small delay to ensure iframe script is ready (fallback if ready signal doesn't arrive)
			setTimeout(() => {
				if (!resolved && iframe.contentWindow) {
					try {
						iframe.contentWindow.postMessage({
							type: AUTH_STATUS_REQUEST,
							requestId: currentRequestId,
							source: window.location.origin
						}, dashboardUrl);
					} catch (e) {
						// Cross-origin error - iframe might not be ready
						if (!resolved) {
							resolved = true;
							clearTimeout(timeout);
							window.removeEventListener('message', messageHandler);
							window.removeEventListener('message', readyHandler);
							if (iframe.parentNode) {
								document.body.removeChild(iframe);
							}
							resolve(false);
						}
					}
				}
			}, 100); // Fallback delay
		};

		iframe.onerror = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				window.removeEventListener('message', messageHandler);
				window.removeEventListener('message', readyHandler);
				if (iframe.parentNode) {
					document.body.removeChild(iframe);
				}
				resolve(false);
			}
		};

		// Point iframe to auth-check HTML file on dashboard
		// Pass landing URL as query param so iframe knows which origin to accept
		const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || window.location.origin;
		iframe.src = `${dashboardUrl}/auth-check-frame.html?landing=${encodeURIComponent(landingUrl)}`;
		document.body.appendChild(iframe);
	});
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
			if (event.origin !== landingOrigin && event.origin !== window.location.origin) {
				return;
			}
		} catch {
			return;
		}

		const data = event.data;
		if (data && data.type === AUTH_STATUS_REQUEST) {
			// Check if user is authenticated
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

			// Respond with auth status
			const response = {
				type: AUTH_STATUS_RESPONSE,
				requestId: data.requestId,
				isAuthenticated,
				source: window.location.origin
			};

			// Send response back to requester
			if (event.source && 'postMessage' in event.source) {
				(event.source as Window).postMessage(response, event.origin);
			}
		}
	});
}

