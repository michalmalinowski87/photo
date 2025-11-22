import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { initAuth, confirmSignUp, resendConfirmationCode } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function VerifyEmail() {
	const router = useRouter();
	const [code, setCode] = useState('');
	const [email, setEmail] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState(false);
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);

	useEffect(() => {
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
		}

		// Get email from query params
		const emailParam = router.query.email;
		if (emailParam) {
			setEmail(decodeURIComponent(typeof emailParam === 'string' ? emailParam : emailParam[0]));
		} else {
			// No email provided, redirect to sign-up
			router.push('/sign-up');
		}
	}, [router]);

	const handleVerify = async (e) => {
		e.preventDefault();
		setError('');
		
		if (!code || code.length !== 6) {
			setError('Wprowadź 6-cyfrowy kod weryfikacyjny');
			return;
		}

		setLoading(true);

		try {
			await confirmSignUp(email, code);
			setSuccess(true);
			// Redirect to login after a short delay
			const returnUrl = router.query.returnUrl || '/galleries';
			setTimeout(() => {
				router.push(`/login?verified=true${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === 'string' ? returnUrl : returnUrl[0])}` : ''}`);
			}, 2000);
		} catch (err) {
			setLoading(false);
			// Handle Cognito errors
			if (err.code === 'CodeMismatchException') {
				setError('Nieprawidłowy kod weryfikacyjny');
			} else if (err.code === 'ExpiredCodeException') {
				setError('Kod weryfikacyjny wygasł. Wyślij nowy kod.');
			} else if (err.message) {
				setError(err.message);
			} else {
				setError('Nie udało się zweryfikować konta. Spróbuj ponownie.');
			}
		}
	};

	const handleResendCode = async () => {
		setError('');
		setResending(true);

		try {
			await resendConfirmationCode(email);
			setError('');
			// Show success message
			alert('Nowy kod weryfikacyjny został wysłany na Twój adres email');
		} catch (err) {
			if (err.message) {
				setError(err.message);
			} else {
				setError('Nie udało się wysłać nowego kodu. Spróbuj ponownie.');
			}
		} finally {
			setResending(false);
		}
	};

	if (success) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<div className="max-w-sm w-full mx-auto px-4">
					<div className="text-center">
						<div className="mb-4 text-green-600 text-4xl">✓</div>
						<h2 className="text-2xl font-semibold mb-2 text-foreground">Konto zweryfikowane!</h2>
						<p className="text-sm text-muted-foreground mb-6">
							Przekierowywanie do strony logowania...
						</p>
					</div>
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
				<h2 className="text-2xl font-semibold mb-2 text-foreground">Weryfikacja email</h2>
				<p className="text-sm text-muted-foreground mb-6">
					Wprowadź 6-cyfrowy kod weryfikacyjny wysłany na adres <strong>{email}</strong>
				</p>
				
				{error && (
					<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
						{error}
					</div>
				)}

				<form onSubmit={handleVerify} className="w-full space-y-4">
					<div className="space-y-2">
						<Label htmlFor="code">Kod weryfikacyjny</Label>
						<Input
							id="code"
							type="text"
							value={code}
							onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
							placeholder="000000"
							disabled={loading}
							required
							maxLength={6}
							className="text-center text-2xl tracking-widest"
							autoFocus
						/>
					</div>

					<Button type="submit" variant="primary" className="w-full" size="lg" disabled={loading || code.length !== 6}>
						{loading ? 'Weryfikowanie...' : 'Zweryfikuj konto'}
					</Button>
				</form>

				<div className="mt-4 text-center">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleResendCode}
						disabled={resending}
						className="text-sm"
					>
						{resending ? 'Wysyłanie...' : 'Wyślij nowy kod'}
					</Button>
				</div>
			</div>
			
			<div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
				<p className="text-sm text-muted-foreground">
					Nie otrzymałeś kodu? Sprawdź folder spam lub{" "}
					<button
						type="button"
						onClick={handleResendCode}
						disabled={resending}
						className="text-primary font-bold hover:underline"
					>
						wyślij ponownie
					</button>
				</p>
			</div>
		</div>
	);
}

