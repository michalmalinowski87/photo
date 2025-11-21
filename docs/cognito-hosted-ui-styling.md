# Styling Cognito Hosted UI

This guide explains how to customize Cognito Hosted UI to match your landing page design.

## Current Session Behavior

### Cross-Domain Login Status

**Short Answer**: Users stay "logged in" at Cognito, but tokens are domain-specific.

**How it works**:
1. **Cognito Session**: When a user logs in at Cognito Hosted UI, Cognito maintains a session cookie
2. **First Domain**: User logs in → redirected to domain A → tokens stored in domain A's localStorage
3. **Second Domain**: User accesses domain B → redirected to Cognito → Cognito sees existing session → **No password prompt** → redirects back with code → domain B exchanges code for tokens → tokens stored in domain B's localStorage

**Result**: 
- ✅ User doesn't need to re-enter credentials when switching domains
- ✅ Each domain has its own tokens in localStorage
- ✅ Seamless experience across domains

## Styling Cognito Hosted UI

Cognito Hosted UI can be customized using:

1. **Branding Editor** (AWS Console) - Easy, limited customization
2. **CSS File Upload** - More control, requires CSS knowledge
3. **Custom Domain** - Full control, requires domain setup

### Method 1: Branding Editor (Recommended for Quick Setup)

1. Go to AWS Cognito Console → Your User Pool
2. Navigate to **App integration** → **Hosted UI** → **Branding**
3. Upload:
   - **Logo**: Your PhotoHub logo (recommended: 200x50px, PNG/SVG)
   - **Background image**: Optional background (recommended: 1920x1080px)
   - **Favicon**: Browser favicon (16x16 or 32x32px, ICO/PNG)

4. Configure colors:
   - **Primary color**: Use your theme primary color (`rgb(101, 255, 200)`)
   - **Background color**: Match your landing page background

### Method 2: CSS Customization (More Control)

1. Create a CSS file matching your landing page styles
2. Upload via AWS Console:
   - Go to **App integration** → **Hosted UI** → **Branding**
   - Upload CSS file

**Example CSS** (based on your landing page):

```css
/* Cognito Hosted UI Custom CSS */

:root {
  --theme-primary: 101, 255, 200;
  --theme-secondary: 0, 135, 255;
  --background: 0, 0, 0;
  --foreground: 255, 255, 255;
  --muted-foreground: 163, 163, 163;
}

/* Main container */
.cognito-container {
  background: rgb(var(--background));
  color: rgb(var(--foreground));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Logo area */
.cognito-logo {
  /* Match your PhotoHub logo styling */
}

/* Form inputs */
.cognito-input {
  background: rgba(var(--foreground), 0.05);
  border: 1px solid rgba(var(--foreground), 0.1);
  color: rgb(var(--foreground));
  border-radius: 8px;
  padding: 12px 16px;
}

.cognito-input:focus {
  border-color: rgb(var(--theme-primary));
  outline: none;
}

/* Buttons */
.cognito-button-primary {
  background: rgb(var(--theme-primary));
  color: rgb(var(--background));
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.cognito-button-primary:hover {
  opacity: 0.9;
}

/* Links */
.cognito-link {
  color: rgb(var(--theme-primary));
}

/* Error messages */
.cognito-error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 12px;
}

/* Text */
.cognito-text {
  color: rgb(var(--muted-foreground));
}

.cognito-heading {
  color: rgb(var(--foreground));
  font-weight: 600;
}
```

### Method 3: Extract Landing Page Styles

To match exactly, extract styles from your landing sign-in page:

1. **Colors**: Use your theme variables (`--theme-primary`, `--theme-secondary`)
2. **Typography**: Match font family and sizes
3. **Spacing**: Match padding and margins
4. **Buttons**: Match button styles (rounded corners, colors, hover effects)
5. **Inputs**: Match input field styles

## CSS File Location

Create the CSS file at: `infra/cognito-hosted-ui-styles.css`

Then upload it via AWS Console or reference it in your CDK stack (if Cognito supports it).

## Cognito CSS Class Names

Cognito Hosted UI uses these class names (may vary by version):

- `.cognito-container` - Main container
- `.cognito-form` - Form wrapper
- `.cognito-input` - Input fields
- `.cognito-button-primary` - Primary button
- `.cognito-button-secondary` - Secondary button
- `.cognito-link` - Links
- `.cognito-error` - Error messages
- `.cognito-text` - Regular text
- `.cognito-heading` - Headings

**Note**: Cognito's CSS class names may change. Inspect the Hosted UI page to find current class names.

## Testing Custom Styles

1. Upload CSS via AWS Console
2. Test the Hosted UI URL directly
3. Check styling matches your landing page
4. Adjust CSS as needed

## Alternative: Keep Custom Pages

If Cognito Hosted UI customization is too limited, you can:

1. **Keep your custom sign-in/sign-up pages** (current approach)
2. Use Cognito SDK directly (as you're doing now)
3. Only redirect to Cognito Hosted UI when needed

However, this means:
- ❌ Users need to enter credentials on each domain
- ❌ No shared Cognito session
- ✅ Full control over UI/UX

## Recommended Approach

**For now**: Use Cognito Hosted UI with CSS customization
- ✅ Single sign-on experience (Cognito session)
- ✅ Consistent branding possible
- ✅ Less code to maintain

**Future**: Consider custom auth domain (`auth.photohub.com`)
- ✅ Full control over authentication UI
- ✅ Can implement custom flows
- ✅ Better user experience

## Session Persistence

### Current Implementation

- **Cognito Session**: Maintained by Cognito (cookies on Cognito domain)
- **App Tokens**: Stored in localStorage (domain-specific)
- **Result**: User stays logged in at Cognito, but each app needs to exchange code for tokens

### To Improve Cross-Domain Experience

If you want true SSO (single sign-on) where tokens are shared:

1. **Use Same Root Domain** (e.g., `app1.photohub.com`, `app2.photohub.com`)
   - Set cookies with `domain=.photohub.com`
   - Tokens accessible across subdomains

2. **Use Centralized Auth Domain** (`auth.photohub.com`)
   - All authentication happens there
   - Tokens stored on auth domain
   - Apps check auth domain for session

3. **Token Refresh API**
   - Create API endpoint that validates tokens
   - Apps can check if user is authenticated without storing tokens

For now, the current implementation provides a good balance:
- Users don't need to re-enter credentials (Cognito session)
- Each domain securely stores its own tokens
- Works across any domains

