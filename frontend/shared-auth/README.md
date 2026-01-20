# Shared Authentication Architecture

This document describes the cross-domain authentication architecture for PhotoCloud.

## Architecture Overview

- **Auth Domain**: `auth.photocloud.com` (or landing page for now)
- **Website**: `photocloud.com` (landing page)
- **Dashboard**: `dashboard.photocloud.com`
- **Gallery**: `gallery.photocloud.com`

### Current behavior in this repo

- **Dashboard** is the source of truth for photographer authentication (Cognito Hosted UI + tokens stored on dashboard domain).
- **Landing** does not store Cognito tokens; it checks auth status on the dashboard domain via hidden iframe + postMessage.
- **Gallery** supports owner preview (`?ownerPreview=1`) and can request the dashboard `idToken` from `window.opener` via postMessage.

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
  - Note: There is no separate `NEXT_PUBLIC_AUTH_DOMAIN` env var used in this repo today.

## Callback URLs

Each domain must register its callback URL in Cognito:
- Landing: `https://photocloud.com/auth/callback`
- Dashboard: `https://dashboard.photocloud.com/auth/callback`

## Token Storage

- **Dashboard**: tokens stored in `localStorage` (`idToken`, `accessToken`, `refreshToken`)
- **Landing**: no token storage (only auth status checks)
- **Gallery owner preview**: owner token stored in session storage scoped to the gallery
- Tokens are validated on each API request; expired tokens are ignored

