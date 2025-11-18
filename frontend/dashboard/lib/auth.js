import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

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
				resolve(result.getIdToken().getJwtToken());
			},
			onFailure: (err) => {
				reject(err);
			}
		});
	});
}

export function signOut() {
	const user = getCurrentUser();
	if (user) {
		user.signOut();
	}
}

export function getHostedUILoginUrl(userPoolDomain, clientId, redirectUri) {
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
	return `${baseUrl}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code, redirectUri) {
	// Exchange authorization code for tokens
	const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
	const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
	
	if (!userPoolDomain || !clientId) {
		throw new Error('Cognito configuration missing');
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
		redirect_uri: redirectUri
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
		console.warn('Failed to set up CognitoUser session:', err);
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

