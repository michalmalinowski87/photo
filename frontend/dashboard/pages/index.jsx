import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { initializeAuth, redirectToLandingSignIn } from '../lib/auth-init';
import { setupDashboardAuthStatusListener } from '../lib/dashboard-auth-status';

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		// Setup auth status listener for landing page
		setupDashboardAuthStatusListener();

		initializeAuth(
			() => {
				// User is authenticated, redirect to galleries
				router.replace('/galleries');
			},
			() => {
				// No token found, redirect to login page
				router.replace('/login?returnUrl=/galleries');
			}
		);
	}, [router]);

	// Show loading state while redirecting
	return (
		<div style={{ padding: 24, textAlign: 'center' }}>
			<p>Redirecting...</p>
		</div>
	);
}

