"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, confirmSignUp, resendConfirmationCode } from '@/lib/auth';
import { toast } from 'sonner';

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    } else {
      router.push('/auth/signup');
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

    try {
      await confirmSignUp(email, code);
      toast.success('Email został potwierdzony! Możesz się teraz zalogować.');
      router.push(`/auth/login${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
    } catch (error: any) {
      console.error('Confirm email error:', error);
      let errorMessage = 'Nie udało się potwierdzić email';
      
      if (error.code === 'CodeMismatchException') {
        errorMessage = 'Nieprawidłowy kod weryfikacyjny';
      } else if (error.code === 'ExpiredCodeException') {
        errorMessage = 'Kod weryfikacyjny wygasł. Wyślij nowy kod.';
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
      await resendConfirmationCode(email);
      toast.success('Kod weryfikacyjny został wysłany ponownie');
      setResendCooldown(60);
    } catch (error: any) {
      console.error('Resend code error:', error);
      let errorMessage = 'Nie udało się wysłać nowego kodu';
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      setResendCooldown(60);
    } finally {
      setResending(false);
    }
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
          <h2 className="text-3xl font-bold" style={{ color: 'var(--black)' }}>Potwierdź email</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--dark-3)' }}>
            Wprowadź 6-cyfrowy kod weryfikacyjny wysłany na adres <strong style={{ color: 'var(--dark-2)' }}>{email}</strong>
          </p>
        </div>

        <div className="rounded-lg shadow-lg p-8 border" style={{ backgroundColor: 'var(--white)', borderColor: 'var(--gray-3)' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="code" className="block text-sm font-medium mb-2" style={{ color: 'var(--dark-2)' }}>
                Kod weryfikacyjny
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all text-center text-2xl tracking-widest"
                style={{
                  borderColor: 'var(--gray-3)',
                  color: 'var(--dark-2)',
                }}
                placeholder="000000"
                maxLength={6}
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
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{
                  backgroundColor: isLoading || code.length !== 6 ? 'var(--gray-4)' : 'var(--primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && code.length === 6) {
                    e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && code.length === 6) {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                  }
                }}
              >
                {isLoading ? 'Potwierdzanie...' : 'Potwierdź email'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending || resendCooldown > 0}
                className="text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: 'var(--primary)' }}
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
          <p className="text-sm" style={{ color: 'var(--dark-3)' }}>
            Nie otrzymałeś kodu? Sprawdź folder spam lub{' '}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending || resendCooldown > 0}
              className="font-medium hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: 'var(--primary)' }}
            >
              wyślij ponownie
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
