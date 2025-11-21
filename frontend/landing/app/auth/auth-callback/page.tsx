"use client";

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCodeForTokens } from '@/lib/auth';

const AuthCallbackPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasProcessed.current) {
      return;
    }

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      router.push('/auth/sign-in?error=' + encodeURIComponent(error));
      return;
    }

    if (code) {
      hasProcessed.current = true; // Mark as processed to prevent double execution
      
      const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : '';
      const state = searchParams.get('state'); // Contains returnUrl
      
      exchangeCodeForTokens(code, redirectUri)
        .then(() => {
          // Successfully got tokens, check returnUrl from state
          const returnUrl = state ? decodeURIComponent(state) : null;
          
          if (returnUrl) {
            // Check if returnUrl is for dashboard or landing
            const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
            const isDashboardUrl = returnUrl.startsWith('/') && !returnUrl.startsWith('/auth');
            
            if (isDashboardUrl) {
              // Dashboard URL - redirect directly to dashboard page
              // The dashboard will check for tokens and redirect to Cognito if needed
              // Since tokens are in localStorage, dashboard can access them
              window.location.href = `${dashboardUrl}${returnUrl}`;
            } else if (returnUrl.startsWith('http')) {
              // Full URL, redirect directly
              window.location.href = returnUrl;
            } else {
              // Landing page URL
              router.push(returnUrl);
            }
          } else {
            // Default: redirect to dashboard galleries (Scenario 1)
            const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
            window.location.href = `${dashboardUrl}/galleries`;
          }
        })
        .catch(() => {
          const returnUrl = state ? decodeURIComponent(state) : '/galleries';
          router.push(`/auth/sign-in?error=token_exchange_failed&returnUrl=${encodeURIComponent(returnUrl)}`);
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

