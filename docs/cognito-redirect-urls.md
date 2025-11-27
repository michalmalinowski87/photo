# Cognito Redirect URLs Configuration

## Required Callback URLs

You need to configure callback URLs for both your landing page and dashboard applications.

### Development (Localhost)

**Allowed callback URLs:**
```
http://localhost:3003/auth/auth-callback
http://localhost:3001/auth/auth-callback
```

**Explanation:**
- `http://localhost:3003/auth/auth-callback` - Landing page callback (where Cognito redirects after login on landing)
- `http://localhost:3000/auth/auth-callback` - Dashboard callback (where Cognito redirects after login on dashboard)

### Production

**Allowed callback URLs:**
```
https://photocloud.com/auth/auth-callback
https://dashboard.photocloud.com/auth/auth-callback
```

**Or if using custom auth domain:**
```
https://auth.photocloud.com/auth/auth-callback
```

## Required Sign-Out URLs

**Allowed sign-out URLs (Development):**
```
http://localhost:3003
http://localhost:3003/auth/logout-callback
http://localhost:3000
```

**Allowed sign-out URLs (Production):**
```
https://photocloud.com
https://photocloud.com/auth/logout-callback
https://dashboard.photocloud.com
```

## How to Configure in AWS Console

1. Go to **AWS Cognito Console** → Your User Pool
2. Navigate to **App integration** tab
3. Find your **App client** and click **Edit**
4. Scroll to **Hosted UI** section
5. Under **Allowed callback URLs**, add:
   ```
   http://localhost:3003/auth/auth-callback,http://localhost:3001/auth/auth-callback
   ```
6. Under **Allowed sign-out URLs**, add:
   ```
   http://localhost:3003,http://localhost:3003/auth/logout-callback,http://localhost:3000
   ```
7. Click **Save changes**

## Important Notes

- **Exact Match Required**: Callback URLs must match **exactly** what's sent in the OAuth request (including protocol `http://` vs `https://`, port numbers, and path)
- **No Trailing Slashes**: Don't add trailing slashes (`/`) unless your code includes them
- **Multiple URLs**: Separate multiple URLs with commas (no spaces)
- **Development vs Production**: You'll need different URLs for dev and prod environments

## Current Configuration Check

Based on your current setup:
- ✅ Dashboard callback: `http://localhost:3001/auth/auth-callback` (configured)
- ❌ Landing callback: `http://localhost:3003/auth/auth-callback` (missing - **needs to be added**)
- ❌ Sign-out URLs: Need both domains (currently only dashboard is configured)

## Quick Fix

Update your Cognito configuration to:

**Allowed callback URLs:**
```
http://localhost:3003/auth/auth-callback,http://localhost:3001/auth/auth-callback
```

**Allowed sign-out URLs:**
```
http://localhost:3003,http://localhost:3001
```

This will allow authentication to work from both your landing page and dashboard.

