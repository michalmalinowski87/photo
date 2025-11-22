"use client"

import { useState, useEffect } from 'react'
import { checkDashboardAuthStatus } from '@/lib/dashboard-auth-check'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check auth status from dashboard domain
    const checkAuth = async () => {
      try {
        const authenticated = await checkDashboardAuthStatus()
        setIsAuthenticated(authenticated)
      } catch (error) {
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    // Initial check
    checkAuth()

    // Check periodically (every 3 seconds) to keep status updated
    const interval = setInterval(checkAuth, 3000)

    // Also check when window gains focus (user might have logged in/out in another tab)
    const handleFocus = () => {
      checkAuth()
    }

    window.addEventListener('focus', handleFocus)

    // Listen for visibility change (tab becomes visible)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAuth()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return { isAuthenticated, isLoading }
}

