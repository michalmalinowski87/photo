# Silent OAuth Session Establishment Implementation

## Overview

This implementation provides **Option 2: Silent OAuth Session Establishment** - a secure solution that combines:
- ✅ Self-hosted login forms (full UI control)
- ✅ Cognito server-side session (HttpOnly cookies for security)
- ✅ Cross-domain token sharing via postMessage
- ✅ Defense in depth security

## Architecture

### Authentication Flow

1. **User logs in via self-hosted form** (`/auth/sign-in`)
   - Uses Cognito SDK `signIn()` function
   - Stores tokens in localStorage
   - Sets up SDK session in sessionStorage

2. **Silent OAuth session establishment**
   - Creates hidden iframe pointing to Cognito Hosted UI
   - Cognito redirects to `/auth/auth-callback-silent` (hidden page)
   - Callback exchanges code for tokens
   - Creates HttpOnly cookies on Cognito domain
   - Sends success message back to parent window

3. **Token sharing**
   - Tokens shared with dashboard domain via postMessage
   - Dashboard receives tokens and stores in localStorage
   - Both domains now have tokens

4. **Cross-domain access**
   - When user accesses dashboard, tokens are already shared
   - If tokens missing, dashboard requests from landing via postMessage
   - Cognito server-side session allows seamless re-authentication

## Security Features

### 1. Server-Side Session Cookies
- HttpOnly cookies set on Cognito domain
- Not accessible via JavaScript (XSS protection)
- Validated server-side by Cognito

### 2. OAuth 2.0 + PKCE
- Standard OAuth flow with PKCE protection
- Prevents authorization code interception
- Industry best practices

### 3. Defense in Depth
- Client-side tokens (localStorage) for API calls
- Server-side session (HttpOnly cookies) for Cognito recognition
- If client tokens compromised, server session still validates

### 4. Origin Validation
- postMessage listeners validate origin
- Only trusted domains can share tokens
- Prevents token theft from malicious sites

## Files Created/Modified

### Landing Domain (`frontend/landing/`)

1. **`lib/auth.ts`**
   - Added `signIn()` function (SDK authentication)
   - Added `establishCognitoSessionSilently()` function
   - Handles silent OAuth flow via hidden iframe

2. **`lib/token-sharing.ts`**
   - `shareTokensWithOtherDomains()` - Shares tokens via postMessage
   - `setupTokenSharingListener()` - Listens for token sharing messages
   - `requestTokensFromOtherDomains()` - Requests tokens from other domains

3. **`app/auth/sign-in/page.tsx`**
   - Self-hosted login form
   - Calls SDK `signIn()`
   - Establishes silent session after login
   - Shares tokens with dashboard

4. **`app/auth/auth-callback-silent/page.tsx`**
   - Hidden callback page for iframe OAuth flow
   - Exchanges code for tokens
   - Sends success message to parent window

### Dashboard Domain (`frontend/dashboard/`)

1. **`lib/token-sharing.js`**
   - JavaScript version of token sharing utilities
   - Receives tokens from landing domain
   - Requests tokens when needed

2. **`pages/galleries.jsx`** (and other protected pages)
   - Sets up token sharing listener on mount
   - Requests tokens from landing if not found
   - Redirects to landing sign-in if no tokens available

## Cognito Configuration

### Required Callback URLs

Add these callback URLs to your Cognito User Pool:

1. **Landing Callback**: `http://localhost:3003/auth/auth-callback`
2. **Silent Callback**: `http://localhost:3003/auth/auth-callback-silent` ⚠️ **NEW**
3. **Dashboard Callback**: `http://localhost:3001/auth/auth-callback`

### Production URLs

When deploying, add:
- `https://photocloud.com/auth/auth-callback`
- `https://photocloud.com/auth/auth-callback-silent`
- `https://dashboard.photocloud.com/auth/auth-callback`

### Sign-Out URLs

Add logout callback:
- `http://localhost:3003/auth/logout-callback`
- `https://photocloud.com/auth/logout-callback`

## Environment Variables

### Landing Domain
```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=your-pool-id
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3001
NEXT_PUBLIC_LANDING_URL=http://localhost:3003
```

### Dashboard Domain
```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=your-pool-id
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain
NEXT_PUBLIC_LANDING_URL=http://localhost:3003
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3001
```

## How It Works

### Login Flow

1. User visits `/auth/sign-in` on landing
2. Enters credentials in self-hosted form
3. SDK authenticates → tokens stored in localStorage
4. Hidden iframe loads Cognito OAuth URL
5. Cognito redirects to `/auth/auth-callback-silent`
6. Callback exchanges code → creates server-side session
7. Tokens shared with dashboard via postMessage
8. User redirected to dashboard

### Cross-Domain Access

1. User accesses dashboard protected page
2. Dashboard checks for tokens in localStorage
3. If missing, requests from landing via postMessage
4. Landing responds with tokens (if available)
5. Dashboard stores tokens and continues
6. If no tokens anywhere, redirects to landing sign-in

### Session Persistence

- **Client tokens**: Stored in localStorage (domain-specific)
- **Server session**: HttpOnly cookies on Cognito domain
- **Cross-domain**: postMessage shares tokens between domains
- **Re-authentication**: If tokens expire, Cognito session allows silent re-auth

## Security Considerations

### ✅ Implemented

- Origin validation for postMessage
- Token expiration checking before storage
- PKCE for OAuth flow
- HttpOnly cookies for server-side session
- HTTPS only (in production)

### ⚠️ Recommendations

1. **Content Security Policy (CSP)**
   - Add CSP headers to prevent XSS
   - Allow iframe from Cognito domain

2. **Token Refresh**
   - Implement automatic token refresh
   - Use refresh token before expiration

3. **Monitoring**
   - Log failed authentication attempts
   - Monitor token sharing events

4. **Rate Limiting**
   - Limit postMessage token requests
   - Prevent token harvesting attacks

## Testing

### Test Scenarios

1. **Login Flow**
   - Login on landing → verify tokens stored
   - Check iframe loads silently
   - Verify server-side session established

2. **Cross-Domain**
   - Login on landing
   - Access dashboard → verify tokens received
   - Check both domains have tokens

3. **Token Expiration**
   - Wait for token expiration
   - Access dashboard → verify redirect to sign-in
   - Or verify silent re-authentication works

4. **Security**
   - Test origin validation (malicious domain)
   - Verify tokens not shared with untrusted origins
   - Check HttpOnly cookies set correctly

## Troubleshooting

### Iframe Not Loading

- Check Cognito callback URL is configured
- Verify `/auth/auth-callback-silent` route exists
- Check browser console for errors

### Tokens Not Sharing

- Verify `NEXT_PUBLIC_LANDING_URL` and `NEXT_PUBLIC_DASHBOARD_URL` are set
- Check postMessage listener is set up
- Verify origin validation isn't blocking messages

### Server Session Not Established

- Check iframe loads successfully
- Verify callback page exchanges code correctly
- Check Cognito logs for errors

## Future Improvements

1. **Token Refresh API**
   - Centralized token refresh endpoint
   - Automatic refresh before expiration

2. **Session Validation**
   - API endpoint to validate tokens
   - Centralized session management

3. **Multi-Tab Sync**
   - Sync tokens across browser tabs
   - Use BroadcastChannel API

4. **Analytics**
   - Track authentication flows
   - Monitor token sharing events

