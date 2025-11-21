"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCodeForTokens } from '@/lib/auth';

const AuthCallbackPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error, searchParams.get('error_description'));
      router.push('/auth/sign-in?error=' + encodeURIComponent(error));
      return;
    }

    if (code) {
      const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : '';
      exchangeCodeForTokens(code, redirectUri)
        .then(() => {
          // Successfully got tokens, redirect to dashboard
          const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
          window.location.href = dashboardUrl;
        })
        .catch((err) => {
          console.error('Token exchange failed:', err);
          router.push('/auth/sign-in?error=token_exchange_failed');
        });
    } else {
      router.push('/auth/sign-in');
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center flex-col h-screen relative">
      <div className="border-[3px] border-neutral-800 rounded-full border-b-neutral-200 animate-spin w-8 h-8"></div>
      <p className="text-lg font-medium text-center mt-3 text-foreground">
        Weryfikowanie konta...
      </p>
    </div>
  )
};

export default AuthCallbackPage;

