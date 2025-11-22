import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

let userPool = null;

export function initAuth(userPoolId, clientId) {
	if (!userPoolId || !clientId) {
		console.warn('Cognito config missing');
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

export function getCurrentUser() {
	if (!userPool) return null;
	return userPool.getCurrentUser();
}

export function getIdToken() {
	return new Promise((resolve, reject) => {
		const user = getCurrentUser();
		if (!user) {
			reject(new Error('No user logged in'));
			return;
		}
		user.getSession((err, session) => {
			if (err || !session || !session.isValid()) {
				reject(err || new Error('Invalid session'));
				return;
			}
			resolve(session.getIdToken().getJwtToken());
		});
	});
}

export function signIn(email, password) {
	return new Promise((resolve, reject) => {
		if (!userPool) {
			reject(new Error('Auth not initialized'));
			return;
		}
		const authenticationDetails = new AuthenticationDetails({
			Username: email,
			Password: password
		});
		const cognitoUser = new CognitoUser({
			Username: email,
			Pool: userPool
		});
		cognitoUser.authenticateUser(authenticationDetails, {
			onSuccess: (result) => {
				const idToken = result.getIdToken().getJwtToken();
				const accessToken = result.getAccessToken().getJwtToken();
				const refreshToken = result.getRefreshToken().getToken();
				
				// Store tokens in localStorage
				localStorage.setItem('idToken', idToken);
				localStorage.setItem('accessToken', accessToken);
				if (refreshToken) {
					localStorage.setItem('refreshToken', refreshToken);
				}
				
				// Set up Cognito SDK session in sessionStorage for SDK compatibility
				try {
					const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
					if (clientId && typeof window !== 'undefined') {
						const idTokenPayload = JSON.parse(atob(idToken.split('.')[1]));
						const username = idTokenPayload['cognito:username'] || idTokenPayload.email || idTokenPayload.sub;
						
						sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`, username);
						sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.idToken`, idToken);
						sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`, accessToken);
						if (refreshToken) {
							sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`, refreshToken);
						}
					}
				} catch (e) {
					// Session setup failed, but tokens are still stored
				}
				
				resolve(idToken);
			},
			onFailure: (err) => {
				reject(err);
			}
		});
	});
}

export function signUp(email, password) {
	return new Promise((resolve, reject) => {
		if (!userPool) {
			reject(new Error('Auth not initialized'));
			return;
		}

		const attributeList = [
			new CognitoUserAttribute({
				Name: 'email',
				Value: email
			})
		];

		userPool.signUp(email, password, attributeList, [], (err, result) => {
			if (err) {
				reject(err);
				return;
			}
			if (!result || !result.user) {
				reject(new Error('Sign up failed'));
				return;
			}
			resolve(result.user);
		});
	});
}

export function confirmSignUp(email, code) {
	return new Promise((resolve, reject) => {
		if (!userPool) {
			reject(new Error('Auth not initialized'));
			return;
		}

		const cognitoUser = new CognitoUser({
			Username: email,
			Pool: userPool
		});

		cognitoUser.confirmRegistration(code, true, (err, result) => {
			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
}

export function resendConfirmationCode(email) {
	return new Promise((resolve, reject) => {
		if (!userPool) {
			reject(new Error('Auth not initialized'));
			return;
		}

		const cognitoUser = new CognitoUser({
			Username: email,
			Pool: userPool
		});

		cognitoUser.resendConfirmationCode((err, result) => {
			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
}

export function signOut() {
	// Clear Cognito SDK session
	const user = getCurrentUser();
	if (user) {
		user.signOut();
	}
	
	// Clear all tokens from localStorage
	if (typeof window !== 'undefined') {
		localStorage.removeItem('idToken');
		localStorage.removeItem('accessToken');
		localStorage.removeItem('refreshToken');
		
		// Clear Cognito sessionStorage items
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		if (clientId) {
			// Clear all CognitoIdentityServiceProvider keys
			const keysToRemove = [];
			for (let i = 0; i < sessionStorage.length; i++) {
				const key = sessionStorage.key(i);
				if (key && key.startsWith(`CognitoIdentityServiceProvider.${clientId}`)) {
					keysToRemove.push(key);
				}
			}
			keysToRemove.forEach(key => sessionStorage.removeItem(key));
		}
		
		// Clear PKCE verifier if present
		sessionStorage.removeItem('pkce_code_verifier');
	}
}

export function getHostedUILoginUrl(userPoolDomain, clientId, redirectUri, returnUrl = null, codeChallenge = null) {
	// userPoolDomain might be:
	// - Full domain: "photohub-dev.auth.eu-west-1.amazonaws.com" or "photohub-dev.auth.eu-west-1.amazoncognito.com"
	// - With https://: "https://photohub-dev.auth.eu-west-1.amazonaws.com"
	// - Just prefix: "photohub-dev"
	
	// Remove https:// if present
	let domain = userPoolDomain.replace(/^https?:\/\//, '');
	
	// Convert amazonaws.com to amazoncognito.com for OAuth endpoints
	if (domain.includes('.amazonaws.com')) {
		domain = domain.replace('.amazonaws.com', '.amazoncognito.com');
	}
	
	// If domain doesn't include .amazoncognito.com, construct it
	if (!domain.includes('.amazoncognito.com') && !domain.includes('.amazonaws.com')) {
		// Extract region if possible, otherwise default to eu-west-1
		const parts = domain.split('.');
		const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1';
		domain = `${domain}.auth.${region}.amazoncognito.com`;
	}
	
	const baseUrl = `https://${domain}`;
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		scope: 'openid email profile',
		redirect_uri: redirectUri
	});
	
	// Add PKCE challenge if provided
	if (codeChallenge) {
		params.append('code_challenge', codeChallenge);
		params.append('code_challenge_method', 'S256');
	}
	
	// Add state parameter with returnUrl if provided
	if (returnUrl) {
		params.append('state', encodeURIComponent(returnUrl));
	}
	
	return `${baseUrl}/oauth2/authorize?${params.toString()}`;
}

// Track if we're already redirecting to prevent multiple calls (React Strict Mode)
let isRedirectingToCognito = false;

export async function redirectToCognito(returnUrl = null) {
	// Prevent multiple redirects (React Strict Mode calls effects twice)
	if (isRedirectingToCognito) {
		return;
	}
	
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	
	if (!userPoolDomain || !clientId) {
		console.error('Cognito configuration missing');
		return;
	}
	
	// Mark as redirecting
	isRedirectingToCognito = true;
	
	// Use /auth/auth-callback as the redirect URI
	const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/auth-callback' : '';
	
	// If no returnUrl provided, use current path
	if (!returnUrl && typeof window !== 'undefined') {
		returnUrl = window.location.pathname + window.location.search;
	}
	
	// Generate PKCE challenge
	const codeVerifier = generateRandomString(128);
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	
	// Store verifier in sessionStorage (domain-specific, cleared on close)
	if (typeof window !== 'undefined') {
		sessionStorage.setItem('pkce_code_verifier', codeVerifier);
	}
	
	const loginUrl = getHostedUILoginUrl(userPoolDomain, clientId, redirectUri, returnUrl, codeChallenge);
	window.location.href = loginUrl;
}

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

// Generate code challenge from verifier
async function generateCodeChallenge(codeVerifier) {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

export function redirectToCognitoSignUp(returnUrl = null) {
	// Same as redirectToCognito - Cognito Hosted UI shows sign-up option on the authorize page
	// Users can click "Sign up" on the Cognito page
	redirectToCognito(returnUrl);
}

export async function redirectToLandingSignIn(returnUrl = null) {
	// Redirect directly to Cognito Hosted UI (not via landing sign-in page)
	// This ensures users go straight to Cognito login without intermediate pages
	await redirectToCognito(returnUrl);
}

export async function exchangeCodeForTokens(code, redirectUri) {
	// Exchange authorization code for tokens
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	
	if (!userPoolDomain || !clientId) {
		throw new Error('Cognito configuration missing');
	}
	
	// Get PKCE verifier from sessionStorage (don't remove it yet - only remove after successful exchange)
	let codeVerifier = null;
	if (typeof window !== 'undefined') {
		codeVerifier = sessionStorage.getItem('pkce_code_verifier');
		// Don't remove here - remove only after successful token exchange
	}
	
	if (!codeVerifier) {
		throw new Error('PKCE verifier not found. Please restart the authentication flow.');
	}
	
	// Remove https:// if present and convert to amazoncognito.com
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
	
	// Remove PKCE verifier AFTER successful token exchange (use once)
	if (typeof window !== 'undefined' && codeVerifier) {
		sessionStorage.removeItem('pkce_code_verifier');
	}
	
	// Reset redirect flag after successful token exchange
	isRedirectingToCognito = false;
	
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
	
	// Also set up CognitoUser session so getIdToken() works
	// Parse the ID token to get username
	try {
		const idTokenPayload = JSON.parse(atob(tokens.id_token.split('.')[1]));
		const username = idTokenPayload['cognito:username'] || idTokenPayload.email || idTokenPayload.sub;
		
		// Initialize user pool if not already done
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
			
			// Create CognitoUser and set session
			const cognitoUser = new CognitoUser({
				Username: username,
				Pool: userPool
			});
			
			// Store user in sessionStorage for Cognito SDK
			if (typeof window !== 'undefined') {
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`, username);
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.idToken`, tokens.id_token);
				sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`, tokens.access_token);
				if (tokens.refresh_token) {
					sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`, tokens.refresh_token);
				}
			}
		}
	} catch (err) {
		// Tokens are still stored in localStorage, so manual token usage will work
	}
	
	return tokens.id_token;
}

export function getHostedUILogoutUrl(userPoolDomain, redirectUri) {
	// userPoolDomain might be:
	// - Full domain: "photohub-dev.auth.eu-west-1.amazonaws.com" or "photohub-dev.auth.eu-west-1.amazoncognito.com"
	// - With https://: "https://photohub-dev.auth.eu-west-1.amazonaws.com"
	// - Just prefix: "photohub-dev"
	
	// Remove https:// if present
	let domain = userPoolDomain.replace(/^https?:\/\//, '');
	
	// Convert amazonaws.com to amazoncognito.com for OAuth endpoints
	if (domain.includes('.amazonaws.com')) {
		domain = domain.replace('.amazonaws.com', '.amazoncognito.com');
	}
	
	// If domain doesn't include .amazoncognito.com, construct it
	if (!domain.includes('.amazoncognito.com') && !domain.includes('.amazonaws.com')) {
		// Extract region if possible, otherwise default to eu-west-1
		const parts = domain.split('.');
		const region = parts.length > 2 ? parts[parts.length - 2] : 'eu-west-1';
		domain = `${domain}.auth.${region}.amazoncognito.com`;
	}
	
	const baseUrl = `https://${domain}`;
	const params = new URLSearchParams({
		client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
		logout_uri: redirectUri
	});
	return `${baseUrl}/logout?${params.toString()}`;
}

