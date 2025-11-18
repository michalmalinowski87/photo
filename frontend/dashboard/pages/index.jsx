import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { initAuth, getIdToken } from '../lib/auth';

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		// Check authentication and redirect
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
			getIdToken()
				.then(() => {
					// User is authenticated, redirect to galleries
					router.replace('/galleries');
				})
				.catch(() => {
					// Check localStorage as fallback
					const stored = localStorage.getItem('idToken');
					if (stored) {
						router.replace('/galleries');
					} else {
						router.replace('/login');
					}
				});
		} else {
			// No Cognito config, check localStorage
			const stored = localStorage.getItem('idToken');
			if (stored) {
				router.replace('/galleries');
			} else {
				router.replace('/login');
		}
	}
	}, [router]);

	// Show loading state while redirecting
	return (
		<div style={{ padding: 24, textAlign: 'center' }}>
			<p>Redirecting...</p>
		</div>
	);
}

