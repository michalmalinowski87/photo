/**
 * Cross-Domain Token Sharing Utilities
 * 
 * Allows sharing authentication tokens between landing and dashboard domains
 * using postMessage API. This enables self-hosted login forms while maintaining
 * cross-domain authentication.
 */

const TOKEN_SHARE_MESSAGE_TYPE = 'PHOTOCLOUD_TOKEN_SHARE'
const TOKEN_REQUEST_MESSAGE_TYPE = 'PHOTOCLOUD_TOKEN_REQUEST'
const TOKEN_RESPONSE_MESSAGE_TYPE = 'PHOTOCLOUD_TOKEN_RESPONSE'

/**
 * Share tokens with other trusted domains
 */
export function shareTokensWithOtherDomains() {
    if (typeof window === 'undefined') return
    
    const idToken = localStorage.getItem('idToken')
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    
    if (!idToken) return
    
    // Get trusted domains
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL
    const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || window.location.origin
    
    const trustedDomains = [
        dashboardUrl,
        landingUrl
    ].filter(Boolean) as string[]
    
    // Share tokens via postMessage
    trustedDomains.forEach(domain => {
        try {
            // Use window.postMessage to share with parent/opener windows
            // Also broadcast to all iframes
            const message = {
                type: TOKEN_SHARE_MESSAGE_TYPE,
                idToken,
                accessToken,
                refreshToken,
                source: window.location.origin
            }
            
            // Send to parent window (if in iframe)
            if (window.parent !== window) {
                window.parent.postMessage(message, '*') // Use '*' for cross-origin, validate on receiver
            }
            
            // Send to opener window (if opened via window.open)
            if (window.opener) {
                window.opener.postMessage(message, '*')
            }
            
            // Broadcast to all iframes
            const iframes = document.querySelectorAll('iframe')
            iframes.forEach(iframe => {
                try {
                    iframe.contentWindow?.postMessage(message, '*')
                } catch (e) {
                    // Ignore cross-origin errors
                }
            })
        } catch (e) {
            // Ignore errors
        }
    })
}

/**
 * Request tokens from other domains
 */
export function requestTokensFromOtherDomains() {
    if (typeof window === 'undefined') return
    
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL
    const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || window.location.origin
    
    const trustedDomains = [
        dashboardUrl,
        landingUrl
    ].filter(Boolean) as string[]
    
    const message = {
        type: TOKEN_REQUEST_MESSAGE_TYPE,
        source: window.location.origin
    }
    
    // Request from parent/opener
    if (window.parent !== window) {
        window.parent.postMessage(message, '*')
    }
    
    if (window.opener) {
        window.opener.postMessage(message, '*')
    }
}

/**
 * Setup listener for token sharing messages
 */
export function setupTokenSharingListener() {
    if (typeof window === 'undefined') return
    
    window.addEventListener('message', (event) => {
        // Verify origin is trusted
        const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL
        const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || window.location.origin
        
        const trustedOrigins = [
            dashboardUrl,
            landingUrl
        ].filter(Boolean) as string[]
        
        // Validate origin matches trusted domains
        const isValidOrigin = trustedOrigins.some(origin => {
            try {
                const originUrl = new URL(origin)
                const eventUrl = new URL(event.origin)
                return originUrl.hostname === eventUrl.hostname || 
                       eventUrl.hostname.endsWith(originUrl.hostname.replace(/^https?:\/\//, ''))
            } catch {
                return event.origin === origin || event.origin.startsWith(origin)
            }
        })
        
        if (!isValidOrigin) {
            return // Ignore messages from untrusted origins
        }
        
        const data = event.data
        
        // Handle token share message
        if (data && data.type === TOKEN_SHARE_MESSAGE_TYPE) {
            const { idToken, accessToken, refreshToken } = data
            
            if (idToken) {
                // Verify token is valid before storing
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]))
                    const now = Math.floor(Date.now() / 1000)
                    
                    // Only store if token is not expired
                    if (payload.exp && payload.exp > now) {
                        localStorage.setItem('idToken', idToken)
                        if (accessToken) {
                            localStorage.setItem('accessToken', accessToken)
                        }
                        if (refreshToken) {
                            localStorage.setItem('refreshToken', refreshToken)
                        }
                        
                        // Notify auth hook
                        window.dispatchEvent(new CustomEvent('localStorageChange', {
                            detail: { key: 'idToken', value: idToken, oldValue: null }
                        }))
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
        
        // Handle token request message
        if (data && data.type === TOKEN_REQUEST_MESSAGE_TYPE) {
            const idToken = localStorage.getItem('idToken')
            const accessToken = localStorage.getItem('accessToken')
            const refreshToken = localStorage.getItem('refreshToken')
            
            if (idToken) {
                // Verify token is valid
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]))
                    const now = Math.floor(Date.now() / 1000)
                    
                    if (payload.exp && payload.exp > now) {
                        // Respond with tokens
                        const response = {
                            type: TOKEN_RESPONSE_MESSAGE_TYPE,
                            idToken,
                            accessToken,
                            refreshToken,
                            source: window.location.origin
                        }
                        
                        if (event.source && 'postMessage' in event.source) {
                            (event.source as Window).postMessage(response, event.origin)
                        }
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
        
        // Handle token response message
        if (data && data.type === TOKEN_RESPONSE_MESSAGE_TYPE) {
            const { idToken, accessToken, refreshToken } = data
            
            if (idToken) {
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]))
                    const now = Math.floor(Date.now() / 1000)
                    
                    if (payload.exp && payload.exp > now) {
                        localStorage.setItem('idToken', idToken)
                        if (accessToken) {
                            localStorage.setItem('accessToken', accessToken)
                        }
                        if (refreshToken) {
                            localStorage.setItem('refreshToken', refreshToken)
                        }
                        
                        window.dispatchEvent(new CustomEvent('localStorageChange', {
                            detail: { key: 'idToken', value: idToken, oldValue: null }
                        }))
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
    })
}

