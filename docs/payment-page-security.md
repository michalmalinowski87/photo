# Payment Page Security Measures

This document outlines the security measures implemented for the payment success and cancel pages.

## Overview

The payment pages (`/payments/success` and `/payments/cancel`) are HTML templates served by Lambda functions. These pages use inline JavaScript to poll the payment status endpoint. This document explains the security measures implemented to protect against common web vulnerabilities.

## Security Measures

### 1. Content Security Policy (CSP)

**Implementation:**
- CSP headers are set via meta tags in the HTML template
- Nonce-based script execution for inline JavaScript
- Restricted resource loading (fonts, images, connections)

**CSP Directives:**
```
default-src 'self'
script-src 'self' 'nonce-{random-nonce}'
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' data: https://fonts.gstatic.com
img-src 'self' data:
connect-src 'self' {api-origin}
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

**Benefits:**
- Prevents XSS attacks by restricting script execution to nonce-validated scripts
- Prevents clickjacking with `frame-ancestors 'none'`
- Restricts resource loading to trusted sources

### 2. Input Validation

#### Session ID Validation

**Client-Side (JavaScript):**
- Validates Stripe session ID format: `/^cs_(test|live)_[a-zA-Z0-9]+$/`
- Length validation: 20-200 characters
- Type checking before use

**Server-Side (Lambda):**
- Same validation in `checkStatus.ts` endpoint
- Rejects invalid session IDs with 400 error
- Logs validation failures (truncated for security)

**Example:**
```typescript
function validateSessionId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const stripeSessionPattern = /^cs_(test|live)_[a-zA-Z0-9]+$/;
  if (!stripeSessionPattern.test(id)) return false;
  if (id.length < 20 || id.length > 200) return false;
  return true;
}
```

#### URL Validation

**Client-Side:**
- Validates redirect URLs before use
- Only allows `http:` and `https:` protocols
- Blocks `javascript:`, `data:`, and other dangerous protocols
- Uses `new URL()` constructor for parsing

**Server-Side:**
- All redirect URLs are validated before being embedded in HTML
- URLs are JSON-encoded to prevent injection

### 3. HTML Escaping

**Implementation:**
- All user-provided content is escaped using `escapeHtml()` function
- Prevents XSS via HTML injection
- Uses proper character encoding

**Escaped Content:**
- Page title
- Status messages
- User-facing text

**Example:**
```typescript
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 4. Response Headers

**Security Headers Set:**
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - Enables browser XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` - Prevents caching of sensitive pages

**Applied To:**
- `/payments/success` endpoint
- `/payments/cancel` endpoint
- `/payments/check-status` endpoint

### 5. JavaScript Security

#### Safe DOM Manipulation

**Implementation:**
- Uses `textContent` instead of `innerHTML` for all user-facing updates
- `textContent` automatically escapes HTML, preventing XSS

**Example:**
```javascript
function updateStatusText(text) {
  const statusText = document.getElementById('status-text');
  if (statusText && typeof text === 'string') {
    statusText.textContent = text; // Automatically escapes HTML
  }
}
```

#### URL Encoding

**Implementation:**
- All URLs are encoded using `encodeURIComponent()` before use
- Prevents URL injection attacks
- Validates constructed URLs before making requests

**Example:**
```javascript
const statusUrl = apiUrl + '/payments/check-status?session_id=' + encodeURIComponent(sessionId);
if (!validateUrl(statusUrl)) {
  throw new Error('Invalid API URL');
}
```

#### Fetch Security

**Implementation:**
- Uses `credentials: 'omit'` to prevent sending cookies
- Validates response content-type before parsing JSON
- Validates response structure before use

**Example:**
```javascript
const response = await fetch(statusUrl, {
  method: 'GET',
  credentials: 'omit', // Don't send cookies
  headers: {
    'Accept': 'application/json'
  }
});

const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
  throw new Error('Invalid response type');
}
```

### 6. Rate Limiting Considerations

**Current Implementation:**
- Client-side polling limit: 60 polls (2 minutes max)
- Poll interval: 2 seconds
- Exponential backoff on timeout

**Recommendations:**
- Implement server-side rate limiting on `/payments/check-status` endpoint
- Use API Gateway throttling or Lambda concurrency limits
- Consider IP-based rate limiting for abuse prevention

### 7. Error Handling

**Security-Focused Error Handling:**
- Generic error messages (don't expose internal details)
- Errors logged server-side only
- Client-side errors don't expose sensitive information

**Example:**
```javascript
catch (error) {
  // Don't expose error details to console in production
  if (typeof console !== 'undefined' && console.error) {
    console.error('Payment status check failed'); // Generic message
  }
}
```

## Security Best Practices Applied

1. **Defense in Depth**: Multiple layers of validation (client + server)
2. **Input Validation**: All inputs validated before use
3. **Output Encoding**: All outputs properly escaped
4. **Least Privilege**: Minimal permissions and resource access
5. **Secure Defaults**: Fail-secure on validation errors
6. **No Trust**: Never trust client-side validation alone

## Testing Recommendations

1. **XSS Testing:**
   - Try injecting `<script>alert('XSS')</script>` in session_id
   - Verify CSP blocks execution
   - Verify HTML escaping works

2. **URL Injection Testing:**
   - Try `javascript:alert('XSS')` in redirect URLs
   - Verify URL validation blocks it

3. **Session ID Validation:**
   - Try invalid session ID formats
   - Verify server rejects them

4. **CSP Testing:**
   - Use browser CSP violation reports
   - Verify nonce-based script execution works

## Future Enhancements

1. **Rate Limiting**: Implement server-side rate limiting
2. **HSTS**: Add `Strict-Transport-Security` header for HTTPS enforcement
3. **Subresource Integrity**: Add SRI for external resources (if any)
4. **CSP Reporting**: Implement CSP violation reporting endpoint
5. **Session Token**: Consider using short-lived tokens instead of session IDs in URLs

## References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Stripe Session ID Format](https://stripe.com/docs/api/checkout/sessions)

