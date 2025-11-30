# Storage Recalculation Architecture

## Overview

Storage recalculation tracks the total bytes used for originals and finals images in each gallery. This document describes the simplified on-demand architecture that replaced the previous event-driven system.

## Architecture Decision

**Previous Approach (Event-Driven):**
- S3 events → SQS Queue → Lambda → Recalculate → Store in DynamoDB
- Complex infrastructure: 2 SQS queues, 3 Lambda functions, event notifications
- Always up-to-date but overkill for this use case

**Current Approach (On-Demand with Caching):**
- Simple function call with 5-minute cache TTL
- Critical operations force recalculation; display uses cached values
- ~70% reduction in code complexity and infrastructure

## Implementation

### Core Function

**File:** `backend/functions/galleries/recalculateBytesUsed.ts`

**Function:** `recalculateStorageInternal()`

**Parameters:**
- `galleryId`: Gallery ID to recalculate
- `galleriesTable`: DynamoDB table name
- `bucket`: S3 bucket name
- `gallery`: Gallery object from DynamoDB (optional, will be fetched if needed)
- `logger`: Logger instance
- `forceRecalc`: If `true`, bypasses cache and forces recalculation (default: `false`)

### Caching Logic

**Cache TTL:** 5 minutes

**Behavior:**
1. If `forceRecalc = true`: Always recalculates from S3 (bypasses cache)
2. If `forceRecalc = false`: 
   - Checks `lastBytesUsedRecalculatedAt` timestamp
   - If cache is fresh (< 5 minutes old): Returns cached values
   - If cache is stale (>= 5 minutes old): Recalculates from S3

**Cache Storage:**
- Stored in DynamoDB: `lastBytesUsedRecalculatedAt` timestamp
- Updated after each recalculation

### Usage Patterns

#### Critical Operations (Force Recalculation)

These operations require accurate, up-to-date storage values:

1. **Payment Processing** (`backend/functions/galleries/pay.ts`)
   ```typescript
   await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger, true);
   ```
   - **Why:** Must validate storage limits before charging customer
   - **Impact:** Prevents overcharging or undercharging

2. **Upload Validation** (`backend/functions/galleries/validateUploadLimits.ts`)
   ```typescript
   await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger, true);
   ```
   - **Why:** Must check if user can upload more images before allowing upload
   - **Impact:** Prevents exceeding plan limits

#### Display Operations (Use Cache)

These operations can tolerate slightly stale values (up to 5 minutes):

1. **Gallery List** (`backend/functions/galleries/list.ts`)
   - Shows storage usage in gallery list
   - Uses cached values if available

2. **Gallery Sidebar** (`frontend/dashboard/components/galleries/sidebar/StorageUsageInfo.tsx`)
   - Displays storage usage in UI
   - Uses cached values if available

3. **API Endpoint** (`backend/functions/galleries/recalculateBytesUsed.ts`)
   - Manual recalculation endpoint
   - Uses cached values if fresh (unless forced)

#### Post-Upload Operations (Force Recalculation)

These operations force recalculation immediately after uploads complete (files are in S3):

1. **After Original Uploads** (`frontend/dashboard/components/upload/PhotoUploadHandler.tsx`)
   ```typescript
   void refreshGalleryBytesOnly(galleryId, true); // forceRecalc = true, silent
   ```
   - **When:** Immediately after all files are uploaded to S3 (before processing)
   - **Trigger:** `setIsUploadComplete(true)` - upload phase complete
   - **Result:** Storage values updated silently (no UI notification)
   - **Note:** Processing (previews/thumbs) doesn't change storage size, so no recalculation needed after processing

2. **After Final Uploads** (`backend/functions/orders/uploadFinalComplete.ts`)
   ```typescript
   await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger, true);
   ```
   - **When:** When `upload-complete` endpoint is called (after all finals are uploaded)
   - **Trigger:** Frontend calls `/orders/{orderId}/final/upload-complete` after uploads
   - **Result:** Storage values updated immediately (silent, no UI notification)
   - **Note:** Processing (previews/thumbs) doesn't change storage size, so no recalculation needed after processing

#### Post-Delete Operations (Force Recalculation)

These operations force recalculation immediately after deletes to ensure accurate values:

1. **After Original Deletes** (`frontend/dashboard/pages/galleries/[id]/photos.tsx`)
   ```typescript
   await refreshGalleryBytesOnly(galleryId, true); // forceRecalc = true
   ```
   - **When:** After the LAST deletion in a batch completes (not per image)
   - **Trigger:** When `deletingImages` set becomes empty (all deletes finished)
   - **Result:** UI shows accurate values immediately after all deletes complete

2. **After Final Deletes** (`frontend/dashboard/pages/galleries/[id]/orders/[orderId].tsx`)
   ```typescript
   await refreshGalleryBytesOnly(galleryId, true); // forceRecalc = true
   ```
   - **When:** After the LAST deletion in a batch completes (not per image)
   - **Trigger:** When `deletedImageKeys` set becomes empty (all deletes finished)
   - **Result:** UI shows accurate values immediately after all deletes complete

### Cost Analysis

**S3 ListObjects Pricing:**
- $0.005 per 1,000 requests
- Each recalculation = 1 request (per gallery)

**Example Costs:**
- 1,000 galleries recalculated once per day = $0.005/day = ~$0.15/month
- Critical operations (pay, validateUploadLimits) force recalculation
- Display operations use cache (no S3 calls if cache is fresh)

**Comparison to Event-Driven:**
- Event-driven: ~$0.0003 per 3,000 images (Lambda invocations)
- On-demand: ~$0.005 per recalculation (S3 ListObjects)
- **Verdict:** On-demand is more cost-effective for most use cases (fewer recalculations needed)

### Cache Invalidation

**Natural Expiration:**
- Cache expires after 5 minutes automatically
- Next read triggers recalculation if cache is stale

**After Deletes:**
- Delete operations don't invalidate cache immediately
- Cache will naturally expire after 5 minutes
- Critical operations (pay, validateUploadLimits) force recalculation anyway
- **Acceptable:** Display can show slightly stale values for up to 5 minutes after delete

**After Uploads:**
- Upload operations trigger forced recalculation **once after uploads complete** (files in S3, not yet processed)
- **Originals:** `PhotoUploadHandler.tsx` calls `refreshGalleryBytesOnly(galleryId, true)` immediately after uploads
- **Finals:** `uploadFinalComplete.ts` calls `recalculateStorageInternal(..., true)` when upload-complete endpoint is called
- **Note:** Processing (creating previews/thumbs) doesn't change storage size, so no recalculation needed after processing
- **Result:** Storage values updated immediately after uploads (silent, no UI notification)

**After Deletes:**
- Delete operations trigger forced recalculation **once after ALL deletes complete** (not per image)
- **Originals:** `photos.tsx` calls `refreshGalleryBytesOnly(galleryId, true)` after last deletion in batch completes
- **Finals:** `orders/[orderId].tsx` calls `refreshGalleryBytesOnly(galleryId, true)` after last deletion in batch completes
- **Result:** UI always shows accurate values immediately after all deletes in a batch complete

### Race Condition Handling

**Conditional Updates:**
- Uses DynamoDB conditional updates with `lastBytesUsedRecalculatedAt` timestamp
- Only updates if our timestamp is newer than existing
- Prevents concurrent recalculations from overwriting each other

**Mismatch Detection:**
- If conditional update fails, compares calculated vs stored values
- If difference > 1KB tolerance, retries recalculation
- Ensures no deletions are missed due to eventual consistency

## Migration from Event-Driven

**Removed Infrastructure:**
- ❌ S3 event notifications (`OBJECT_CREATED_PUT`)
- ❌ SQS queues (`S3EventsQueue`, `DeleteOperationsQueue` for storage)
- ❌ `onS3StorageChange` Lambda function (event-driven recalculation)
- ❌ Event-driven triggers from `onUploadResize` and `onS3DeleteBatch`

**Kept Infrastructure:**
- ✅ `onS3DeleteBatch` Lambda (still needed for batch deletes)
- ✅ `onUploadResize` Lambda (still needed for image processing)
- ✅ Delete queue (still needed for batching delete operations)

**Code Changes:**
- `recalculateBytesUsed.ts`: Added caching logic with 5-minute TTL
- `pay.ts`: Force recalculation before payment
- `validateUploadLimits.ts`: Force recalculation before validation
- `onS3DeleteBatch.ts`: Removed storage recalculation trigger
- `onUploadResize.ts`: Removed storage recalculation trigger

## Benefits

1. **Simplicity:** ~70% reduction in code complexity
2. **Cost:** Lower operational costs (fewer Lambda invocations)
3. **Reliability:** Fewer moving parts = fewer failure points
4. **Performance:** Cached reads are instant (no S3 calls)
5. **Accuracy:** Critical operations always get fresh data

## Trade-offs

1. **Staleness:** Display values can be up to 5 minutes stale
   - **Mitigation:** Critical operations force recalculation
   - **Acceptable:** Users don't need millisecond-accurate display values

2. **S3 Costs:** Each recalculation costs ~$0.005 per 1,000 requests
   - **Mitigation:** Caching reduces recalculation frequency
   - **Acceptable:** Minimal cost for most use cases

## Future Considerations

**Potential Optimizations:**
1. **Adaptive TTL:** Shorter TTL for active galleries, longer for inactive
2. **Invalidation on Delete:** Invalidate cache immediately after deletes (if needed)
3. **Batch Recalculation:** Recalculate multiple galleries in one S3 call (if possible)

**Monitoring:**
- Track cache hit/miss rates
- Monitor S3 ListObjects costs
- Alert if recalculation frequency exceeds thresholds

