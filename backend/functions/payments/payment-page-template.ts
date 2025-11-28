/**
 * HTML template helper for payment processing pages (success/cancel)
 * Shows processing status and automatically redirects after completion
 */

export interface PaymentPageOptions {
	title: string;
	message: string;
	statusMessages?: string[];
	redirectUrl: string;
	redirectDelay?: number; // milliseconds before redirect after processing completes (default: 2000)
	isSuccess?: boolean; // true for success, false for cancel
	sessionId?: string; // Stripe session ID for polling status
	apiUrl?: string; // API base URL for status checks
}

// Security: HTML escaping helper
function escapeHtml(text: string): string {
	if (!text) return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function generatePaymentPageHTML(options: PaymentPageOptions): string {
	const {
		title,
		message,
		statusMessages = [],
		redirectUrl,
		redirectDelay = 2000,
		isSuccess = true,
		sessionId,
		apiUrl
	} = options;

	// Dashboard dark theme colors
	const successColor = '#12b76a'; // success-500
	const brandColor = '#465fff'; // brand-500
	// Dark theme grays
	const grayDark = '#1a2231'; // gray-dark (main background)
	const gray800 = '#1d2939'; // gray-800 (card background)
	const gray700 = '#344054'; // gray-700 (borders)
	const gray500 = '#667085'; // gray-500 (muted text)
	const gray300 = '#d0d5dd'; // gray-300 (text)
	const gray100 = '#f2f4f7'; // gray-100 (light text)
	
	// For cancel pages, use brand blue (neutral) instead of error red
	const statusColor = isSuccess ? successColor : brandColor;
	const warningBgLight = '#b54708'; // warning-700 (for icon background)
	
	// Generate CSP nonce for inline script (random string)
	const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	return `<!DOCTYPE html>
<html lang="pl">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${apiUrl ? new URL(apiUrl).origin : ''}; base-uri 'self'; form-action 'self';">
	<meta http-equiv="X-Content-Type-Options" content="nosniff">
	<meta http-equiv="X-XSS-Protection" content="1; mode=block">
	<meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
	<title>${escapeHtml(title)}</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📷</text></svg>">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap" rel="stylesheet">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		
		body {
			font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			background: ${grayDark};
			color: ${gray100};
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		
		.container {
			background: ${gray800};
			border-radius: 12px;
			box-shadow: 0px 4px 8px -2px rgba(0, 0, 0, 0.3), 0px 2px 4px -2px rgba(0, 0, 0, 0.2);
			border: 1px solid ${gray700};
			padding: 48px;
			max-width: 500px;
			width: 100%;
			text-align: center;
		}
		
		.logo {
			font-size: 32px;
			font-weight: 700;
			color: ${brandColor};
			margin: 0 auto 24px;
			letter-spacing: -0.5px;
		}
		
		@keyframes scaleIn {
			from {
				transform: scale(0);
				opacity: 0;
			}
			to {
				transform: scale(1);
				opacity: 1;
			}
		}
		
		h1 {
			font-size: 28px;
			font-weight: 600;
			color: ${gray100};
			margin-bottom: 12px;
			line-height: 1.2;
		}
		
		.message {
			font-size: 16px;
			color: ${gray300};
			margin-bottom: 32px;
			line-height: 1.6;
		}
		
		.status-container {
			background: ${grayDark};
			border-radius: 8px;
			padding: 24px;
			margin-bottom: 32px;
			border: 1px solid ${gray700};
		}
		
		.status-item {
			display: flex;
			align-items: center;
			justify-content: flex-start;
			padding: 12px 0;
			font-size: 14px;
			color: ${gray300};
		}
		
		.status-icon {
			width: 20px;
			height: 20px;
			border-radius: 50%;
			background: ${statusColor};
			color: white;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 12px;
			margin-right: 12px;
			flex-shrink: 0;
			font-weight: 600;
		}
		
		.status-icon.warning {
			background: ${warningBgLight};
			color: white;
		}
		
		.status-icon.pending {
			background: ${gray500};
			animation: pulse 1.5s ease-in-out infinite;
		}
		
		.status-icon.pending .spinner {
			width: 12px;
			height: 12px;
			border: 2px solid ${gray700};
			border-top-color: ${statusColor};
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			display: block;
		}
		
		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}
		
		@keyframes pulse {
			0%, 100% {
				opacity: 1;
			}
			50% {
				opacity: 0.5;
			}
		}
		
		.status-text {
			flex: 1;
			text-align: left;
			font-weight: 500;
		}
		
		/* Spinner removed - using status icon spinner instead */
		
		.redirect-message {
			font-size: 14px;
			color: ${gray300};
			margin-top: 24px;
			line-height: 1.6;
			max-width: 100%;
			word-wrap: break-word;
		}
		
		.link {
			color: ${brandColor};
			text-decoration: none;
			font-weight: 500;
		}
		
		.link:hover {
			color: ${brandColor};
			text-decoration: underline;
			opacity: 0.8;
		}
		
		.redirect-button {
			display: none;
			background: ${brandColor};
			color: white;
			border: none;
			border-radius: 8px;
			padding: 12px 24px;
			font-size: 14px;
			font-weight: 500;
			cursor: pointer;
			margin-top: 24px;
			font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			transition: opacity 0.2s, transform 0.2s;
		}
		
		.redirect-button:hover {
			opacity: 0.9;
			transform: translateY(-1px);
		}
		
		.redirect-button:active {
			transform: translateY(0);
		}
		
		.redirect-button.show {
			display: inline-block;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="logo">PhotoCloud</div>
		<h1>${escapeHtml(title)}</h1>
		<p class="message">${escapeHtml(message)}</p>
		
		<div class="status-container" id="statusContainer">
			<div class="status-item" id="status-0">
				<div class="status-icon pending" id="icon-0">
					<div class="spinner"></div>
				</div>
				<div class="status-text" id="status-text">${isSuccess ? 'Przetwarzanie płatności...' : 'Przekierowywanie do panelu...'}</div>
			</div>
		</div>
		
		<p class="redirect-message" id="redirectMessage" style="display: none;"></p>
		<button class="redirect-button" id="redirectButton">Przekieruj do PhotoCloud</button>
	</div>
	
	<script nonce="${nonce}">
		(function() {
			// Security: Validate and sanitize inputs
			function validateSessionId(id) {
				if (!id || typeof id !== 'string') return null;
				// Stripe session ID format: cs_test_... or cs_live_...
				const stripeSessionPattern = /^cs_(test|live)_[a-zA-Z0-9]+$/;
				if (!stripeSessionPattern.test(id)) return null;
				// Additional length check (Stripe session IDs are typically 50-100 chars)
				if (id.length < 20 || id.length > 200) return null;
				return id;
			}
			
			function validateUrl(url) {
				if (!url || typeof url !== 'string') return null;
				try {
					const parsed = new URL(url);
					// Only allow http/https protocols
					if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
					// Prevent javascript: and data: URLs
					if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') return null;
					return url;
				} catch {
					return null;
				}
			}
			
			// Validate and sanitize all inputs
			const redirectUrl = validateUrl(${JSON.stringify(redirectUrl)}) || '/';
			const rawSessionId = ${sessionId ? JSON.stringify(sessionId) : 'null'};
			const rawApiUrl = ${apiUrl ? JSON.stringify(apiUrl) : '""'};
			const apiUrl = rawApiUrl ? validateUrl(rawApiUrl) : null;
			const isSuccess = ${isSuccess ? 'true' : 'false'};
			const redirectDelay = Math.max(1000, Math.min(10000, ${redirectDelay}));
			
			// Get button element and set up click handler
			const redirectButton = document.getElementById('redirectButton');
			if (redirectButton) {
				redirectButton.addEventListener('click', function() {
					window.location.href = validateUrl(redirectUrl) || '/';
				});
			}
			
			let pollCount = 0;
			const maxPolls = 60; // 60 polls = ~2 minutes max wait time
			const pollInterval = 2000; // Poll every 2 seconds
			
			// Unified text constants
			const STATUS_PROCESSING = 'Przetwarzanie płatności...';
			const STATUS_REDIRECTING = 'Przekierowywanie do panelu...';
			const STATUS_ERROR = 'Problem z weryfikacją płatności';
			const STATUS_PROCESSING_LONG = 'Przetwarzanie trwa dłużej niż zwykle...';
			const STATUS_NOT_PROCESSED = 'Płatność nie została przetworzona';
			const ERROR_MESSAGE = 'To nie oznacza, że płatność nie przeszła. Jeśli płatność nie zostanie zaksięgowana w ciągu 5 minut, skontaktuj się z nami podając dane i ID galerii.';
			
			// Update status text (with XSS protection)
			function updateStatusText(text) {
				const statusText = document.getElementById('status-text');
				if (statusText && typeof text === 'string') {
					statusText.textContent = text; // textContent automatically escapes HTML
				}
			}
			
			// Update redirect message (with XSS protection)
			function updateRedirectMessage(text, showButton) {
				const redirectMsg = document.getElementById('redirectMessage');
				if (redirectMsg && typeof text === 'string') {
					redirectMsg.textContent = text; // textContent automatically escapes HTML
					redirectMsg.style.display = 'block';
				} else if (redirectMsg && !text) {
					redirectMsg.style.display = 'none';
				}
				// Show/hide redirect button
				if (redirectButton) {
					if (showButton) {
						redirectButton.classList.add('show');
					} else {
						redirectButton.classList.remove('show');
					}
				}
			}
			
			// Mark status as complete (with checkmark)
			function markStatusComplete() {
				const icon = document.getElementById('icon-0');
				if (icon && icon.classList.contains('pending')) {
					icon.classList.remove('pending');
					icon.innerHTML = '✓';
				}
			}
			
			// Mark status as warning (with warning icon)
			function markStatusWarning() {
				const icon = document.getElementById('icon-0');
				if (icon) {
					icon.classList.remove('pending');
					icon.classList.add('warning');
					icon.innerHTML = '⚠';
				}
			}
			
			// Validate session ID
			let sessionId = null;
			if (rawSessionId) {
				sessionId = validateSessionId(rawSessionId);
				if (!sessionId) {
					markStatusWarning();
					updateStatusText(STATUS_ERROR);
					updateRedirectMessage(ERROR_MESSAGE, true);
					return;
				}
			}
			
			// Update status based on payment processing state
			function updateStatusFromResponse(data) {
				if (data.isProcessed) {
					markStatusComplete();
					updateStatusText(STATUS_REDIRECTING);
					return true;
				}
				if (data.paymentStatus === 'canceled' || data.paymentStatus === 'failed') {
					updateStatusText(STATUS_NOT_PROCESSED);
					updateRedirectMessage(STATUS_REDIRECTING, false);
					return true;
				}
				updateStatusText(STATUS_PROCESSING);
				return false;
			}
			
			// Check payment status from API
			async function checkPaymentStatus() {
				if (!apiUrl || !sessionId) {
					markStatusWarning();
					updateStatusText(STATUS_ERROR);
					updateRedirectMessage(ERROR_MESSAGE, true);
					return;
				}
				
				try {
					const statusUrl = apiUrl + '/payments/check-status?session_id=' + encodeURIComponent(sessionId);
					if (!validateUrl(statusUrl)) {
						throw new Error('Invalid API URL');
					}
					
					const response = await fetch(statusUrl, {
						method: 'GET',
						credentials: 'omit',
						headers: { 'Accept': 'application/json' }
					});
					
					if (!response.ok) {
						if (response.status === 400) {
							markStatusWarning();
							updateStatusText(STATUS_ERROR);
							updateRedirectMessage(ERROR_MESSAGE, true);
							return;
						}
						throw new Error('Status check failed');
					}
					
					const contentType = response.headers.get('content-type');
					if (!contentType?.includes('application/json')) {
						throw new Error('Invalid response type');
					}
					
					const data = await response.json();
					if (!data || typeof data !== 'object') {
						throw new Error('Invalid response format');
					}
					
					pollCount++;
					const shouldRedirect = updateStatusFromResponse(data);
					
					if (shouldRedirect) {
						setTimeout(() => {
							window.location.href = validateUrl(redirectUrl) || '/';
						}, redirectDelay);
					} else if (pollCount < maxPolls) {
						setTimeout(checkPaymentStatus, pollInterval);
					} else {
						updateStatusText(STATUS_PROCESSING_LONG);
						setTimeout(checkPaymentStatus, 10000);
					}
				} catch (error) {
					if (pollCount === 0) {
						pollCount++;
						updateStatusText(STATUS_PROCESSING);
						setTimeout(checkPaymentStatus, pollInterval);
					} else if (pollCount < maxPolls) {
						pollCount++;
						updateStatusText(STATUS_PROCESSING);
						setTimeout(checkPaymentStatus, pollInterval);
					} else {
						markStatusWarning();
						updateStatusText(STATUS_ERROR);
						updateRedirectMessage(ERROR_MESSAGE, true);
					}
				}
			}
			
			// Start the process
			if (isSuccess && sessionId && apiUrl) {
				updateStatusText(STATUS_PROCESSING);
				setTimeout(checkPaymentStatus, 1000);
			} else if (isSuccess) {
				markStatusWarning();
				updateStatusText(STATUS_ERROR);
				updateRedirectMessage(ERROR_MESSAGE, true);
			} else {
				updateStatusText(STATUS_REDIRECTING);
				setTimeout(() => {
					window.location.href = validateUrl(redirectUrl) || '/';
				}, redirectDelay + 2000);
			}
		})();
	</script>
</body>
</html>`;
}

