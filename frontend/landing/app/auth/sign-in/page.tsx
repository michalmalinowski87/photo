"use client"

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { redirectToCognito } from '@/lib/auth'
import Link from 'next/link'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const hasRedirected = useRef(false)

  useEffect(() => {
    // Always redirect directly to Cognito Hosted UI
    // No form shown - user goes straight to Cognito login page
    if (hasRedirected.current) {
      return
    }

    hasRedirected.current = true

    // Get returnUrl from query params or default to dashboard /galleries
    const returnUrl = searchParams.get('returnUrl')
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'
    
    // Build return URL - default to dashboard /galleries
    const fullReturnUrl = returnUrl 
      ? (returnUrl.startsWith('/') && !returnUrl.startsWith('/auth')
          ? `${dashboardUrl}${returnUrl}`
          : returnUrl)
      : `${dashboardUrl}/galleries`
    
    // Redirect directly to Cognito Hosted UI
    redirectToCognito(fullReturnUrl).catch(() => {
      // If redirect fails, reset flag to allow retry
      hasRedirected.current = false
    })
  }, [searchParams])

  // Show loading state while redirecting
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
              Przekierowywanie do logowania...
            </p>
            <p className="text-sm text-muted-foreground">
              Proszę czekać
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
