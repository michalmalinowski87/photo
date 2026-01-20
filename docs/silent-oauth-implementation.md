# Auth Status + Owner Preview (current implementation)

## Overview

This repo currently implements:
- **Dashboard as the auth “source of truth”** (Cognito Hosted UI + tokens stored on dashboard domain).
- **Landing auth status check** via hidden iframe + postMessage (landing does not store tokens).
- **Gallery owner preview mode** (`?ownerPreview=1`) that requests the dashboard `idToken` via `window.opener.postMessage`.

This document replaces an older “silent OAuth session establishment” proposal that is **not implemented** in this repo (kept historically in git, but the code paths do not exist).

## Landing → Dashboard auth status check

- Landing calls `checkDashboardAuthStatus()` which:
  - Injects a hidden iframe pointing at a dashboard resource (auth-check frame).
  - Uses postMessage to request a boolean auth status.
- Dashboard responds with `PHOTOCLOUD_AUTH_STATUS_RESPONSE` containing `{ isAuthenticated: boolean }`.

## Dashboard → Gallery owner preview token handoff

### How it works

1. Dashboard opens the gallery URL with `?ownerPreview=1` (new window/tab).
2. Gallery detects `ownerPreview=1` and requests the dashboard token:
   - `window.opener.postMessage({ type: "PHOTOCLOUD_TOKEN_REQUEST" }, dashboardOrigin)`
3. Dashboard responds (if token is valid + unexpired):
   - `{ type: "PHOTOCLOUD_TOKEN_RESPONSE", idToken, accessToken?, refreshToken? }`
4. Gallery stores the `idToken` as an owner-scoped token for that gallery and uses it for owner-authenticated API calls.

### Why we don’t fetch SSM from frontend

Frontends never read SSM directly. Public URLs come from SSM at deploy/build-time, exposed as `NEXT_PUBLIC_*` env vars.

## Environment variables

### Landing (`frontend/landing/.env.local`)
```env
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
```

### Dashboard (`frontend/dashboard/.env.local`)
```env
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
NEXT_PUBLIC_GALLERY_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=https://your-api-gateway-url

NEXT_PUBLIC_COGNITO_USER_POOL_ID=your-pool-id
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain
```

### Gallery (`frontend/gallery/.env.local`)
```env
NEXT_PUBLIC_API_URL=https://your-api-gateway-url
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3002
```

## Security notes

- **Origin validation** is enforced by both sides before accepting messages.
- Owner preview requires `window.opener`; if the gallery is opened without an opener, it cannot request the token.
