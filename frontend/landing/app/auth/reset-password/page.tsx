"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, forgotPassword } from '@/lib/auth';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
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

    if (!email) {
      toast.error('Wprowadź adres email');
      setIsLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Nieprawidłowy format adresu email');
      setIsLoading(false);
      return;
    }

    try {
      await forgotPassword(email);
      toast.success('Kod resetowania hasła został wysłany na Twój email');
      router.push(`/auth/verify-reset-code?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'Nie udało się wysłać kodu resetowania hasła';
      
      if (error.code === 'RateLimitExceeded' || error.name === 'RateLimitExceeded') {
        errorMessage = error.message || 'Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć. Sprawdź również folder spam.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
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
          <h2 className="text-3xl font-bold text-black">Resetowanie hasła</h2>
          <p className="mt-2 text-sm text-dark-3">
            Wprowadź adres email powiązany z Twoim kontem. Wyślemy Ci kod weryfikacyjny do resetowania hasła.
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
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Wysyłanie...' : 'Wyślij kod resetowania'}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center">
          <p className="text-sm text-dark-3">
            Pamiętasz hasło?{' '}
            <Link href="/auth/login" className="font-medium text-primary hover:text-primary-dark">
              Zaloguj się
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

