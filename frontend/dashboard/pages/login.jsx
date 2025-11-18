import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { initAuth, signIn, getHostedUILoginUrl, exchangeCodeForTokens } from '../lib/auth';

export default function Login() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [useHostedUI, setUseHostedUI] = useState(true);
	const [exchanging, setExchanging] = useState(false);

	useEffect(() => {
		// Check for OAuth error
		const oauthError = router.query.error;
		if (oauthError) {
			setError(`OAuth error: ${oauthError}. ${router.query.error_description || ''}`);
			return;
		}
		
		// Check if we have auth code from callback
		const code = router.query.code;
		if (code) {
			setExchanging(true);
			setError('');
			// Exchange authorization code for tokens
			const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/login' : '';
			exchangeCodeForTokens(code, redirectUri)
				.then(() => {
					// Successfully got tokens, redirect to galleries
					router.replace('/galleries');
				})
				.catch((err) => {
					console.error('Token exchange failed:', err);
					setError(err.message || 'Failed to exchange authorization code for tokens');
					setExchanging(false);
				});
			return;
		}
		
		// Initialize auth
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		initAuth(userPoolId, clientId);
	}, [router]);

	const handleHostedUILogin = () => {
		const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/login' : '';
		
		if (!userPoolDomain || !clientId) {
			setError('Cognito configuration missing. Please set NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_COGNITO_CLIENT_ID');
			return;
		}
		
		const loginUrl = getHostedUILoginUrl(userPoolDomain, clientId, redirectUri);
		window.location.href = loginUrl;
	};

	const handleDirectLogin = async (e) => {
		e.preventDefault();
		setError('');
		try {
			const token = await signIn(email, password);
			localStorage.setItem('idToken', token);
			router.push('/galleries');
		} catch (err) {
			setError(err.message || 'Login failed');
		}
	};

	// Show loading state while exchanging code
	if (exchanging) {
		return (
			<div style={{ padding: 24, maxWidth: 400, margin: '50px auto', textAlign: 'center' }}>
				<h1>PhotoHub Dashboard Login</h1>
				<p>Completing login...</p>
			</div>
		);
	}

	return (
		<div style={{ padding: 24, maxWidth: 400, margin: '50px auto' }}>
			<h1>PhotoHub Dashboard Login</h1>
			
			{useHostedUI ? (
				<div>
					<button onClick={handleHostedUILogin} style={{ padding: '12px 24px', fontSize: '16px', width: '100%' }}>
						Login with Cognito Hosted UI
					</button>
					<p style={{ marginTop: 16, textAlign: 'center' }}>
						<button onClick={() => setUseHostedUI(false)} style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}>
							Use direct login instead
						</button>
					</p>
				</div>
			) : (
				<form onSubmit={handleDirectLogin}>
					<div style={{ marginBottom: 16 }}>
						<label style={{ display: 'block', marginBottom: 4 }}>Email</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							style={{ width: '100%', padding: 8 }}
						/>
					</div>
					<div style={{ marginBottom: 16 }}>
						<label style={{ display: 'block', marginBottom: 4 }}>Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							style={{ width: '100%', padding: 8 }}
						/>
					</div>
					<button type="submit" style={{ padding: '12px 24px', fontSize: '16px', width: '100%', marginBottom: 8 }}>
						Login
					</button>
					<p style={{ textAlign: 'center' }}>
						<button onClick={() => setUseHostedUI(true)} style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}>
							Use Hosted UI instead
						</button>
					</p>
				</form>
			)}
			
			{error && <p style={{ color: 'red', marginTop: 16 }}>{error}</p>}
			
			<div style={{ marginTop: 24, padding: 12, background: '#f5f5f5', fontSize: '14px' }}>
				<p><strong>Note:</strong> For development, you can still paste an ID_TOKEN manually in the galleries page.</p>
			</div>
		</div>
	);
}

