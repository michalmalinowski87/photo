import { CognitoUserPool, CognitoUser } from 'amazon-cognito-identity-js'

let userPool: CognitoUserPool | null = null

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
        user.getSession((err, session) => {
            if (err || !session || !session.isValid()) {
                reject(err || new Error('Invalid session'))
                return
            }
            resolve(session.getIdToken().getJwtToken())
        })
    })
}

export function signOut() {
    const user = getCurrentUser()
    if (user) {
        user.signOut()
    }
}

export function getHostedUILoginUrl(userPoolDomain: string, clientId: string, redirectUri: string): string {
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
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: redirectUri
    })
    return `${baseUrl}/oauth2/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<string> {
    const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    
    if (!userPoolDomain || !clientId) {
        throw new Error('Cognito configuration missing')
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
        redirect_uri: redirectUri
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
        console.warn('Failed to set up CognitoUser session:', err)
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
    const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
        logout_uri: redirectUri
    })
    return `${baseUrl}/logout?${params.toString()}`
}

