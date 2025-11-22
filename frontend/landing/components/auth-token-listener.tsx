"use client"

import { useEffect } from 'react'
import { setupTokenSharingListener } from '@/lib/token-sharing'

/**
 * Global token sharing listener component
 * Sets up postMessage listener for cross-domain token sharing
 * Should be included in root layout
 */
export function AuthTokenListener() {
  useEffect(() => {
    setupTokenSharingListener()
  }, [])

  return null
}

