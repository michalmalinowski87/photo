# Cognito Hosted UI Styling Guide

## How to Upload Custom CSS

### Important: Cognito CSS Limitations

Cognito Hosted UI only allows customization of specific CSS classes that end with `-customizable`. You **cannot** use:
- Global selectors like `body`, `html`, `h1`, `p`, etc.
- Custom class names
- CSS variables (`:root`, `var()`)
- Pseudo-classes like `:hover`, `:focus`, `:active`, etc.
- Most CSS selectors
- Only the base class names are allowed (no modifiers)

**Allowed classes only**:
- `.background-customizable` - Page background
- `.logo-customizable` - Logo styling
- `.banner-customizable` - Banner area
- `.label-customizable` - Form labels
- `.textDescription-customizable` - Description text
- `.idpDescription-customizable` - Identity provider descriptions
- `.legalText-customizable` - Legal/terms text
- `.submitButton-customizable` - Submit button
- `.errorMessage-customizable` - Error messages
- `.inputField-customizable` - Input fields
- `.idpButton-customizable` - Identity provider buttons
- `.socialButton-customizable` - Social login buttons
- `.redirect-customizable` - Links/redirects
- `.passwordCheck-notValid-customizable` - Invalid password indicators
- `.passwordCheck-valid-customizable` - Valid password indicators

### Step 1: Prepare CSS File

The CSS file is located at: `infra/cognito-hosted-ui-styles.css`

This file contains styles matching your landing page design, using **only** the allowed Cognito classes.

### Step 2: Upload via AWS Console

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Select your User Pool
3. Navigate to **App integration** tab
4. Scroll to **Hosted UI** section
5. Click **Edit** next to **Branding**
6. Upload the CSS file:
   - Click **Upload CSS**
   - Select `infra/cognito-hosted-ui-styles.css`
7. Upload logo (optional but recommended):
   - Click **Upload logo**
   - Select your PhotoHub logo (PNG/SVG, recommended: 200x50px)
8. Set colors:
   - **Primary color**: `#6C279D` (your theme-primary - RGB: 108, 39, 157)
   - **Background color**: `#000000` (your background)
9. Click **Save changes**

### Step 3: Test

1. Visit your Cognito Hosted UI URL:
   ```
   https://photohub-dev.auth.eu-west-1.amazoncognito.com/login?client_id=YOUR_CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=YOUR_REDIRECT_URI
   ```
2. Verify styling matches your landing page
3. Test sign-in and sign-up flows

## Cross-Domain Session Behavior

### How It Works

**Current Implementation**:
- ✅ **Cognito Session**: Maintained by Cognito (cookie on Cognito domain)
- ✅ **App Tokens**: Stored in each app's localStorage (domain-specific)
- ✅ **Result**: User doesn't need to re-enter credentials when switching domains

**Flow**:
1. User logs in on **landing** (`localhost:3003`)
   - Redirected to Cognito → Authenticates → Redirected back
   - Tokens stored in `localhost:3003` localStorage

2. User accesses **dashboard** (`localhost:3001`)
   - No tokens found → Redirected to Cognito
   - Cognito sees existing session → **No password prompt** ✅
   - Redirected back with code → Tokens stored in `localhost:3001` localStorage

3. User switches back to **landing**
   - No tokens found → Redirected to Cognito
   - Cognito sees existing session → **No password prompt** ✅
   - Redirected back with code → Tokens stored in `localhost:3003` localStorage

### Session Duration

- **Cognito Session**: Typically 1 hour (configurable)
- **App Tokens**: 
  - ID Token: 1 hour (default)
  - Access Token: 1 hour (default)
  - Refresh Token: 30 days (default)

### Token Refresh

When tokens expire:
1. App detects expired token
2. Uses refresh token to get new tokens
3. If refresh token expired, redirects to Cognito
4. Cognito session may still be valid → No password prompt

## Improving Cross-Domain Experience

### Option 1: Shared Domain Cookies (Future)

When using same root domain (`photohub.com`, `dashboard.photohub.com`):
- Set cookies with `domain=.photohub.com`
- Tokens accessible across subdomains
- True SSO experience

### Option 2: Centralized Auth Domain (Future)

Use `auth.photohub.com`:
- All authentication happens there
- Tokens stored on auth domain
- Apps check auth domain for session
- Best user experience

### Option 3: Token Validation API

Create API endpoint:
- Apps check if user is authenticated
- No need to store tokens locally
- Centralized session management

## Current Status

✅ **Working**: Users stay logged in at Cognito (no re-entering credentials)
✅ **Working**: Each domain securely stores its own tokens
✅ **Working**: Seamless experience when switching domains
⚠️ **Note**: Tokens are domain-specific (by design for security)

This is the standard OAuth 2.0 behavior and provides good security while maintaining user convenience.

