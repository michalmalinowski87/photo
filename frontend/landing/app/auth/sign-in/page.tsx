"use client"

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { initAuth, getHostedUILoginUrl, exchangeCodeForTokens } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Icons } from "@/components";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId)
    }

    // Check for OAuth error
    const oauthError = searchParams.get('error')
    if (oauthError) {
      console.error('OAuth error:', oauthError, searchParams.get('error_description'))
      return
    }
    
    // Check if we have auth code from callback
    const code = searchParams.get('code')
    if (code) {
      const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : ''
      exchangeCodeForTokens(code, redirectUri)
        .then(() => {
          // Successfully got tokens, redirect to dashboard
          const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'
          window.location.href = dashboardUrl
        })
        .catch((err) => {
          console.error('Token exchange failed:', err)
        })
      return
    }
  }, [router, searchParams])

  const handleLogin = () => {
    const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (!userPoolDomain || !clientId) {
      alert('Konfiguracja uwierzytelniania nie jest dostępna. Skontaktuj się z administratorem.')
      return
    }

    const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : ''
    const loginUrl = getHostedUILoginUrl(userPoolDomain, clientId, redirectUri)
    window.location.href = loginUrl
  }

  return (
    <div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
      <div className="flex items-center w-full py-8 border-b border-border/80">
        <Link href="/#home" className="flex items-center gap-x-2">
          <span className="text-lg font-bold text-foreground">
            PhotoHub
          </span>
        </Link>
      </div>

      <div className="flex flex-col w-full mt-8">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Zaloguj się</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Zaloguj się, aby zarządzać swoimi galeriami i klientami
        </p>
        <Button onClick={handleLogin} className="w-full" size="lg">
          Zaloguj się / Zarejestruj
        </Button>
      </div>

      <div className="flex flex-col items-start w-full mt-8">
        <p className="text-sm text-muted-foreground">
          Logując się, akceptujesz nasze{" "}
          <Link href="/terms" className="text-primary">
            Warunki korzystania{" "}
          </Link>
          i{" "}
          <Link href="/privacy" className="text-primary">
            Politykę prywatności
          </Link>
        </p>
      </div>
      <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
        <p className="text-sm text-muted-foreground">
          Nie masz konta?{" "}
          <Link href="/auth/sign-up" className="text-primary">
            Zarejestruj się
          </Link>
        </p>
      </div>
    </div>
  )
}

