# Authentication Architecture

## Overview

PhotoCloud uses **OAuth 2.0 Authorization Code flow with PKCE** for secure, cross-domain authentication. This architecture supports:

- ✅ Single sign-on across multiple domains
- ✅ Secure token exchange with PKCE protection
- ✅ Future-ready for centralized auth domain (`auth.photocloud.com`)
- ✅ Works with current localhost setup and future production domains

## Architecture

### Current Setup (Development)
- **Dashboard**: `localhost:3000`
- **Gallery**: `localhost:3001`
- **Landing**: `localhost:3002`
- **Auth**: Cognito Hosted UI (AWS managed)

### Future Production Setup
- **Auth Domain**: `auth.photocloud.com` (centralized authentication)
- **Website**: `photocloud.com` (landing page)
- **Dashboard**: `dashboard.photocloud.com` (dashboard app)
- **Gallery**: `gallery.photocloud.com` (public gallery app)

## Authentication Flow

### 1. User Requests Protected Resource

User accesses a protected page on any domain (landing or dashboard).

### 2. Redirect to Cognito Hosted UI

The app redirects to Cognito Hosted UI with:
- `client_id`: Cognito App Client ID
- `response_type`: `code`
- `scope`: `openid email profile`
- `redirect_uri`: Callback URL on the requesting domain
- `code_challenge`: PKCE challenge (SHA-256 hash)
- `code_challenge_method`: `S256`
- `state`: Encoded return URL

**PKCE Verifier** is stored in `sessionStorage` (domain-specific, cleared on browser close).

### 3. User Authenticates

User signs in or signs up at Cognito Hosted UI.

### 4. Cognito Redirects Back

Cognito redirects to the callback URL with:
- `code`: Authorization code
- `state`: Original return URL

### 5. Exchange Code for Tokens

The callback page exchanges the authorization code for tokens:
- `grant_type`: `authorization_code`
- `code`: Authorization code from step 4
- `redirect_uri`: Same as in step 2
- `code_verifier`: PKCE verifier from sessionStorage
- `client_id`: Cognito App Client ID

### 6. Tokens Stored

Tokens are stored in the domain's `localStorage`:
- `idToken`: JWT ID token
- `accessToken`: Access token
- `refreshToken`: Refresh token (for token renewal)

### 7. Redirect to Original Destination

User is redirected to the original `returnUrl` from the `state` parameter.

## Gallery Owner Preview (Dashboard → Gallery)

The gallery app supports an **owner preview mode** that reuses the photographer’s Cognito session from the dashboard without forcing the client login flow.

### How it works

1. **Dashboard opens gallery** in a new tab/window with `?ownerPreview=1`.
2. **Gallery detects owner preview** and requests the dashboard’s `idToken` using `window.opener.postMessage`.
3. **Dashboard responds** to `PHOTOCLOUD_TOKEN_REQUEST` with `PHOTOCLOUD_TOKEN_RESPONSE` containing `idToken` (and optionally `accessToken`/`refreshToken`) if valid and unexpired.
4. **Gallery stores the token** in session storage (scoped to the gallery) and uses it for owner-authenticated API calls during preview.

### Requirements
- `NEXT_PUBLIC_DASHBOARD_URL` must be set in the gallery app (used to validate message origin).
- The preview window must be opened from the dashboard (requires `window.opener`).

## Security Features

### PKCE (Proof Key for Code Exchange)
- **Prevents authorization code interception**
- Code verifier stored in sessionStorage (not sent in URL)
- Code challenge sent in authorization request
- Verifier required for token exchange

### State Parameter
- **Prevents CSRF attacks**
- Contains return URL
- Validated on callback

### HTTPS Only
- All communication over HTTPS
- Tokens never exposed in URLs (except hash during token callback, which is removed immediately)

### Token Storage
- Tokens stored in localStorage (domain-specific)
- Refresh tokens used for token renewal
- Tokens validated on each API request

## Implementation

### Landing Page (`frontend/landing`)

**Sign-In Page** (`/auth/sign-in`):
- Redirects to Cognito Hosted UI with PKCE
- Handles `returnUrl` parameter for cross-domain redirects

**Sign-Up Page** (`/auth/sign-up`):
- Redirects to Cognito Hosted UI (supports sign-up)
- Same PKCE flow as sign-in

**Auth Callback** (`/auth/auth-callback`):
- Exchanges authorization code for tokens
- Stores tokens in localStorage
- Redirects to original destination (dashboard or landing)

### Dashboard (`frontend/dashboard`)

**Auth Callback** (`/auth/auth-callback`):
- Exchanges authorization code for tokens
- Stores tokens in localStorage
- Redirects to original destination

**Protected Pages**:
- Check for tokens in localStorage
- If missing, redirect to landing sign-in with `returnUrl`

## Environment Variables

### Landing Page (`.env.local`)
```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=photocloud-dev.auth.eu-west-1.amazoncognito.com
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
```

### Dashboard (`.env.local`)
```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=photocloud-dev.auth.eu-west-1.amazoncognito.com
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
NEXT_PUBLIC_API_URL=https://your-api-gateway-url
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
NEXT_PUBLIC_GALLERY_URL=http://localhost:3001
```

### Gallery (`.env.local`)
```bash
NEXT_PUBLIC_API_URL=https://your-api-gateway-url
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
```

## Cognito Configuration

### Required Settings

1. **OAuth 2.0 Flow**: `authorization_code`
2. **OAuth Scopes**: `openid`, `email`, `profile`
3. **Allowed Callback URLs**:
   - `http://localhost:3001/auth/auth-callback` (landing - dev)
   - `http://localhost:3000/auth/auth-callback` (dashboard - dev)
   - `https://photocloud.com/auth/auth-callback` (landing - prod)
   - `https://dashboard.photocloud.com/auth/auth-callback` (dashboard - prod)

4. **Allowed Sign-Out URLs**:
   - `http://localhost:3001` (landing - dev)
   - `http://localhost:3000` (dashboard - dev)
   - `https://photocloud.com` (landing - prod)
   - `https://dashboard.photocloud.com` (dashboard - prod)

### PKCE Support

PKCE is automatically handled by the code. The Cognito App Client should be configured to:
- Use `authorization_code` flow
- Support PKCE (enabled by default for public clients)

## Migration Path

### Current → Future (Centralized Auth)

When moving to `auth.photocloud.com`:

1. **Deploy auth domain** with Cognito Hosted UI customization
2. **Update callback URLs** in Cognito to point to auth domain
3. **Update apps** to redirect to `auth.photocloud.com` instead of Cognito directly
4. **Auth domain** handles all authentication and redirects back to requesting domain

The code is already structured to support this - just change the redirect target.

## Benefits

1. **Security**: PKCE prevents code interception attacks
2. **Scalability**: Works across any number of domains
3. **User Experience**: Single sign-on across all domains
4. **Maintainability**: Centralized authentication logic
5. **Future-Ready**: Easy migration to centralized auth domain

