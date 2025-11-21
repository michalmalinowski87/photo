"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

const LogoutCallbackPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Clear all tokens and session data on landing page
    signOut();
    
    // Force a page reload to ensure auth state is updated
    // This ensures the useAuth hook detects the logout
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  }, []);

  return (
    <div className="flex items-center justify-center flex-col h-screen relative">
      <div className="border-[3px] border-neutral-800 rounded-full border-b-neutral-200 animate-spin w-8 h-8"></div>
      <p className="text-lg font-medium text-center mt-3 text-foreground">
        Wylogowywanie...
      </p>
    </div>
  )
};

export default LogoutCallbackPage;

