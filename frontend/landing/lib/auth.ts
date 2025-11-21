import { CognitoUserPool, CognitoUser, CognitoUserAttribute } from 'amazon-cognito-identity-js'

let userPool: CognitoUserPool | null = null

// Helper to clear userPool cache
function clearUserPoolCache() {
    userPool = null
}

export function initAuth(userPoolId: string, clientId: string) {
    if (!userPoolId || !clientId) {
        console.warn('Cognito config missing')
        return null
    }
    if (!userPool) {
        userPool = new CognitoUserPool({
            UserPoolId: userPoolId,
            ClientId: clientId
        })
    }
    return userPool
}

export function getCurrentUser() {
    if (!userPool) return null
    return userPool.getCurrentUser()
}

export function getIdToken(): Promise<string> {
    return new Promise((resolve, reject) => {
        const user = getCurrentUser()
        if (!user) {
            reject(new Error('No user logged in'))
            return
        }
        user.getSession((err: any, session: any) => {
            if (err || !session || !session.isValid()) {
                reject(err || new Error('Invalid session'))
                return
            }
            resolve(session.getIdToken().getJwtToken())
        })
    })
}

export function signOut() {
    // Clear Cognito SDK session
    const user = getCurrentUser()
    if (user) {
        user.signOut()
    }
    
    // Clear all tokens from localStorage
    if (typeof window !== 'undefined') {
        // Dispatch custom event before removing to notify listeners in same tab
        const keysToRemove = ['idToken', 'accessToken', 'refreshToken']
        keysToRemove.forEach(key => {
            const value = localStorage.getItem(key)
            if (value) {
                localStorage.removeItem(key)
                // Dispatch custom event for same-tab listeners
                window.dispatchEvent(new CustomEvent('localStorageChange', {
                    detail: { key, value: null, oldValue: value }
                }))
            }
        })
        
        // Clear Cognito sessionStorage items
        const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
        if (clientId) {
            // Clear all CognitoIdentityServiceProvider keys
            const keysToRemove: string[] = []
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i)
                if (key && (
                    key.startsWith(`CognitoIdentityServiceProvider.${clientId}`) ||
                    key.includes('CognitoIdentityServiceProvider')
                )) {
                    keysToRemove.push(key)
                }
            }
            keysToRemove.forEach(key => {
                sessionStorage.removeItem(key)
            })
        }
        
        // Clear PKCE verifier if present
        sessionStorage.removeItem('pkce_code_verifier')
        
        // Force clear the userPool's cached user by resetting it
        // This ensures getCurrentUser() returns null on next call
        clearUserPoolCache()
    }
}

export function signUp(email: string, password: string): Promise<CognitoUser> {
    return new Promise((resolve, reject) => {
        if (!userPool) {
            reject(new Error('Auth not initialized'))
            return
        }

        const attributeList = [
            new CognitoUserAttribute({
                Name: 'email',
                Value: email
            })
        ]

        userPool.signUp(email, password, attributeList, [], (err, result) => {
            if (err) {
                reject(err)
                return
            }
            if (!result || !result.user) {
                reject(new Error('Sign up failed'))
                return
            }
            resolve(result.user)
        })
    })
}

export function confirmSignUp(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!userPool) {
            reject(new Error('Auth not initialized'))
            return
        }

        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool
        })

        cognitoUser.confirmRegistration(code, true, (err, result) => {
            if (err) {
                reject(err)
                return
            }
            resolve()
        })
    })
}

export function resendConfirmationCode(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!userPool) {
            reject(new Error('Auth not initialized'))
            return
        }

        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool
        })

        cognitoUser.resendConfirmationCode((err, result) => {
            if (err) {
                reject(err)
                return
            }
            resolve()
        })
    })
}

// Generate random string for PKCE
function generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
    let random = ''
    const values = new Uint8Array(length)
    crypto.getRandomValues(values)
    // Use Array.from to iterate over Uint8Array
    Array.from(values).forEach((value) => {
        random += charset[value % charset.length]
    })
    return random
}

// Generate code challenge from verifier
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const digestArray = new Uint8Array(digest)
    return btoa(String.fromCharCode(...Array.from(digestArray)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

export async function redirectToCognito(returnUrl: string | null = null, callbackPath: string = '/auth/auth-callback'): Promise<void> {
    const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (!userPoolDomain || !clientId) {
        console.error('Cognito configuration missing')
        return
    }
    
    // Generate PKCE challenge
    const codeVerifier = generateRandomString(128)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    
    // Store verifier in sessionStorage (domain-specific, cleared on close)
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('pkce_code_verifier', codeVerifier)
    }
    
    // Build callback URL - MUST match exactly what's configured in Cognito
    const redirectUri = typeof window !== 'undefined' 
        ? `${window.location.origin}${callbackPath}`
        : ''
    
    // Build Cognito authorize URL
    let domain = userPoolDomain.replace(/^https?:\/\//, '')
    if (domain.includes('.amazonaws.com')) {
        domain = domain.replace('.amazonaws.com', '.amazoncognito.com')
    }
    if (!domain.includes('.amazoncognito.com')) {
        const parts = domain.split('.')
        const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1'
        domain = `${domain}.auth.${region}.amazoncognito.com`
    }
    
    const baseUrl = `https://${domain}`
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    })
    
    // Add state parameter with returnUrl
    if (returnUrl) {
        params.append('state', encodeURIComponent(returnUrl))
    }
    
    // Try silent authentication first if user might already be logged in
    // This helps when user logged in via SDK and we're redirecting to Cognito
    // Note: This might not work if SDK session doesn't create server-side cookie
    // In that case, Cognito will show login page, which is acceptable
    
    const authUrl = `${baseUrl}/oauth2/authorize?${params.toString()}`
    
    if (typeof window !== 'undefined') {
        window.location.href = authUrl
    }
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<string> {
    const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (!userPoolDomain || !clientId) {
        throw new Error('Cognito configuration missing')
    }
    
    // Get PKCE verifier from sessionStorage (don't remove it yet - only remove after successful exchange)
    let codeVerifier: string | null = null
    if (typeof window !== 'undefined') {
        codeVerifier = sessionStorage.getItem('pkce_code_verifier')
        // Don't remove here - remove only after successful token exchange
    }
    
    if (!codeVerifier) {
        throw new Error('PKCE verifier not found. Please restart the authentication flow.')
    }
    
    let domain = userPoolDomain.replace(/^https?:\/\//, '')
    if (domain.includes('.amazonaws.com')) {
        domain = domain.replace('.amazonaws.com', '.amazoncognito.com')
    }
    if (!domain.includes('.amazoncognito.com')) {
        const parts = domain.split('.')
        const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1'
        domain = `${domain}.auth.${region}.amazoncognito.com`
    }
    
    const tokenUrl = `https://${domain}/oauth2/token`
    
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    })
    
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    })
    
    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
    }
    
    const tokens = await response.json()
    
    // Remove PKCE verifier AFTER successful token exchange (use once)
    if (typeof window !== 'undefined' && codeVerifier) {
        sessionStorage.removeItem('pkce_code_verifier')
    }
    
    if (tokens.id_token) {
        localStorage.setItem('idToken', tokens.id_token)
    }
    if (tokens.access_token) {
        localStorage.setItem('accessToken', tokens.access_token)
    }
    if (tokens.refresh_token) {
        localStorage.setItem('refreshToken', tokens.refresh_token)
    }
    
    try {
        const idTokenPayload = JSON.parse(atob(tokens.id_token.split('.')[1]))
        const username = idTokenPayload['cognito:username'] || idTokenPayload.email || idTokenPayload.sub
        
        const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
        if (userPoolId && clientId) {
            initAuth(userPoolId, clientId)
        }
    } catch (err) {
        // Session setup failed, but tokens are still stored
    }
    
    return tokens.id_token
}

export function getHostedUILogoutUrl(userPoolDomain: string, redirectUri: string): string {
    let domain = userPoolDomain.replace(/^https?:\/\//, '')
    
    if (domain.includes('.amazonaws.com')) {
        domain = domain.replace('.amazonaws.com', '.amazoncognito.com')
    }
    
    if (!domain.includes('.amazoncognito.com') && !domain.includes('.amazonaws.com')) {
        const parts = domain.split('.')
        const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1'
        domain = `${domain}.auth.${region}.amazoncognito.com`
    }
    
    const baseUrl = `https://${domain}`
    // Cognito logout endpoint uses 'logout_uri' parameter (must match sign-out URLs exactly)
    // Note: The parameter name is 'logout_uri', not 'redirect_uri'
    const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
        logout_uri: redirectUri
    })
    return `${baseUrl}/logout?${params.toString()}`
}

