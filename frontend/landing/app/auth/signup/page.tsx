"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, signUp, redirectToCognito } from '@/lib/auth';
import { toast } from 'sonner';

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password !== confirmPassword) {
      toast.error('Hasła nie są identyczne');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      toast.error('Hasło musi mieć co najmniej 8 znaków');
      setIsLoading(false);
      return;
    }

    try {
      const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

      if (!userPoolId || !clientId) {
        throw new Error('Auth configuration missing');
      }

      await signUp(email, password);
      toast.success('Konto utworzone! Sprawdź email, aby potwierdzić konto.');
      
      // Redirect to confirm email page
      router.push(`/auth/confirm-email?email=${encodeURIComponent(email)}`);
    } catch (error: any) {
      console.error('Sign up error:', error);
      let errorMessage = 'Wystąpił błąd podczas rejestracji';
      
      if (error.code === 'UsernameExistsException') {
        errorMessage = 'Użytkownik z tym emailem już istnieje';
      } else if (error.code === 'InvalidPasswordException') {
        errorMessage = 'Hasło nie spełnia wymagań';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCognitoSignUp = () => {
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
    const returnUrlToUse = returnUrl || `${dashboardUrl}/`;
    redirectToCognito(returnUrlToUse);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-3 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block mb-6">
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>
              PhotoCloud
            </span>
          </Link>
          <h2 className="text-3xl font-bold text-black">Utwórz konto</h2>
          <p className="mt-2 text-sm text-dark-3">
            Lub{' '}
            <Link href="/auth/login" className="font-medium text-primary hover:text-primary-dark">
              zaloguj się do istniejącego konta
            </Link>
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 border border-gray-3">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-dark-2 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-3 rounded-lg placeholder-dark-3 text-dark-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="twoj@email.pl"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-dark-2 mb-2">
                Hasło
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-3 rounded-lg placeholder-dark-3 text-dark-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Minimum 8 znaków"
              />
              <p className="mt-1 text-xs text-dark-3">
                Hasło musi mieć co najmniej 8 znaków
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-dark-2 mb-2">
                Potwierdź hasło
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-3 rounded-lg placeholder-dark-3 text-dark-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Powtórz hasło"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Tworzenie konta...' : 'Utwórz konto'}
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-3"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-dark-3">Lub</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleCognitoSignUp}
                className="w-full flex justify-center py-3 px-4 border border-primary text-sm font-medium rounded-lg text-primary bg-white hover:bg-light-1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Zarejestruj się przez Cognito Hosted UI
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

