"use client";

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCodeForTokens } from '@/lib/auth';
import Link from 'next/link';

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center max-w-sm w-full px-4">
        <Link href="/#home" className="mb-8">
          <span className="text-lg font-bold text-foreground">
            PhotoHub
          </span>
        </Link>
        
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="border-[3px] border-primary rounded-full border-b-transparent animate-spin w-12 h-12"></div>
            <div className="absolute inset-0 border-[3px] border-transparent rounded-full border-t-primary/30"></div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-foreground">
              Weryfikowanie konta...
            </p>
            <p className="text-sm text-muted-foreground">
              Proszę czekać, przekierowujemy Cię
            </p>
          </div>
        </div>
      </div>
    </div>
  )
};

export default AuthCallbackPage;

