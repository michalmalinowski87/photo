"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, resendResetCode, confirmForgotPassword } from '@/lib/auth';
import { toast } from 'sonner';

export default function VerifyResetCodePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    } else {
      router.push('/auth/reset-password');
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown(resendCooldown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (code.length !== 6) {
      toast.error('Wprowadź 6-cyfrowy kod weryfikacyjny');
      setIsLoading(false);
      return;
    }

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
      await confirmForgotPassword(email, code, password);
      toast.success('Hasło zostało zresetowane pomyślnie!');
      router.push(`/auth/login${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
    } catch (error: any) {
      console.error('Confirm password reset error:', error);
      let errorMessage = 'Nie udało się zresetować hasła';
      
      if (error.code === 'CodeMismatchException') {
        errorMessage = 'Nieprawidłowy kod weryfikacyjny';
      } else if (error.code === 'ExpiredCodeException') {
        errorMessage = 'Kod weryfikacyjny wygasł. Wyślij nowy kod.';
      } else if (error.code === 'InvalidPasswordException') {
        errorMessage = 'Hasło nie spełnia wymagań bezpieczeństwa';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setResending(true);
    try {
      await resendResetCode(email);
      toast.success('Kod resetowania hasła został wysłany ponownie');
      setResendCooldown(60);
    } catch (error: any) {
      console.error('Resend code error:', error);
      let errorMessage = 'Nie udało się wysłać nowego kodu';
      
      if (error.code === 'RateLimitExceeded' || error.name === 'RateLimitExceeded') {
        errorMessage = error.message || 'Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      setResendCooldown(60);
    } finally {
      setResending(false);
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
          <h2 className="text-3xl font-bold text-black">Weryfikacja kodu</h2>
          <p className="mt-2 text-sm text-dark-3">
            Wprowadź 6-cyfrowy kod weryfikacyjny wysłany na adres <strong>{email}</strong>
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 border border-gray-3">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-dark-2 mb-2">
                Kod weryfikacyjny
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-3 rounded-lg placeholder-dark-3 text-dark-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-dark-2 mb-2">
                Nowe hasło
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
                disabled={isLoading || code.length !== 6}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Resetowanie...' : 'Zresetuj hasło'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending || resendCooldown > 0}
                className="text-sm font-medium text-primary hover:text-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resending
                  ? 'Wysyłanie...'
                  : resendCooldown > 0
                  ? `Wyślij nowy kod (${resendCooldown}s)`
                  : 'Wyślij nowy kod'}
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

