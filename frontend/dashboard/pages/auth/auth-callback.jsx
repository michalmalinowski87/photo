import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { exchangeCodeForTokens } from '../../lib/auth';

export default function AuthCallback() {
	const router = useRouter();
	const hasRedirected = useRef(false);
	const hasProcessed = useRef(false);

	useEffect(() => {
		// Wait for router to be ready (query params are populated asynchronously)
		if (!router.isReady) {
			return;
		}

		// Prevent double execution in React Strict Mode
		if (hasProcessed.current) {
			return;
		}

		// Prevent multiple redirects
		if (hasRedirected.current) {
			return;
		}

		const code = router.query.code;
		const state = router.query.state; // Contains returnUrl
		const error = router.query.error;

		if (error) {
			hasRedirected.current = true;
			// Redirect to dashboard login page
			const dashboardUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
			const returnUrl = state ? decodeURIComponent(state) : '/galleries';
			window.location.href = `${dashboardUrl}/login?error=${encodeURIComponent(error)}&returnUrl=${encodeURIComponent(returnUrl)}`;
			return;
		}

		if (code) {
			hasProcessed.current = true; // Mark as processed to prevent double execution
			
			// Exchange authorization code for tokens
			const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : '';
			
			exchangeCodeForTokens(code, redirectUri)
				.then(() => {
					// Successfully got tokens, redirect to returnUrl or default to galleries
					const returnUrl = state ? decodeURIComponent(state) : '/galleries';
					// Ensure returnUrl is a valid path (prevent open redirect)
					const safeReturnUrl = returnUrl.startsWith('/') ? returnUrl : '/galleries';
					router.replace(safeReturnUrl);
				})
				.catch((err) => {
					if (hasRedirected.current) {
						return; // Already redirected, prevent loop
					}
					hasRedirected.current = true;
					// Redirect to dashboard login page
					const dashboardUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
					const returnUrl = state ? decodeURIComponent(state) : '/galleries';
					// Clear any stale PKCE verifier to prevent issues
					if (typeof window !== 'undefined') {
						sessionStorage.removeItem('pkce_code_verifier');
					}
					window.location.href = `${dashboardUrl}/login?error=token_exchange_failed&returnUrl=${encodeURIComponent(returnUrl)}`;
				});
		} else {
			if (hasRedirected.current) {
				return; // Already redirected, prevent loop
			}
			hasRedirected.current = true;
			// No code, redirect to dashboard login page
			const dashboardUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
			const returnUrl = state ? decodeURIComponent(state) : '/galleries';
			window.location.href = `${dashboardUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
		}
	}, [router, router.isReady, router.query]);

	return (
		<div style={{ padding: 24, textAlign: 'center' }}>
			<div>Completing login...</div>
		</div>
	);
}

