# Image Upload Flow Documentation

This document describes the complete image upload flow, step-by-step, for all scenarios.

## Overview

The upload system uses a **simple, debounced approach** with no polling:
- Upload to S3 → Success → Debounced fetch → Images appear
- Each `RetryableImage` component handles its own loading/retry logic
- No cache is used after uploads to avoid stale state
- Images fallback to S3 URLs if previews/thumbs aren't ready yet

## Architecture Components

### 1. **PhotoUploadHandler** (`frontend/dashboard/components/upload/PhotoUploadHandler.tsx`)
- Handles the entire upload orchestration
- Manages presigned URL generation, S3 upload, and post-upload actions
- Triggers debounced fetch after successful uploads

### 2. **Debounced Fetch Utility** (`frontend/dashboard/lib/debounce-fetch.ts`)
- Debounces `/images` API calls
- If multiple uploads happen within 2 seconds, only one fetch executes
- Prevents API spam from rapid uploads

### 3. **Gallery Store** (`frontend/dashboard/store/gallerySlice.ts`)
- Manages image state in Zustand store
- `fetchGalleryImages()` always bypasses cache when `forceRefresh = true`
- Applies cache-busting query parameters to image URLs

### 4. **RetryableImage Component** (`frontend/dashboard/components/ui/RetryableImage.tsx`)
- Handles individual image loading state
- Retries loading if image fails (up to 30 times with exponential backoff)
- Shows loading spinner while image loads

## Step-by-Step Flow: Single Image Upload

### Scenario: User uploads one new image

#### Step 1: File Selection
```
User selects file → handleFileSelect() called
├─ Validates file type
├─ Initializes upload progress state
└─ Sets status: "uploading"
```

#### Step 2: Presigned URL Generation
```
fetchPresignedUrls() called
├─ API call: POST /api/uploads/presign-batch
├─ Backend generates presigned S3 URLs
└─ Returns: { urls: [{ key, uploadUrl }] }
```

#### Step 3: S3 Upload
```
uploadFiles() called for each file
├─ Uploads file to S3 using presigned URL
├─ Updates progress: 0% → 100%
└─ On success: onUploadSuccess() callback
```

#### Step 4: Post-Upload Actions
```
After ALL uploads complete:
├─ Mark images as "ready" immediately
│  └─ setPerImageProgress: "uploading" → "ready"
├─ Show success toast
└─ Trigger debounced fetch
```

#### Step 5: Debounced Fetch
```
debouncedFetch() called
├─ Increments callCount
├─ Clears existing timer (if any)
├─ If pending fetch exists, waits for it
├─ Otherwise, schedules new timer (2 seconds)
└─ After 2 seconds: executes fetchFn() ONCE
   ├─ invalidateGalleryImagesCache(galleryId) // Clear cache
   ├─ fetchGalleryImages(galleryId, true) // forceRefresh = true
   │  ├─ If forceRefresh: invalidateGalleryImagesCache() called again
   │  ├─ Bypasses cache check (always fetches fresh)
   │  ├─ API call: GET /api/galleries/{galleryId}/images
   │  ├─ Backend returns images with lastModified timestamps
   │  ├─ setGalleryImages() called → applies cache-busting
   │  └─ Returns images with cache-busting: ?t={lastModified}&f={fetchTimestamp}
   └─ If reloadGallery callback provided: calls it to update local state
      └─ loadPhotos(false) // Updates local state from store (no loading spinner)
```

**Note**: We only fetch images, NOT the full gallery. Gallery metadata (bytes, settings) is updated separately via `refreshGalleryBytesOnly()`.

#### Step 7: Image Display
```
Images appear in UI
├─ Each image wrapped in <RetryableImage>
├─ RetryableImage receives src with cache-busting params
├─ If previewUrl/thumbUrl available → uses that
├─ If not available → falls back to finalUrl or url (S3 direct)
└─ RetryableImage handles loading/retry if image fails
```

## Step-by-Step Flow: Multiple Rapid Uploads

### Scenario: User uploads 10 images quickly (within 2 seconds)

#### Steps 1-3: Same as Single Upload
- Each file goes through presigned URL → S3 upload → success

#### Step 4: Multiple Debounced Fetches
```
Upload 1 succeeds → debouncedFetch() called (timer starts: 2s)
Upload 2 succeeds → debouncedFetch() called (timer reset: 2s)
Upload 3 succeeds → debouncedFetch() called (timer reset: 2s)
...
Upload 10 succeeds → debouncedFetch() called (timer reset: 2s)

Result: Only ONE fetch executes after 2 seconds from last upload
```

#### Step 5: Single API Call
```
After 2 seconds from last upload:
├─ debounceTimer fires
├─ fetchFn() executes ONCE
├─ reloadGallery() called
└─ All 10 images fetched in single API call
```

## Step-by-Step Flow: Image Replacement

### Scenario: User uploads image with same filename as existing image

#### Steps 1-3: Same as Single Upload
- File uploaded to S3 (overwrites existing file)

#### Step 4: Backend Processing
```
Lambda function (onUploadResize.ts) triggered
├─ Detects duplicate (HeadObjectCommand checks S3)
├─ If replacement detected:
│  ├─ Creates CloudFront invalidation for old paths
│  └─ Processes new previews/thumbs
└─ Updates DynamoDB with new lastModified timestamp
```

#### Step 5: Debounced Fetch
```
After 2 seconds:
├─ fetchGalleryImages() called with forceRefresh = true
├─ API returns images with NEW lastModified timestamps
├─ Cache-busting applied: ?t={newLastModified}&f={fetchTimestamp}
└─ Old cached image URLs become invalid
```

#### Step 6: Image Update
```
RetryableImage receives new URL with new cache-busting params
├─ Old URL: image.webp?t=1234567890&f=1234567890
├─ New URL: image.webp?t=1234567891&f=1234567891
└─ Browser fetches fresh image (CloudFront cache invalidated)
```

## Step-by-Step Flow: Image Not Ready Yet

### Scenario: User uploads image, but preview/thumb processing is slow

#### Steps 1-6: Same as Single Upload
- Image uploaded, debounced fetch happens, API returns image

#### Step 7: Image Display with Fallback
```
API response:
{
  key: "image.jpg",
  url: "https://s3.../image.jpg",           // ✅ Available (S3 direct)
  previewUrl: null,                          // ❌ Not ready yet
  thumbUrl: null                             // ❌ Not ready yet
}

Image mapping:
url = previewUrl ?? thumbUrl ?? finalUrl ?? url
url = null ?? null ?? null ?? "https://s3.../image.jpg"
url = "https://s3.../image.jpg"              // ✅ Falls back to S3
```

#### Step 8: RetryableImage Loading
```
RetryableImage receives src="https://s3.../image.jpg"
├─ Attempts to load image
├─ If fails: retries with exponential backoff (up to 30 times)
├─ Shows loading spinner while loading
└─ Once loaded: displays image
```

#### Step 9: Preview Becomes Available (Later)
```
User refreshes or navigates away and back:
├─ fetchGalleryImages() called
├─ API now returns:
│  {
│    previewUrl: "https://cdn.../preview.webp",  // ✅ Now available
│    thumbUrl: "https://cdn.../thumb.webp"       // ✅ Now available
│  }
└─ Image uses previewUrl (better quality, optimized)
```

## Cache-Busting Mechanism

### How It Works

1. **Backend Returns `lastModified`**
   ```typescript
   // API response
   {
     images: [{
       key: "image.jpg",
       lastModified: "2024-01-01T12:00:00Z",
       previewUrl: "https://cdn.../preview.webp"
     }]
   }
   ```

2. **Frontend Applies Cache-Busting**
   ```typescript
   // gallerySlice.ts - applyCacheBustingToImage()
   const timestamp = new Date(lastModified).getTime();
   const fetchTimestamp = Date.now();
   const url = `${previewUrl}?t=${timestamp}&f=${fetchTimestamp}`;
   ```

3. **Result**
   ```
   Original: https://cdn.../preview.webp
   Cached:   https://cdn.../preview.webp?t=1704110400000&f=1704110401000
   ```

### Why Two Timestamps?

- **`t` (lastModified)**: Stable cache key based on file modification time
  - Same file = same `t` value = can be cached
  - Different file = different `t` value = fresh fetch
  
- **`f` (fetchTimestamp)**: Ensures uniqueness on every API fetch
  - Prevents browser/CDN from serving stale cached responses
  - Even if `lastModified` hasn't propagated yet, `f` ensures fresh fetch

## No Cache Policy

### After Uploads

```typescript
// gallerySlice.ts - fetchGalleryImages()
fetchGalleryImages: async (galleryId: string, forceRefresh = false) => {
  if (forceRefresh) {
    // Clear cache when force refreshing
    state.invalidateGalleryImagesCache(galleryId);
  }
  
  // Always fetch fresh - no cache to avoid old state
  const response = await api.galleries.getImages(galleryId);
  // ...
}
```

### Why No Cache?

- **Prevents stale state**: After upload, we want fresh images immediately
- **Handles replacements**: Old cached images won't show up
- **Simpler logic**: No need to compare cached vs fresh data

## Debounce Implementation

### Code Flow

```typescript
// debounce-fetch.ts
let debounceTimer: NodeJS.Timeout | null = null;
let pendingFetch: Promise<void> | null = null;
let callCount = 0;

export function debouncedFetch(fetchFn, delay = 2000) {
  callCount++;
  
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  // If fetch already in progress, wait for it
  if (pendingFetch) {
    return pendingFetch;
  }
  
  // Schedule new fetch
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const currentCallCount = callCount;
    callCount = 0; // Reset
    
    if (currentCallCount > 0) {
      pendingFetch = fetchFn();
      await pendingFetch;
      pendingFetch = null;
    }
  }, delay);
}
```

### Example Timeline

```
T=0s:   Upload 1 succeeds → debouncedFetch() → timer starts (2s)
T=0.5s: Upload 2 succeeds → debouncedFetch() → timer resets (2s)
T=1s:   Upload 3 succeeds → debouncedFetch() → timer resets (2s)
T=1.5s: Upload 4 succeeds → debouncedFetch() → timer resets (2s)
T=3.5s: Timer fires → fetchFn() executes ONCE
```

## RetryableImage Component

### How It Works

```typescript
// RetryableImage.tsx
export const RetryableImage = ({ src, maxRetries = 30 }) => {
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const retryCountRef = useRef(0);
  
  useEffect(() => {
    // Reset when src changes
    setImageSrc(src);
    retryCountRef.current = 0;
    
    // Test if image is cached
    const testImg = new Image();
    testImg.onload = () => setIsLoading(false);
    testImg.onerror = () => setIsLoading(true);
    testImg.src = src;
  }, [src]);
  
  const handleError = () => {
    retryCountRef.current += 1;
    if (retryCountRef.current < maxRetries) {
      // Exponential backoff
      const delay = Math.min(500 * Math.pow(1.2, retryCount), 5000);
      setTimeout(() => {
        // Add cache-busting for retry
        const retryUrl = `${src}?_t=${Date.now()}&_r=${retryCount}`;
        setImageSrc(retryUrl);
      }, delay);
    }
  };
  
  // Render with loading state
  return (
    <>
      {isLoading && <LoadingSpinner />}
      <img src={imageSrc} onError={handleError} onLoad={() => setIsLoading(false)} />
    </>
  );
};
```

### Retry Strategy

- **Initial delay**: 500ms
- **Exponential backoff**: `delay = 500 * 1.2^retryCount`
- **Max delay**: 5000ms (5 seconds)
- **Max retries**: 30
- **Total max time**: ~30 seconds of retries

## Error Scenarios

### Scenario 1: S3 Upload Fails

```
Step 3: S3 Upload fails
├─ onUploadError() callback
├─ Progress status: "uploading" → "error"
├─ Error shown in progress overlay
└─ No debounced fetch triggered
```

### Scenario 2: API Fetch Fails

```
Step 6: fetchGalleryImages() fails
├─ Error logged to console
├─ Returns empty array []
├─ Existing images remain visible
└─ RetryableImage will retry individual images
```

### Scenario 3: Image Never Loads

```
Step 7: RetryableImage retries 30 times
├─ After 30 retries: stops retrying
├─ Shows error state (if implemented)
└─ User can manually refresh page
```

## Final Images Upload Flow

### Differences from Originals

1. **API Endpoint**: Uses `api.orders.getFinalImages()` instead of `api.galleries.getImages()`
2. **URL Mapping**: 
   ```typescript
   url: previewUrl ?? thumbUrl ?? finalUrl ?? url  // Display
   finalUrl: finalUrl ?? url                        // Download
   ```
3. **Backend Call**: After upload, calls `api.uploads.markFinalUploadComplete()`

### Step-by-Step (Finals)

```
1. Upload to S3 → Success
2. Mark as "ready"
3. Call markFinalUploadComplete() API
4. Debounced fetch (2s delay)
5. loadOrderData(true) → fetches final images
6. Images appear with RetryableImage handling
```

## Summary: Key Principles

1. **No Polling**: Debounced fetch happens once after uploads
2. **No Cache After Upload**: Always `forceRefresh = true` to avoid stale state
3. **Individual Loading**: Each `RetryableImage` handles its own state
4. **Fallback to S3**: If previews/thumbs not ready, use direct S3 URLs
5. **Cache-Busting**: Query params ensure fresh images (`?t=...&f=...`)
6. **Simple & Reliable**: Minimal complexity, maximum reliability

## Code Locations

### Key Files

1. **PhotoUploadHandler.tsx**
   - Location: `frontend/dashboard/components/upload/PhotoUploadHandler.tsx`
   - Key function: `handleFileSelect()` (lines ~140-360)
   - Debounced fetch: Lines 331-344
   - Post-upload logic: Lines 313-350

2. **debounce-fetch.ts**
   - Location: `frontend/dashboard/lib/debounce-fetch.ts`
   - Key function: `debouncedFetch()` (lines 10-47)
   - Global state: `debounceTimer`, `pendingFetch`, `callCount`

3. **gallerySlice.ts**
   - Location: `frontend/dashboard/store/gallerySlice.ts`
   - Cache-busting: `addCacheBustingToUrl()` (lines 11-49)
   - Image processing: `applyCacheBustingToImage()` (lines 52-77)
   - Fetch function: `fetchGalleryImages()` (lines 462-487)
   - Cache invalidation: `invalidateGalleryImagesCache()` (line ~290)

4. **photos.tsx** (Originals)
   - Location: `frontend/dashboard/pages/galleries/[id]/photos.tsx`
   - Reload function: `reloadGallery()` (lines 176-183)
   - Image loading: `loadPhotos()` (lines ~240-300)

5. **orders/[orderId].tsx** (Finals)
   - Location: `frontend/dashboard/pages/galleries/[id]/orders/[orderId].tsx`
   - Reload function: `reloadGallery()` (lines 354-359)
   - Image loading: `loadOrderData()` (lines 127-280)

6. **RetryableImage.tsx**
   - Location: `frontend/dashboard/components/ui/RetryableImage.tsx`
   - Retry logic: `handleError()` (lines 73-98)
   - Loading state: `useEffect()` (lines 25-71)

## Code Review Checklist

### Functionality
- [ ] **Debounce works correctly**: Multiple rapid uploads → single fetch
- [ ] **Cache bypassed**: `forceRefresh = true` after uploads
- [ ] **Fallback works**: Images use S3 URLs if previews not ready
- [ ] **Cache-busting applied**: URLs have `?t=...&f=...` params
- [ ] **RetryableImage handles errors**: Retries with exponential backoff
- [ ] **Progress updates**: Status changes from "uploading" → "ready"
- [ ] **Replacements work**: Old images replaced with new cache-busted URLs
- [ ] **CloudFront invalidation**: Backend invalidates cache on replacements

### Code Quality
- [ ] **No memory leaks**: Timers cleared, refs reset
- [ ] **Error handling**: Upload failures handled gracefully
- [ ] **Type safety**: TypeScript types are correct
- [ ] **Async/await**: Proper error handling in async functions
- [ ] **Cleanup**: `uploadCancelRef` properly checked before operations

### Performance
- [ ] **Debounce prevents spam**: Multiple uploads don't cause multiple API calls
- [ ] **Cache invalidation**: Cache properly cleared when needed
- [ ] **No unnecessary re-renders**: State updates are minimal
- [ ] **Retry limits**: RetryableImage doesn't retry indefinitely

### Edge Cases
- [ ] **Upload cancellation**: `uploadCancelRef` prevents operations after cancel
- [ ] **Network failures**: API failures don't break the UI
- [ ] **Slow processing**: Images fallback to S3 if previews not ready
- [ ] **Rapid uploads**: Debounce handles 10+ uploads correctly
- [ ] **Image replacement**: Old images properly replaced with new ones

