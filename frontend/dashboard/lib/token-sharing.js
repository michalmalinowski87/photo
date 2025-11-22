/**
 * Cross-Domain Token Sharing Utilities (Dashboard)
 * 
 * Allows sharing authentication tokens with landing domain
 * using postMessage API. Dashboard is the source of truth for auth.
 */

const TOKEN_SHARE_MESSAGE_TYPE = 'PHOTOHUB_TOKEN_SHARE';
const TOKEN_REQUEST_MESSAGE_TYPE = 'PHOTOHUB_TOKEN_REQUEST';
const TOKEN_RESPONSE_MESSAGE_TYPE = 'PHOTOHUB_TOKEN_RESPONSE';

/**
 * Request tokens from other domains (landing page)
 */
export function requestTokensFromOtherDomains() {
    if (typeof window === 'undefined') return;
    
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || window.location.origin;
    const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL;
    
    if (!landingUrl) return;
    
    const message = {
        type: TOKEN_REQUEST_MESSAGE_TYPE,
        source: window.location.origin
    };
    
    // Request from opener window (if opened from landing)
    if (window.opener && window.opener !== window) {
        try {
            window.opener.postMessage(message, landingUrl);
        } catch (e) {
            // Cross-origin error, ignore
        }
    }
    
    // Also try parent window (if in iframe)
    if (window.parent !== window) {
        try {
            window.parent.postMessage(message, landingUrl);
        } catch (e) {
            // Cross-origin error, ignore
        }
    }
}

/**
 * Share tokens with other domains
 */
export function shareTokensWithOtherDomains() {
    if (typeof window === 'undefined') return;
    
    const idToken = localStorage.getItem('idToken');
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!idToken) return;
    
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || window.location.origin;
    const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL;
    
    if (!landingUrl) return;
    
    const message = {
        type: TOKEN_SHARE_MESSAGE_TYPE,
        idToken,
        accessToken,
        refreshToken,
        source: window.location.origin
    };
    
    // Send to opener window
    if (window.opener && window.opener !== window) {
        try {
            window.opener.postMessage(message, landingUrl);
        } catch (e) {
            // Ignore errors
        }
    }
    
    // Send to parent window
    if (window.parent !== window) {
        try {
            window.parent.postMessage(message, landingUrl);
        } catch (e) {
            // Ignore errors
        }
    }
}

/**
 * Setup listener for token sharing messages
 */
export function setupTokenSharingListener() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('message', (event) => {
        // Verify origin is trusted
        const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || window.location.origin;
        const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL;
        
        const trustedOrigins = [dashboardUrl, landingUrl].filter(Boolean);
        
        // Validate origin
        const isValidOrigin = trustedOrigins.some(origin => {
            try {
                const originUrl = new URL(origin);
                const eventUrl = new URL(event.origin);
                return originUrl.hostname === eventUrl.hostname || 
                       eventUrl.hostname.endsWith(originUrl.hostname.replace(/^https?:\/\//, ''));
            } catch {
                return event.origin === origin || event.origin.startsWith(origin);
            }
        });
        
        if (!isValidOrigin) {
            return; // Ignore messages from untrusted origins
        }
        
        const data = event.data;
        
        // Handle token share message
        if (data && data.type === TOKEN_SHARE_MESSAGE_TYPE) {
            const { idToken, accessToken, refreshToken } = data;
            
            if (idToken) {
                // Verify token is valid before storing
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]));
                    const now = Math.floor(Date.now() / 1000);
                    
                    // Only store if token is not expired
                    if (payload.exp && payload.exp > now) {
                        localStorage.setItem('idToken', idToken);
                        if (accessToken) {
                            localStorage.setItem('accessToken', accessToken);
                        }
                        if (refreshToken) {
                            localStorage.setItem('refreshToken', refreshToken);
                        }
                        
                        // Reload page to update auth state
                        window.location.reload();
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
        
        // Handle token request message - respond if we have tokens
        if (data && data.type === TOKEN_REQUEST_MESSAGE_TYPE) {
            const idToken = localStorage.getItem('idToken');
            const accessToken = localStorage.getItem('accessToken');
            const refreshToken = localStorage.getItem('refreshToken');
            
            if (idToken) {
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]));
                    const now = Math.floor(Date.now() / 1000);
                    
                    if (payload.exp && payload.exp > now) {
                        // Respond with tokens
                        const response = {
                            type: TOKEN_RESPONSE_MESSAGE_TYPE,
                            idToken,
                            accessToken,
                            refreshToken,
                            source: window.location.origin
                        };
                        
                        if (event.source && event.source.postMessage) {
                            event.source.postMessage(response, event.origin);
                        }
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
        
        // Handle token response message
        if (data && data.type === TOKEN_RESPONSE_MESSAGE_TYPE) {
            const { idToken, accessToken, refreshToken } = data;
            
            if (idToken) {
                try {
                    const payload = JSON.parse(atob(idToken.split('.')[1]));
                    const now = Math.floor(Date.now() / 1000);
                    
                    if (payload.exp && payload.exp > now) {
                        localStorage.setItem('idToken', idToken);
                        if (accessToken) {
                            localStorage.setItem('accessToken', accessToken);
                        }
                        if (refreshToken) {
                            localStorage.setItem('refreshToken', refreshToken);
                        }
                        
                        // Reload page to update auth state
                        window.location.reload();
                    }
                } catch (e) {
                    // Invalid token, ignore
                }
            }
        }
    });
}

