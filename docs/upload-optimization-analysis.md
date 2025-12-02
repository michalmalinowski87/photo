# Upload API Calls Analysis

## Current Problem: Too Many API Calls

From the network log, uploading **ONE image** triggers:

1. `upload-batch` - Get presigned URLs ✅ (Needed)
2. `invalidation.png` - S3 upload ✅ (Needed)
3. `images` - Fetch images (1st call) ⚠️
4. `bytes-used?force=true` - Update bytes ✅ (Needed, but could be optimized)
5. `2-1764612820026` - Order endpoint ⚠️
6. `upload-complete` - Mark complete ✅ (Needed for finals)
7. `delivered` - Check delivery status ⚠️ (Unnecessary?)
8. `images` - Fetch images (2nd call) ❌ (Should be debounced!)
9. `status` - Check status ⚠️
10. `2-1764612820026` - Order endpoint again ❌
11. `delivered` - Check delivery again ❌
12. `images` - Fetch images (3rd call) ❌
13. `images` - Fetch images (4th call) ❌
14. `2-1764612820026` - Order endpoint again ❌
15. `delivered` - Check delivery again ❌
16. `images` - Fetch images (5th call) ❌

**Total: 16 API calls for 1 image upload!**

## Root Causes

### 1. Multiple `/images` Calls
**Problem**: Debounce isn't working because:
- Different components might be calling it
- `loadPhotos()` might be triggering additional calls
- `onOrderUpdated` callback triggers more fetches
- useEffect hooks might be re-triggering

**Fix**: 
- Ensure debounce is truly global (not per-component)
- Remove unnecessary `loadPhotos()` calls
- Don't trigger fetches from callbacks

### 2. Unnecessary Order/Status Calls
**Problem**: 
- `onOrderUpdated` callback triggers `refreshOrderStatus()`
- `refreshOrderStatus()` might trigger `loadOrderData()`
- `loadOrderData()` fetches orders, status, images again

**Fix**:
- Only update order status if actually needed
- Don't cascade fetches from callbacks

### 3. Bytes Recalculation
**Problem**: 
- `refreshGalleryBytesOnly()` is called immediately
- This is fine, but could be batched

**Fix**: Already optimized (silent, no UI update)

## Recommended Solution: Simplify & Fix Current Implementation

Instead of using a library, let's **fix the current implementation** because:

1. **We already have S3 presigned URLs working** ✅
2. **We already have progress tracking** ✅
3. **We already have error handling** ✅
4. **The issue is too many API calls, not missing features**

### Fix Strategy

#### 1. **Single Source of Truth for Debounce**
```typescript
// Make debounce truly global - one instance for all uploads
// Current: Each component might have its own debounce instance
// Fix: Use a singleton debounce manager
```

#### 2. **Remove Unnecessary Callbacks**
```typescript
// Current: onOrderUpdated → refreshOrderStatus → loadOrderData → fetch images
// Fix: Only update what's needed, don't cascade
```

#### 3. **Optimize Image Fetching**
```typescript
// Current: Multiple components calling fetchGalleryImages
// Fix: 
// - Only fetch once after upload (debounced)
// - Don't fetch from useEffect hooks after upload
// - Don't fetch from onOrderUpdated callback
```

#### 4. **Batch Updates**
```typescript
// Current: bytes-used, upload-complete, status all separate
// Fix: Could batch these into one endpoint (future optimization)
```

## Alternative: Use a Library

If we want to use a library, here are options:

### Option 1: **Uppy** (Recommended)
- **Pros**: 
  - Full-featured (S3, progress, retry, etc.)
  - Well-maintained
  - Supports presigned URLs
  - Built-in dashboard UI
- **Cons**:
  - Large bundle size (~200KB)
  - Might be overkill
  - Need to integrate with our backend

### Option 2: **react-dropzone** + Custom S3 Upload
- **Pros**:
  - Lightweight
  - Good UI component
  - We handle S3 upload ourselves
- **Cons**:
  - Still need to build progress tracking
  - Still need to handle errors
  - Doesn't solve the API call problem

### Option 3: **Keep Current, Fix It**
- **Pros**:
  - Already working
  - Just needs optimization
  - No new dependencies
- **Cons**:
  - Need to fix the code
  - Might take some time

## Recommendation

**Fix the current implementation** because:
1. The core upload logic is fine
2. The problem is too many API calls (fixable)
3. No need to add a large library dependency
4. We have full control over the code

## Immediate Fixes Applied

1. ✅ **Removed `onOrderUpdated` cascade** - No longer triggers status/order/image fetches after upload
2. ✅ **Fixed `reloadGallery` callback** - Now only updates local state from store, doesn't fetch again
3. ✅ **Optimized `loadPhotos()`** - For uploads, we read from store instead of fetching again
4. ✅ **Separated finals/originals** - Finals fetch from orders endpoint, originals from gallery endpoint

## Code Changes Made

### 1. Removed `onOrderUpdated` Callback Trigger
**Before**: `onOrderUpdated` → `refreshOrderStatus` → `loadOrderData` → multiple fetches
**After**: Removed the callback trigger - order status updates happen on backend

### 2. Fixed `reloadGallery` to Only Update State
**Before**: `reloadGallery` → `loadPhotos()` → `fetchGalleryImages()` → duplicate API call
**After**: `reloadGallery` → reads from store → updates local state only

### 3. Separated Finals vs Originals Fetching
**Before**: Both used same flow, causing confusion
**After**: Finals fetch from `api.orders.getFinalImages()`, originals from `fetchGalleryImages()`

## Expected Result After Fixes

**Before**: 16 API calls for 1 image
**After**: ~4-5 API calls for 1 image:
1. `upload-batch` ✅
2. S3 upload ✅
3. `bytes-used` ✅
4. `upload-complete` (finals only) ✅
5. `images` (debounced, once) ✅

**Reduction: 70% fewer API calls!**

