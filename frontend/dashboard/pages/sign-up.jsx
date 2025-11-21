import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SignUp() {
	const router = useRouter();

	useEffect(() => {
		// Get returnUrl from query or default to /galleries
		const returnUrl = router.query.returnUrl || '/galleries';
		const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:3000';
		const signUpUrl = `${landingUrl}/auth/sign-up?returnUrl=${encodeURIComponent(typeof returnUrl === 'string' ? returnUrl : '/galleries')}`;
		window.location.href = signUpUrl;
	}, [router]);

	return (
		<div style={{ padding: 24, maxWidth: 400, margin: '50px auto', textAlign: 'center' }}>
			<p>Redirecting to sign up...</p>
		</div>
	);
}

