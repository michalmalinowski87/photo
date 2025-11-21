"use client"

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { redirectToCognito } from '@/lib/auth'

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
    <div className="flex items-center justify-center flex-col h-screen relative">
      <div className="border-[3px] border-neutral-800 rounded-full border-b-neutral-200 animate-spin w-8 h-8"></div>
      <p className="text-lg font-medium text-center mt-3 text-foreground">
        Przekierowywanie do logowania...
      </p>
    </div>
  )
}
