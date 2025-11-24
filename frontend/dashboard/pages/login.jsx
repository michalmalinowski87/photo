import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { initAuth, signIn, getCurrentUser } from '../lib/auth';
import { shareTokensWithOtherDomains } from '../lib/token-sharing';
import { setupDashboardAuthStatusListener } from '../lib/dashboard-auth-status';
import Button from '../components/ui/button/Button';
import Input from '../components/ui/input/InputField';

export default function Login() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const hasRedirected = useRef(false);

	useEffect(() => {
		// Setup auth status listener for landing page
		setupDashboardAuthStatusListener();
		
		// Initialize auth
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
		}

		// Check if user already has a valid session
		const checkExistingSession = async () => {
			try {
				// Check localStorage for idToken
				const idToken = localStorage.getItem('idToken');
				if (idToken) {
					try {
						const payload = JSON.parse(atob(idToken.split('.')[1]));
						const now = Math.floor(Date.now() / 1000);
						if (payload.exp && payload.exp > now) {
							// Token is valid, redirect to galleries
							const returnUrl = router.query.returnUrl || '/galleries';
							if (!hasRedirected.current) {
								hasRedirected.current = true;
								router.push(typeof returnUrl === 'string' ? returnUrl : '/galleries');
								return;
							}
						}
					} catch (e) {
						// Token invalid, continue to show login form
					}
				}

				// Check Cognito SDK session
				const user = getCurrentUser();
				if (user) {
					const returnUrl = router.query.returnUrl || '/galleries';
					if (!hasRedirected.current) {
						hasRedirected.current = true;
						router.push(typeof returnUrl === 'string' ? returnUrl : '/galleries');
						return;
					}
				}
			} catch (e) {
				// Error checking session, continue to show login form
			} finally {
				setCheckingSession(false);
			}
		};

		checkExistingSession();
	}, [router]);

	const handleSignIn = async (e) => {
		e.preventDefault();
		setError('');
		
		if (!email || !password) {
			setError('Wprowadź email i hasło');
			return;
		}

		setLoading(true);

		try {
			// Login via SDK (stores tokens in localStorage)
			await signIn(email, password);
			
			// Share tokens with landing domain via postMessage
			shareTokensWithOtherDomains();
			
			// Small delay to ensure postMessage is sent
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Redirect to galleries or returnUrl
			const returnUrl = router.query.returnUrl || '/galleries';
			router.push(typeof returnUrl === 'string' ? returnUrl : '/galleries');
		} catch (err) {
			setLoading(false);
			// Handle Cognito errors
			if (err.code === 'NotAuthorizedException' || err.code === 'UserNotFoundException') {
				setError('Nieprawidłowy email lub hasło');
			} else if (err.code === 'UserNotConfirmedException') {
				setError('Konto nie zostało zweryfikowane. Sprawdź email z kodem weryfikacyjnym.');
				router.push(`/verify-email?email=${encodeURIComponent(email)}`);
			} else if (err.message) {
				setError(err.message);
			} else {
				setError('Nie udało się zalogować. Spróbuj ponownie.');
			}
		}
	};

	if (checkingSession) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen bg-background">
				<div className="flex flex-col items-center max-w-sm w-full px-4">
					<div className="relative">
						<div className="border-[3px] border-primary rounded-full border-b-transparent animate-spin w-12 h-12"></div>
						<div className="absolute inset-0 border-[3px] border-transparent rounded-full border-t-primary/30"></div>
					</div>
					<p className="text-sm text-muted-foreground mt-4">
						Sprawdzanie sesji...
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
			<div className="flex items-center w-full py-8 border-b border-border/80">
				<Link href="/galleries" className="flex items-center gap-x-2">
					<span className="text-lg font-bold text-foreground">
						PhotoHub
					</span>
				</Link>
			</div>

			<div className="flex flex-col w-full mt-8">
				<h2 className="text-2xl font-semibold mb-2 text-foreground">Zaloguj się</h2>
				<p className="text-sm text-muted-foreground mb-6">
					Zaloguj się, aby zarządzać swoimi galeriami i klientami
				</p>
				
				{error && (
					<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
						{error}
					</div>
				)}

				<form onSubmit={handleSignIn} className="w-full space-y-4">
					<div className="space-y-2">
						<label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
							Email
						</label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="twoj@email.com"
							disabled={loading}
							className="w-full"
						/>
					</div>

					<div className="space-y-2">
						<label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
							Hasło
						</label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Wprowadź hasło"
							disabled={loading}
							className="w-full"
						/>
					</div>

					<Button type="submit" variant="primary" className="w-full" disabled={loading}>
						{loading ? 'Logowanie...' : 'Zaloguj się'}
					</Button>
				</form>
			</div>

			<div className="flex flex-col items-start w-full mt-8">
				<p className="text-sm text-muted-foreground">
					Logując się, akceptujesz nasze{" "}
					<Link href="/terms" className="text-primary font-bold">
						Warunki korzystania{" "}
					</Link>
					i{" "}
					<Link href="/privacy" className="text-primary font-bold">
						Politykę prywatności
					</Link>
				</p>
			</div>
			
			<div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
				<p className="text-sm text-muted-foreground">
					Nie masz konta?{" "}
					<Link href="/sign-up" className="text-primary font-bold">
						Zarejestruj się
					</Link>
				</p>
			</div>
		</div>
	);
}
