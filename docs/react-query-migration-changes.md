# React Query Migration Changes

## Summary

This document summarizes the comprehensive migration from direct API calls (`api.xxx()`) to React Query hooks (`useQuery`, `useMutation`, `useInfiniteQuery`) across the entire dashboard codebase. The migration ensures proper cache management, automatic refetching, optimistic updates, and better error handling.

## Key Changes

1. **All direct API calls in components, pages, and hooks have been replaced with React Query hooks**
2. **Query hooks** (`useQuery`) are used for GET requests
3. **Mutation hooks** (`useMutation`) are used for POST/PUT/PATCH/DELETE requests
4. **Proper cache invalidation** is implemented after mutations using `queryClient.invalidateQueries`
5. **Optimistic updates** are implemented where appropriate for better UX
6. **TypeScript typing** is properly enforced for all query/mutation hooks
7. **ESLint compliance** is maintained with 0 errors

## Files Modified

### New Files Created
- `frontend/dashboard/hooks/mutations/useUploadMutations.ts` - New mutation hooks for upload operations

### Query Hooks (Updated)
- `frontend/dashboard/hooks/queries/useGalleries.ts` - Added `useGalleryDeliveredOrders` hook
- `frontend/dashboard/hooks/queries/useAuth.ts` - Already using React Query
- `frontend/dashboard/hooks/queries/useClients.ts` - Already using React Query
- `frontend/dashboard/hooks/queries/usePackages.ts` - Already using React Query
- `frontend/dashboard/hooks/queries/useOrders.ts` - Already using React Query
- `frontend/dashboard/hooks/queries/useWallet.ts` - Already using React Query
- `frontend/dashboard/hooks/queries/useDashboard.ts` - Already using React Query

### Mutation Hooks (Updated)
- `frontend/dashboard/hooks/mutations/useOrderMutations.ts` - Added `useDownloadFinalZip` hook
- `frontend/dashboard/hooks/mutations/useGalleryMutations.ts` - Already using React Query
- `frontend/dashboard/hooks/mutations/useClientMutations.ts` - Already using React Query
- `frontend/dashboard/hooks/mutations/usePackageMutations.ts` - Already using React Query
- `frontend/dashboard/hooks/mutations/useAuthMutations.ts` - Already using React Query
- `frontend/dashboard/hooks/mutations/useWalletMutations.ts` - Already using React Query

### Components Refactored
- `frontend/dashboard/components/galleries/CreateGalleryWizard.tsx` - Replaced `api.packages.list()` and `api.clients.list()` with `usePackages()` and `useClients()` hooks
- `frontend/dashboard/components/galleries/GallerySettingsForm.tsx` - Replaced `api.galleries.checkDeliveredOrders()` with `useGalleryDeliveredOrders()` hook
- `frontend/dashboard/components/galleries/sidebar/CoverPhotoUpload.tsx` - Replaced `api.galleries.getCoverPhoto()` with `useGalleryCoverPhoto()` hook
- `frontend/dashboard/components/galleries/NextStepsOverlay.tsx` - Replaced `api.auth.getBusinessInfo()`, `api.galleries.update()`, and `api.auth.updateBusinessInfo()` with mutation hooks
- `frontend/dashboard/components/galleries/LimitExceededModal.tsx` - Replaced multiple `api.galleries.*` calls with mutation hooks
- `frontend/dashboard/components/galleries/ClientSendSuccessPopup.tsx` - Replaced `api.auth.getBusinessInfo()` and `api.auth.updateBusinessInfo()` with hooks
- `frontend/dashboard/components/welcome/WelcomePopupWrapper.tsx` - Replaced `api.auth.getBusinessInfo()`, `api.wallet.getTransactions()`, `api.wallet.getBalance()`, and `api.auth.updateBusinessInfo()` with hooks
- `frontend/dashboard/components/orders/OrdersModal.tsx` - Updated to use query key factory pattern

### Pages Refactored
- `frontend/dashboard/pages/galleries/[id].tsx` - Replaced `api.galleries.sendToClient()` and `api.orders.approveChangeRequest()` with mutation hooks
- `frontend/dashboard/pages/galleries/[id]/view.tsx` - Replaced `api.galleries.checkDeliveredOrders()` and `api.galleries.deleteImage()` with hooks (API calls in service worker handler remain as special case)

### Custom Hooks Refactored
- `frontend/dashboard/hooks/usePlanPayment.ts` - Replaced `api.galleries.pay()` and `api.galleries.update()` with mutation hooks
- `frontend/dashboard/hooks/useUppyUpload.ts` - Replaced `api.galleries.validateUploadLimits()`, `api.uploads.markFinalUploadComplete()`, and delete operations with mutation hooks
- `frontend/dashboard/hooks/useFinalImageDelete.ts` - Replaced `api.orders.deleteFinalImage()` with `useDeleteFinalImage()` mutation
- `frontend/dashboard/hooks/useOriginalImageDelete.ts` - Replaced `api.galleries.deleteImage()` with `useDeleteGalleryImage()` mutation
- `frontend/dashboard/hooks/useOrderAmountEdit.ts` - Replaced `api.orders.update()` with `useUpdateOrder()` mutation

### HOCs Refactored
- `frontend/dashboard/hocs/withZipDownload.tsx` - Replaced `api.orders.downloadZip()` and `api.orders.downloadFinalZip()` with mutation hooks

### Query Keys Updated
- `frontend/dashboard/lib/react-query.ts` - Added `deliveredOrders` query key for galleries

## Before/After Examples

### Example 1: Component with Direct API Call

**Before:**
```typescript
const loadExistingPackages = useCallback(async () => {
  try {
    const response = await api.packages.list();
    const packages = Array.isArray(response) ? response : (response.items ?? []);
    setExistingPackages(packages);
  } catch (_err) {
    setExistingPackages([]);
  }
}, []);
```

**After:**
```typescript
const { data: packagesData } = usePackages();
const existingPackages: Package[] = packagesData
  ? Array.isArray(packagesData)
    ? packagesData
    : packagesData.items ?? []
  : [];
```

### Example 2: Mutation with Cache Invalidation

**Before:**
```typescript
const handleSendLink = async (): Promise<void> => {
  try {
    const responseData = await api.galleries.sendToClient(galleryId as string);
    // Manual refetch needed
    await loadOrders();
  } catch (err) {
    showToast("error", "Błąd", formatApiError(err));
  }
};
```

**After:**
```typescript
const sendGalleryToClientMutation = useSendGalleryToClient();

const handleSendLink = async (): Promise<void> => {
  try {
    const responseData = await sendGalleryToClientMutation.mutateAsync(galleryId as string);
    // Cache automatically invalidated by mutation hook
    await loadOrders();
  } catch (err) {
    showToast("error", "Błąd", formatApiError(err));
  }
};
```

### Example 3: Complex Hook Refactoring

**Before (useUppyUpload.ts):**
```typescript
async function validateStorageLimits(
  galleryId: string,
  files: UppyFileType[],
  onValidationNeeded?: UseUppyUploadConfig["onValidationNeeded"]
): Promise<boolean> {
  try {
    const validationResult = await api.galleries.validateUploadLimits(galleryId);
    // ... validation logic
  } catch (error) {
    throw error;
  }
}
```

**After:**
```typescript
const validateUploadLimitsMutation = useValidateUploadLimits();

// In onBeforeUpload callback:
const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
const validationResult = await validateUploadLimitsMutation.mutateAsync(galleryId);
// ... validation logic
```

## New Query Keys

The following query keys were added to `frontend/dashboard/lib/react-query.ts`:

```typescript
galleries: {
  // ... existing keys
  deliveredOrders: (id: string) => [...queryKeys.galleries.detail(id), "delivered-orders"] as const,
}
```

## Known Remaining Direct API Calls

The following files contain direct API calls that are **intentionally kept** for valid reasons:

### 1. Query/Mutation Hooks Themselves
**Files:** All files in `hooks/queries/` and `hooks/mutations/`
**Reason:** Query and mutation hooks are the abstraction layer. They use `api` in their `queryFn` and `mutationFn`, which is the correct pattern.

### 2. Utility Files
**Files:**
- `frontend/dashboard/lib/uppy-config.ts` - Uses `api.uploads.getPresignedUrl()` for one-time presigned URL generation
- `frontend/dashboard/lib/calculate-plan.ts` - Uses `api.galleries.calculatePlan()` as a utility function

**Reason:** These are pure utility functions that may be called outside React components. They don't benefit from React Query's caching and lifecycle management.

### 3. Store Files (Zustand)
**Files:**
- `frontend/dashboard/store/orderSlice.ts` - Uses `api.orders.downloadZip()` and `api.orders.downloadFinalZip()`
- `frontend/dashboard/store/userSlice.ts` - Uses `api.wallet.getBalance()`

**Reason:** Zustand stores are not React components and cannot use React Query hooks directly. These store functions are called from components and could potentially be refactored in the future, but keeping them as-is is acceptable for state management utilities.

### 4. Service Worker/Mock Handlers
**Files:**
- `frontend/dashboard/pages/galleries/[id]/view.tsx` - Contains API calls in `apiFetch` callback passed to third-party component

**Reason:** The `ProcessedPhotosView` component from `@photocloud/gallery-components` expects an `apiFetch` function that directly calls the API. This is a special case for third-party component integration.

### 5. Presigned URL Operations
**Files:**
- `frontend/dashboard/components/galleries/sidebar/CoverPhotoUpload.tsx` - Uses `api.uploads.getPresignedUrl()`

**Reason:** Presigned URLs are time-sensitive, one-time use operations that don't benefit from React Query's caching. They're generated on-demand for immediate use.

## Migration Tips for Future Contributors

### 1. When to Use `useQuery`
- Use for GET requests that fetch data
- Use when you need automatic refetching, caching, and background updates
- Use when data is shared across multiple components

### 2. When to Use `useMutation`
- Use for POST/PUT/PATCH/DELETE requests
- Use when you need to update data on the server
- Always implement `onSuccess` with `queryClient.invalidateQueries()` to refresh related queries

### 3. Cache Invalidation Best Practices
```typescript
// Invalidate specific query
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });

// Invalidate all queries in a category
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });

// Invalidate multiple related queries
void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(galleryId, orderId) });
void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
```

### 4. Optimistic Updates
For better UX, implement optimistic updates in mutations:
```typescript
onMutate: async (newData) => {
  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
  
  // Snapshot previous value
  const previous = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));
  
  // Optimistically update
  queryClient.setQueryData(queryKeys.galleries.detail(galleryId), newData);
  
  return { previous };
},
onError: (err, newData, context) => {
  // Rollback on error
  queryClient.setQueryData(queryKeys.galleries.detail(galleryId), context?.previous);
},
```

### 5. Query Key Factory Pattern
Always use the query key factory from `lib/react-query.ts`:
```typescript
// ✅ Good
queryKey: queryKeys.galleries.detail(galleryId)

// ❌ Bad
queryKey: ["galleries", galleryId]
```

### 6. Dependent Queries
Use the `enabled` option for dependent queries:
```typescript
const { data: parent } = useQuery({ queryKey: ["parent", id] });
const { data: child } = useQuery({
  queryKey: ["child", parent?.id],
  queryFn: () => fetchChild(parent.id),
  enabled: !!parent?.id, // Only fetch when parent exists
});
```

### 7. Error Handling
Always handle errors in mutations:
```typescript
const mutation = useMutation({
  mutationFn: (data) => api.resource.create(data),
  onError: (error) => {
    showToast("error", "Błąd", formatApiError(error));
  },
});
```

## Verification

- ✅ TypeScript compilation: `tsc --noEmit` passes with 0 errors
- ✅ ESLint: `eslint . --ext .ts,.tsx` passes with 0 errors
- ✅ All components, pages, and hooks use React Query hooks instead of direct API calls
- ✅ Proper cache invalidation implemented after all mutations
- ✅ Type safety maintained throughout

## Next Steps

1. Evaluate if presigned URL operations could benefit from a custom hook pattern
2. Monitor cache performance and adjust `staleTime` and `gcTime` as needed
3. Consider implementing more optimistic updates for better UX

