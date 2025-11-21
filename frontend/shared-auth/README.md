# Shared Authentication Architecture

This document describes the cross-domain authentication architecture for PhotoHub.

## Architecture Overview

- **Auth Domain**: `auth.photohub.com` (or landing page for now)
- **Website**: `photohub.com` (landing page)
- **Dashboard**: `dashboard.photohub.com`

## Authentication Flow

### OAuth 2.0 Authorization Code Flow with PKCE

1. **User requests protected resource** on any domain (website or dashboard)
2. **Redirect to Cognito Hosted UI** with:
   - `client_id`: Cognito App Client ID
   - `redirect_uri`: Callback URL on the requesting domain
   - `response_type`: `code`
   - `scope`: `openid email profile`
   - `state`: Encoded return URL + domain identifier
   - `code_challenge`: PKCE challenge (for security)
   - `code_challenge_method`: `S256`

3. **User authenticates** at Cognito Hosted UI
4. **Cognito redirects back** to callback URL with authorization code
5. **Domain exchanges code for tokens**:
   - `grant_type`: `authorization_code`
   - `code`: Authorization code
   - `redirect_uri`: Same as in step 2
   - `code_verifier`: PKCE verifier
   - `client_id`: Cognito App Client ID

6. **Tokens stored** in domain's localStorage
7. **User redirected** to original destination

## Security Features

- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception
- **State parameter**: Prevents CSRF attacks
- **HTTPS only**: All communication over HTTPS
- **Short-lived tokens**: Access tokens expire quickly
- **Refresh tokens**: Stored securely for token renewal

## Domain Configuration

Each domain needs:
- `NEXT_PUBLIC_COGNITO_DOMAIN`: Cognito Hosted UI domain
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`: Cognito App Client ID
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `NEXT_PUBLIC_AUTH_DOMAIN`: Central auth domain (for future use)

## Callback URLs

Each domain must register its callback URL in Cognito:
- Landing: `https://photohub.com/auth/callback`
- Dashboard: `https://dashboard.photohub.com/auth/callback`

## Token Storage

- Tokens stored in `localStorage` on each domain
- Refresh tokens used to get new access tokens
- Tokens validated on each API request

