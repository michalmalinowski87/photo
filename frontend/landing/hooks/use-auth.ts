"use client"

import { useState, useEffect } from 'react'
import { initAuth, getCurrentUser } from '@/lib/auth'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initialize auth
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId)
    }

    // Check if user is logged in
    const checkAuth = () => {
      try {
        // Check localStorage for idToken (set by auth-callback)
        const idToken = typeof window !== 'undefined' ? localStorage.getItem('idToken') : null
        
        if (idToken) {
          // Verify token is not expired by checking if it exists and has valid format
          // Basic check: JWT has 3 parts separated by dots
          const parts = idToken.split('.')
          if (parts.length === 3) {
            try {
              // Decode payload to check expiration
              const payload = JSON.parse(atob(parts[1]))
              const now = Math.floor(Date.now() / 1000)
              
              if (payload.exp && payload.exp > now) {
                setIsAuthenticated(true)
                setIsLoading(false)
                return
              } else {
                // Token expired, clear it
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('idToken')
                  localStorage.removeItem('accessToken')
                  localStorage.removeItem('refreshToken')
                }
              }
            } catch (e) {
              // Invalid token format, clear it
              if (typeof window !== 'undefined') {
                localStorage.removeItem('idToken')
                localStorage.removeItem('accessToken')
                localStorage.removeItem('refreshToken')
              }
            }
          } else {
            // Invalid token structure, clear it
            if (typeof window !== 'undefined') {
              localStorage.removeItem('idToken')
              localStorage.removeItem('accessToken')
              localStorage.removeItem('refreshToken')
            }
          }
        }
        
        // Only check Cognito SDK session if we have an idToken
        // If idToken is cleared, we should be logged out regardless of Cognito SDK state
        if (!idToken) {
          setIsAuthenticated(false)
          setIsLoading(false)
          return
        }
        
        // Also check Cognito SDK session (only if we have idToken)
        const user = getCurrentUser()
        
        if (user) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      } catch (error) {
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()

    // Listen for storage changes (when user logs in/out in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'idToken' || e.key === 'accessToken' || e.key === 'refreshToken') {
        checkAuth()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    
    // Also listen for localStorage changes in the same tab (using custom event)
    const handleLocalStorageChange = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.key === 'idToken' || 
          customEvent.detail?.key === 'accessToken' || 
          customEvent.detail?.key === 'refreshToken') {
        checkAuth()
      }
    }
    
    window.addEventListener('localStorageChange', handleLocalStorageChange as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('localStorageChange', handleLocalStorageChange as EventListener)
    }
  }, [])

  return { isAuthenticated, isLoading }
}

