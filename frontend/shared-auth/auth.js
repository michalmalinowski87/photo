/**
 * Shared Authentication Library
 * 
 * Provides secure OAuth 2.0 authentication flow with PKCE for cross-domain support.
 * Works with Cognito Hosted UI and supports future centralized auth domain.
 */

import { CognitoUserPool } from 'amazon-cognito-identity-js';

// Generate random string for PKCE
function generateRandomString(length) {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	let random = '';
	const values = new Uint8Array(length);
	crypto.getRandomValues(values);
	for (let i = 0; i < length; i++) {
		random += charset[values[i] % charset.length];
	}
	return random;
}

// Generate code verifier and challenge for PKCE
function generatePKCE() {
	const codeVerifier = generateRandomString(128);
	
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
		.then((buffer) => {
			const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(buffer)))
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=/g, '');
			
			return { codeVerifier, codeChallenge };
		});
}

// Store PKCE verifier in sessionStorage (domain-specific, cleared on close)
function storePKCEVerifier(codeVerifier) {
	if (typeof window !== 'undefined') {
		sessionStorage.setItem('pkce_code_verifier', codeVerifier);
	}
}

function getPKCEVerifier() {
	if (typeof window !== 'undefined') {
		return sessionStorage.getItem('pkce_code_verifier');
	}
	return null;
}

function clearPKCEVerifier() {
	if (typeof window !== 'undefined') {
		sessionStorage.removeItem('pkce_code_verifier');
	}
}

/**
 * Initialize Cognito User Pool
 */
let userPool = null;
export function initAuth(userPoolId, clientId) {
	if (!userPoolId || !clientId) {
		return null;
	}
	if (!userPool) {
		userPool = new CognitoUserPool({
			UserPoolId: userPoolId,
			ClientId: clientId
		});
	}
	return userPool;
}

/**
 * Get current authenticated user
 */
export function getCurrentUser() {
	if (!userPool) return null;
	return userPool.getCurrentUser();
}

/**
 * Get ID token from current session
 */
export function getIdToken() {
	return new Promise((resolve, reject) => {
		const user = getCurrentUser();
		if (!user) {
			// Check localStorage as fallback
			const stored = localStorage.getItem('idToken');
			if (stored) {
				resolve(stored);
				return;
			}
			reject(new Error('No user logged in'));
			return;
		}
		user.getSession((err, session) => {
			if (err || !session || !session.isValid()) {
				// Check localStorage as fallback
				const stored = localStorage.getItem('idToken');
				if (stored) {
					resolve(stored);
					return;
				}
				reject(err || new Error('Invalid session'));
				return;
			}
			resolve(session.getIdToken().getJwtToken());
		});
	});
}

/**
 * Sign out current user
 */
export function signOut() {
	const user = getCurrentUser();
	if (user) {
		user.signOut();
	}
	// Clear all auth data
	if (typeof window !== 'undefined') {
		localStorage.removeItem('idToken');
		localStorage.removeItem('accessToken');
		localStorage.removeItem('refreshToken');
		clearPKCEVerifier();
	}
}

/**
 * Redirect to Cognito Hosted UI for authentication
 * Uses OAuth 2.0 Authorization Code flow with PKCE
 * 
 * @param {string} returnUrl - URL to redirect to after authentication
 * @param {string} callbackPath - Path on current domain for OAuth callback (default: '/auth/callback')
 */
export async function redirectToAuth(returnUrl = null, callbackPath = '/auth/callback') {
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	
	if (!userPoolDomain || !clientId) {
		return;
	}
	
	// Generate PKCE challenge
	const { codeVerifier, codeChallenge } = await generatePKCE();
	storePKCEVerifier(codeVerifier);
	
	// Build callback URL
	const redirectUri = typeof window !== 'undefined' 
		? `${window.location.origin}${callbackPath}`
		: '';
	
	// Build Cognito authorize URL
	let domain = userPoolDomain.replace(/^https?:\/\//, '');
	if (domain.includes('.amazonaws.com')) {
		domain = domain.replace('.amazonaws.com', '.amazoncognito.com');
	}
	if (!domain.includes('.amazoncognito.com')) {
		const parts = domain.split('.');
		const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1';
		domain = `${domain}.auth.${region}.amazoncognito.com`;
	}
	
	const baseUrl = `https://${domain}`;
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		scope: 'openid email profile',
		redirect_uri: redirectUri,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});
	
	// Add state parameter with returnUrl
	if (returnUrl) {
		params.append('state', encodeURIComponent(returnUrl));
	}
	
	const authUrl = `${baseUrl}/oauth2/authorize?${params.toString()}`;
	
	if (typeof window !== 'undefined') {
		window.location.href = authUrl;
	}
}

/**
 * Exchange authorization code for tokens
 * 
 * @param {string} code - Authorization code from Cognito
 * @param {string} redirectUri - Same redirect_uri used in authorization request
 */
export async function exchangeCodeForTokens(code, redirectUri) {
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	const codeVerifier = getPKCEVerifier();
	
	if (!userPoolDomain || !clientId) {
		throw new Error('Cognito configuration missing');
	}
	
	if (!codeVerifier) {
		throw new Error('PKCE verifier not found. Please restart the authentication flow.');
	}
	
	// Build token endpoint URL
	let domain = userPoolDomain.replace(/^https?:\/\//, '');
	if (domain.includes('.amazonaws.com')) {
		domain = domain.replace('.amazonaws.com', '.amazoncognito.com');
	}
	if (!domain.includes('.amazoncognito.com')) {
		const parts = domain.split('.');
		const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1';
		domain = `${domain}.auth.${region}.amazoncognito.com`;
	}
	
	const tokenUrl = `https://${domain}/oauth2/token`;
	
	const params = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: clientId,
		code: code,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier
	});
	
	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: params.toString()
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
	}
	
	const tokens = await response.json();
	
	// Store tokens in localStorage
	if (tokens.id_token) {
		localStorage.setItem('idToken', tokens.id_token);
	}
	if (tokens.access_token) {
		localStorage.setItem('accessToken', tokens.access_token);
	}
	if (tokens.refresh_token) {
		localStorage.setItem('refreshToken', tokens.refresh_token);
	}
	
	// Set up CognitoUser session for SDK compatibility
	const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
	if (userPoolId && clientId && tokens.id_token) {
		try {
			initAuth(userPoolId, clientId);
			const idTokenPayload = JSON.parse(atob(tokens.id_token.split('.')[1]));
			const username = idTokenPayload['cognito:username'] || idTokenPayload.email || idTokenPayload.sub;
			
			// Store in sessionStorage for Cognito SDK
			if (typeof window !== 'undefined') {
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`, username);
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.idToken`, tokens.id_token);
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`, tokens.access_token);
				if (tokens.refresh_token) {
					sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`, tokens.refresh_token);
				}
			}
		} catch (err) {
			// Failed to set up CognitoUser session
		}
	}
	
	// Clear PKCE verifier after successful exchange
	clearPKCEVerifier();
	
	return tokens.id_token;
}

/**
 * Get logout URL for Cognito Hosted UI
 */
export function getLogoutUrl(redirectUri) {
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	
	if (!userPoolDomain || !clientId) {
		return null;
	}
	
	let domain = userPoolDomain.replace(/^https?:\/\//, '');
	if (domain.includes('.amazonaws.com')) {
		domain = domain.replace('.amazonaws.com', '.amazoncognito.com');
	}
	if (!domain.includes('.amazoncognito.com')) {
		const parts = domain.split('.');
		const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1';
		domain = `${domain}.auth.${region}.amazoncognito.com`;
	}
	
	// Ensure redirectUri is properly formatted (remove trailing slash if present, as Cognito is strict about URL matching)
	const cleanRedirectUri = redirectUri.replace(/\/$/, '');
	
	const baseUrl = `https://${domain}`;
	const params = new URLSearchParams({
		client_id: clientId,
		logout_uri: cleanRedirectUri
	});
	
	return `${baseUrl}/logout?${params.toString()}`;
}

