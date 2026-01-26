# Session Storage Usage

This document explains what's stored in session storage and why.

## Overview

Session storage is used to maintain state during a browser session. Unlike localStorage, session storage is automatically cleared when the browser tab is closed.

## Entry Types

### 1. CognitoIdentityServiceProvider.* (Required)

**Purpose**: AWS Cognito authentication tokens and session data.

**Keys**:
- `CognitoIdentityServiceProvider.{clientId}.LastAuthUser` - Current authenticated user
- `CognitoIdentityServiceProvider.{clientId}.{username}.idToken` - ID token
- `CognitoIdentityServiceProvider.{clientId}.{username}.accessToken` - Access token
- `CognitoIdentityServiceProvider.{clientId}.{username}.refreshToken` - Refresh token

**Why needed**: Required by AWS Cognito SDK for authentication and token refresh. The SDK expects these entries to exist in sessionStorage.

**Cleanup**: Automatically cleaned up on sign out via `signOut()` function in `lib/auth.ts`.

**Status**: ✅ **Keep** - Required for authentication

---

### 2. final_image_selection_{galleryId}_{orderId} (Optional but useful)

**Purpose**: Persists image selection state across page navigations within a gallery/order context.

**Format**: `final_image_selection_{galleryId}_{orderId}`

**Value**: JSON object with:
```json
{
  "selectedKeys": ["image1.jpg", "image2.jpg"],
  "isSelectionMode": true
}
```

**Why needed**: 
- Preserves user's image selections if they navigate away and come back
- Maintains selection mode state
- Used in `FinalsTab` component for bulk delete operations

**Cleanup**: 
- Automatically cleaned when selection is cleared and selection mode is exited
- Periodic cleanup removes empty entries (no selections, not in selection mode)

**Status**: ✅ **Keep** - Improves UX by preserving selections

---

### 3. gallery_referrer_{galleryId} (Optional but useful)

**Purpose**: Stores the referrer path when navigating to a gallery, enabling "back" button functionality.

**Format**: `gallery_referrer_{galleryId}`

**Value**: Path string (e.g., `/`, `/galleries`, `/galleries/other-gallery-id`)

**Why needed**: 
- Used by `GallerySidebar` component's back button to return to the previous page
- Enables proper navigation flow when users navigate between galleries

**Usage**: 
- Set when clicking on gallery links (in `GalleryCard`, `GalleryList`, etc.)
- Read when clicking "Powrót" (Back) button in gallery sidebar

**Cleanup**: 
- Periodic cleanup keeps only the most recent 50 entries
- Old entries are removed to prevent accumulation

**Status**: ✅ **Keep** - Enables back navigation

---

## Cleanup Strategy

### Automatic Cleanup

1. **On App Initialization**: Cleanup runs once when the app loads
2. **Periodic Cleanup**: Runs every 5 minutes to remove stale entries
3. **On Selection Exit**: Empty image selections are removed when exiting selection mode

### Manual Cleanup

You can manually trigger cleanup:

```typescript
import { cleanupStaleSessionStorage } from '@/lib/sessionStorageCleanup';

// Clean up all stale entries
cleanupStaleSessionStorage();
```

### Statistics

Check session storage usage:

```typescript
import { getSessionStorageStats } from '@/lib/sessionStorageCleanup';

const stats = getSessionStorageStats();
console.log(stats);
// {
//   totalKeys: 45,
//   galleryReferrers: 12,
//   imageSelections: 8,
//   cognitoEntries: 4,
//   other: 21
// }
```

## Recommendations

1. **Cognito entries**: Never manually remove - required for auth
2. **Image selections**: Safe to remove if empty (no selections, not in selection mode)
3. **Gallery referrers**: Safe to limit to recent entries (last 50 galleries)

## Implementation

Cleanup is implemented in:
- `frontend/dashboard/lib/sessionStorageCleanup.ts` - Cleanup utilities
- `frontend/dashboard/pages/_app.tsx` - Automatic cleanup on app init
- `frontend/dashboard/hooks/useImageSelection.ts` - Cleanup on selection exit
