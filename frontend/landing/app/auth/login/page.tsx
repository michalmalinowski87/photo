"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, signIn, redirectToCognito } from '@/lib/auth';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
      const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

      if (!userPoolId || !clientId) {
        throw new Error('Auth configuration missing');
      }

      await signIn(email, password);
      toast.success('Zalogowano pomyślnie!');
      
      // Redirect to dashboard or returnUrl
      const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.location.href = `${dashboardUrl}/`;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Wystąpił błąd podczas logowania';
      
      if (error.code === 'NotAuthorizedException') {
        errorMessage = 'Nieprawidłowy email lub hasło';
      } else if (error.code === 'UserNotConfirmedException') {
        errorMessage = 'Konto nie zostało potwierdzone. Sprawdź email.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCognitoLogin = () => {
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
    const returnUrlToUse = returnUrl || `${dashboardUrl}/`;
    redirectToCognito(returnUrlToUse);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--light-3)' }}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block mb-6">
            <span className="brand-text-primary">
              PhotoCloud
            </span>
          </Link>
          <h2 className="text-3xl font-bold" style={{ color: 'var(--black)' }}>Zaloguj się</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--dark-3)' }}>
            Lub{' '}
            <Link href="/auth/signup" className="font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--primary)' }}>
              utwórz nowe konto
            </Link>
          </p>
        </div>

        <div className="rounded-lg shadow-lg p-8 border" style={{ backgroundColor: 'var(--white)', borderColor: 'var(--gray-3)' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: 'var(--dark-2)' }}>
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
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderColor: 'var(--gray-3)',
                  color: 'var(--dark-2)',
                }}
                placeholder="twoj@email.pl"
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--primary)';
                  e.target.style.boxShadow = '0 0 0 2px rgba(139, 111, 87, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--gray-3)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--dark-2)' }}>
                Hasło
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderColor: 'var(--gray-3)',
                  color: 'var(--dark-2)',
                }}
                placeholder="••••••••"
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--primary)';
                  e.target.style.boxShadow = '0 0 0 2px rgba(139, 111, 87, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--gray-3)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border transition-all focus:ring-2"
                  style={{
                    borderColor: 'var(--gray-3)',
                    accentColor: 'var(--primary)',
                  }}
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm" style={{ color: 'var(--dark-3)' }}>
                  Zapamiętaj mnie
                </label>
              </div>

              <div className="text-sm">
                <Link
                  href="/auth/reset-password"
                  className="font-medium hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--primary)' }}
                >
                  Zapomniałeś hasła?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{
                  backgroundColor: isLoading ? 'var(--gray-4)' : 'var(--primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                  }
                }}
              >
                {isLoading ? 'Logowanie...' : 'Zaloguj się'}
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--gray-3)' }}></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2" style={{ backgroundColor: 'var(--white)', color: 'var(--dark-3)' }}>Lub</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleCognitoLogin}
                className="w-full flex justify-center py-3 px-4 border text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all"
                style={{
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  backgroundColor: 'var(--white)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--light-1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--white)';
                }}
              >
                Zaloguj się przez Cognito Hosted UI
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
