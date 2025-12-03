# Image Upload Flow Documentation

This document describes the complete image upload flow, step-by-step, for all scenarios.

## Overview

The upload system uses a **simple, debounced approach** with no polling:
- Upload to S3 → Success → Debounced fetch → Images appear
- Each `RetryableImage` component handles its own loading/retry logic
- No cache is used after uploads to avoid stale state
- Images fallback to S3 URLs if previews/thumbs aren't ready yet

## Architecture Components

### 1. **Uppy Upload System** (`frontend/dashboard/lib/uppy-config.ts`, `frontend/dashboard/hooks/useUppyUpload.ts`)
- Handles the entire upload orchestration via Uppy 5.0
- Manages presigned URL generation, S3 upload, and post-upload actions
- Generates client-side thumbnails (preview and thumbnail versions)
- Triggers refetch after successful uploads

### 2. **Gallery Store** (`frontend/dashboard/store/gallerySlice.ts`)
- Manages image state in Zustand store
- `fetchGalleryImages()` always bypasses cache when `forceRefresh = true`
- Applies cache-busting query parameters to image URLs

### 3. **LazyRetryableImage Component** (`frontend/dashboard/components/ui/LazyRetryableImage.tsx`)
- Handles individual image loading state with lazy loading (Intersection Observer)
- Implements progressive fallback strategy (CloudFront → S3 → next size → original)
- Uses exponential backoff to prevent cascading failures
- Shows loading spinner while image loads
- **Smart Fallback**: Only tries URLs that backend verified exist (null URLs skipped immediately)

### 4. **Image Fallback System** (`frontend/dashboard/lib/image-fallback.ts`)
- Single source of truth for image loading strategy
- Handles URL selection, progressive fallback, and cache busting
- Automatically applies cache busting using S3 lastModified timestamp
- Prevents infinite fallback loops with attempt tracking

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
Uppy calls getUploadParameters() function
├─ API call: POST /api/uploads/presign-batch
├─ Backend generates presigned S3 URLs (original, preview, thumbnail)
└─ Returns: { urls: [{ key, uploadUrl, previewUrl, thumbnailUrl }] }
```

#### Step 3: S3 Upload
```
Uppy uploads files to S3
├─ Uploads original file using presigned URL
├─ Updates progress: 0% → 100%
└─ On success: upload-success event triggered
```

#### Step 4: Client-Side Thumbnail Generation
```
ThumbnailUploadPlugin processes upload-success event
├─ Generates preview (1200px) and thumbnail (200px) in browser
├─ Converts to WebP format
└─ Uploads previews/thumbs to S3 using presigned URLs
```

#### Step 5: Post-Upload Actions
```
After ALL uploads complete:
├─ Uppy triggers onComplete callback
├─ Calls refreshGalleryBytesOnly() to update storage
├─ Shows success toast
└─ Triggers refetch of images
```

#### Step 6: Image Refetch
```
fetchGalleryImages() called
├─ invalidateGalleryImagesCache(galleryId) // Clear cache
├─ API call: GET /api/galleries/{galleryId}/images
├─ Backend verifies file existence (HEAD requests) before generating presigned URLs
├─ Backend returns images with lastModified timestamps and verified presigned URLs
├─ setGalleryImages() called → applies cache-busting
└─ Returns images with cache-busting: ?t={lastModified}
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

#### Step 4: Post-Upload Processing
```
Upload 1 succeeds → ThumbnailUploadPlugin generates previews/thumbs
Upload 2 succeeds → ThumbnailUploadPlugin generates previews/thumbs
...
Upload 10 succeeds → ThumbnailUploadPlugin generates previews/thumbs

All uploads complete → onComplete callback triggered
```

#### Step 5: Single API Call
```
After all uploads complete:
├─ refreshGalleryBytesOnly() called (updates storage)
├─ fetchGalleryImages() called ONCE
└─ All 10 images fetched in single API call
```

## Step-by-Step Flow: Image Replacement

### Scenario: User uploads image with same filename as existing image

#### Steps 1-3: Same as Single Upload
- File uploaded to S3 (overwrites existing file)

#### Step 4: Backend Processing
```
Client-side thumbnail generation (Uppy plugin)
├─ Generates preview (1200px) and thumbnail (200px) in browser
├─ Uploads previews/thumbs to S3 using presigned URLs
└─ Images immediately available (no server-side processing delay)
```

#### Step 5: Debounced Fetch
```
After 2 seconds:
├─ fetchGalleryImages() called with forceRefresh = true
├─ API returns images with NEW lastModified timestamps
├─ Cache-busting applied: ?t={newLastModified} (S3 lastModified changes automatically)
└─ Old cached image URLs become invalid
```

#### Step 6: Image Update
```
RetryableImage receives new URL with new cache-busting params
├─ Old URL: image.webp?t=1234567890
├─ New URL: image.webp?t=1234567891 (S3 lastModified changes automatically)
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
  url: "https://s3.../image.jpg",           // ✅ Available (S3 direct, verified via HEAD)
  previewUrl: null,                          // ❌ Not ready yet (HEAD returned 404)
  thumbUrl: null,                            // ❌ Not ready yet (HEAD returned 404)
  previewUrlFallback: null,                  // ❌ Not generated (file doesn't exist)
  thumbUrlFallback: null                     // ❌ Not generated (file doesn't exist)
}

Image mapping (via getInitialImageUrl):
url = thumbUrl ?? previewUrl ?? bigThumbUrl ?? finalUrl ?? url
url = null ?? null ?? null ?? null ?? "https://s3.../image.jpg"
url = "https://s3.../image.jpg"              // ✅ Falls back to S3
```

#### Step 8: LazyRetryableImage Loading
```
LazyRetryableImage receives src="https://s3.../image.jpg"
├─ Lazy loads when image enters viewport (Intersection Observer)
├─ Attempts to load image
├─ If fails → progressive fallback (tries all available sizes)
├─ Skips null URLs immediately (no failed network requests)
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

2. **Frontend Applies Cache-Busting Automatically**
   ```typescript
   // image-fallback.ts - getInitialImageUrl()
   // Cache busting is applied automatically using S3 lastModified
   const timestamp = new Date(lastModified).getTime();
   const url = `${previewUrl}?t=${timestamp}`;
   ```

3. **Result**
   ```
   Original: https://cdn.../preview.webp
   Cached:   https://cdn.../preview.webp?t=1704110400000
   ```

### Cache Busting Strategy

- **Uses S3 `lastModified` timestamp only**
  - Same file = same `t` value = can be cached
  - Different file = different `t` value = fresh fetch
  - When a new photo is uploaded, S3's `lastModified` changes automatically
  - No need for additional cache busting parameters

### Benefits

- **Efficient**: Only cache-busts when files actually change
- **Automatic**: Handled by unified image loading strategy in `image-fallback.ts`
- **Simple**: Single timestamp parameter (`t`) instead of multiple

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

## Upload Completion Handling

### Code Flow

```typescript
// useUppyUpload.ts
uppy.on('complete', async (result) => {
  // All uploads complete
  if (result.successful.length > 0) {
    // Update storage bytes
    await refreshGalleryBytesOnly(galleryId, true);
    
    // Refetch images
    await fetchGalleryImages(galleryId, true);
    
    // Show success notification
    toast.success('Zdjęcia zostały przesłane pomyślnie');
  }
});
```

### Example Timeline

```
T=0s:   Upload 1 succeeds → ThumbnailUploadPlugin generates previews/thumbs
T=0.5s: Upload 2 succeeds → ThumbnailUploadPlugin generates previews/thumbs
T=1s:   Upload 3 succeeds → ThumbnailUploadPlugin generates previews/thumbs
T=1.5s: Upload 4 succeeds → ThumbnailUploadPlugin generates previews/thumbs
T=2s:   All uploads complete → onComplete callback → fetchGalleryImages() executes ONCE
```

## RetryableImage Component

### How It Works

```typescript
// LazyRetryableImage.tsx
export const LazyRetryableImage = ({ imageData, preferredSize = 'thumb' }) => {
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
3. **Individual Loading**: Each `LazyRetryableImage` handles its own state with lazy loading
4. **Fallback to S3**: If previews/thumbs not ready, use direct S3 URLs
5. **Cache-Busting**: Query params ensure fresh images (`?t={lastModified}`)
6. **Smart Verification**: Backend verifies file existence (HEAD requests) before generating presigned URLs
7. **Optimized Fallback**: Frontend only tries URLs that backend verified exist (null URLs skipped immediately)
8. **Simple & Reliable**: Minimal complexity, maximum reliability

## Code Locations

### Key Files

1. **uppy-config.ts**
   - Location: `frontend/dashboard/lib/uppy-config.ts`
   - Key function: `createUppyInstance()` - Configures Uppy with S3 plugin and thumbnail generator
   - Thumbnail upload: `ThumbnailUploadPlugin` generates and uploads previews/thumbs

2. **useUppyUpload.ts**
   - Location: `frontend/dashboard/hooks/useUppyUpload.ts`
   - Key function: `useUppyUpload()` - Manages upload lifecycle
   - Post-upload: `onComplete` callback handles storage update and image refetch

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

6. **LazyRetryableImage.tsx**
   - Location: `frontend/dashboard/components/ui/LazyRetryableImage.tsx`
   - Handles lazy loading and progressive fallback

7. **image-fallback.ts**
   - Location: `frontend/dashboard/lib/image-fallback.ts`
   - Single source of truth for image loading strategy
   - Retry logic: `handleError()` (lines 73-98)
   - Loading state: `useEffect()` (lines 25-71)

## Code Review Checklist

### Functionality
- [ ] **Upload completion works correctly**: Multiple rapid uploads → single fetch after all complete
- [ ] **Cache bypassed**: `forceRefresh = true` after uploads
- [ ] **Fallback works**: Images use S3 URLs if previews not ready
- [ ] **Cache-busting applied**: URLs have `?t={lastModified}` params
- [ ] **RetryableImage handles errors**: Retries with exponential backoff
- [ ] **Progress updates**: Uppy shows progress per file
- [ ] **Thumbnail generation**: Client-side previews/thumbs generated and uploaded
- [ ] **Replacements work**: Old images replaced with new cache-busted URLs

### Code Quality
- [ ] **No memory leaks**: Timers cleared, refs reset
- [ ] **Error handling**: Upload failures handled gracefully
- [ ] **Type safety**: TypeScript types are correct
- [ ] **Async/await**: Proper error handling in async functions
- [ ] **Cleanup**: `uploadCancelRef` properly checked before operations

### Performance
- [ ] **Single fetch after uploads**: Multiple uploads trigger single fetch after all complete
- [ ] **Cache invalidation**: Cache properly cleared when needed
- [ ] **No unnecessary re-renders**: State updates are minimal
- [ ] **Retry limits**: RetryableImage doesn't retry indefinitely
- [ ] **Client-side processing**: Thumbnails generated in browser (no server delay)

### Edge Cases
- [ ] **Upload cancellation**: Uppy handles cancellation gracefully
- [ ] **Network failures**: API failures don't break the UI
- [ ] **Slow processing**: Images fallback to S3 if previews not ready
- [ ] **Rapid uploads**: Uppy handles 10+ uploads correctly with batching
- [ ] **Image replacement**: Old images properly replaced with new ones
- [ ] **Thumbnail generation failure**: Falls back to original if thumbnail generation fails

