"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import Link from 'next/link';

const LogoutCallbackPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Clear all tokens and session data on landing page
    signOut();
    
    // Force a page reload to ensure auth state is updated
    // This ensures the useAuth hook detects the logout
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  }, []);

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
              Wylogowywanie...
            </p>
            <p className="text-sm text-muted-foreground">
              Wylogowujemy Cię bezpiecznie
            </p>
          </div>
        </div>
      </div>
    </div>
  )
};

export default LogoutCallbackPage;

