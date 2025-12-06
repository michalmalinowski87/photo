# React Query (TanStack Query) Guide for Beginners

## Table of Contents

1. [What is React Query?](#what-is-react-query)
2. [Core Concepts](#core-concepts)
3. [Query Keys](#query-keys)
4. [Best Practices](#best-practices)
5. [Common Patterns](#common-patterns)
6. [Migration Guide from Zustand](#migration-guide-from-zustand)
7. [Examples from Our Codebase](#examples-from-our-codebase)
8. [Troubleshooting](#troubleshooting)

---

## What is React Query?

React Query (now called TanStack Query) is a powerful data-fetching library for React that makes fetching, caching, synchronizing, and updating server state in your React applications much easier.

### Why Use React Query?

**Before React Query (Manual State Management):**
- You manually manage loading states (`isLoading`, `error`)
- You manually cache data (store in Zustand/Redux)
- You manually refetch data when needed
- You manually handle race conditions
- You manually invalidate stale data

**With React Query:**
- Automatic loading states (`isLoading`, `isError`, `isSuccess`)
- Automatic caching and deduplication
- Automatic background refetching
- Automatic race condition handling
- Automatic cache invalidation

### Key Benefits

1. **Less Code**: No need for `useState`, `useEffect`, and manual loading/error states
2. **Better UX**: Automatic background updates, stale-while-revalidate pattern
3. **Fewer Bugs**: Automatic cache invalidation prevents stale data issues
4. **Better Performance**: Request deduplication, intelligent caching

---

## Core Concepts

### 1. Queries

**Queries** are for fetching data. They are read-only operations.

```typescript
import { useQuery } from '@tanstack/react-query';

function GalleryList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['galleries'],
    queryFn: () => api.galleries.list(),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data?.map(gallery => <div key={gallery.id}>{gallery.name}</div>)}</div>;
}
```

**Query States:**
- `isLoading`: First fetch in progress (no cached data)
- `isFetching`: Any fetch in progress (including background refetches)
- `isError`: Query failed
- `isSuccess`: Query succeeded
- `data`: The fetched data
- `error`: Error object if query failed

### 2. Mutations

**Mutations** are for creating, updating, or deleting data. They are write operations.

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function DeleteGalleryButton({ galleryId }: { galleryId: string }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.galleries.delete(galleryId),
    onSuccess: () => {
      // Invalidate and refetch galleries list
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
    },
  });

  return (
    <button
      onClick={() => deleteMutation.mutate()}
      disabled={deleteMutation.isPending}
    >
      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}
```

**Mutation States:**
- `isPending`: Mutation is in progress
- `isError`: Mutation failed
- `isSuccess`: Mutation succeeded
- `mutate`: Function to trigger the mutation
- `mutateAsync`: Async version that returns a promise

### 3. Cache

React Query automatically caches your data. The cache is organized by **query keys**.

**Cache Lifecycle:**
1. **Fresh**: Data is considered fresh (no refetch needed)
2. **Stale**: Data is stale (will refetch in background)
3. **Inactive**: No components are using this data
4. **Garbage Collected**: Removed from cache after `gcTime` (default: 5 minutes)

**Configuration:**
- `staleTime`: How long data is considered fresh (default: 0)
- `gcTime`: How long inactive data stays in cache (default: 5 minutes)

### 4. Invalidation

**Invalidation** marks queries as stale, triggering a refetch.

```typescript
// Invalidate all gallery queries
queryClient.invalidateQueries({ queryKey: ['galleries'] });

// Invalidate specific gallery
queryClient.invalidateQueries({ queryKey: ['galleries', galleryId] });

// Remove from cache entirely
queryClient.removeQueries({ queryKey: ['galleries', galleryId] });
```

---

## Query Keys

Query keys are arrays that uniquely identify queries in the cache. They should be **hierarchical** and **type-safe**.

### Why Query Keys Matter

1. **Cache Organization**: React Query uses keys to organize cached data
2. **Invalidation**: You can invalidate related queries using partial keys
3. **Type Safety**: TypeScript can infer types from keys

### Query Key Factory Pattern (Best Practice)

```typescript
// lib/react-query.ts
export const queryKeys = {
  galleries: {
    all: ['galleries'] as const,
    lists: () => [...queryKeys.galleries.all, 'list'] as const,
    list: (filter?: string) => [...queryKeys.galleries.lists(), filter] as const,
    details: () => [...queryKeys.galleries.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.galleries.details(), id] as const,
  },
};

// Usage
useQuery({
  queryKey: queryKeys.galleries.list('unpaid'), // ['galleries', 'list', 'unpaid']
  queryFn: () => api.galleries.list('unpaid'),
});

// Invalidation
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() }); // Invalidates all lists
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) }); // Invalidates specific gallery
```

### Hierarchical Structure Benefits

```typescript
// Invalidating 'galleries' invalidates ALL gallery queries
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.all });

// Invalidating 'lists' invalidates all list queries
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });

// Invalidating specific gallery invalidates that gallery and its sub-queries
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
```

---

## Best Practices

### 1. When to Use Queries vs Mutations

**Use Queries for:**
- Fetching data (GET requests)
- Reading data
- Any operation that doesn't change server state

**Use Mutations for:**
- Creating data (POST)
- Updating data (PUT, PATCH)
- Deleting data (DELETE)
- Any operation that changes server state

### 2. Stale Time Configuration

```typescript
// Data that changes frequently (wallet balance)
useQuery({
  queryKey: ['wallet', 'balance'],
  queryFn: () => api.wallet.getBalance(),
  staleTime: 10 * 1000, // 10 seconds
});

// Data that changes rarely (gallery list)
useQuery({
  queryKey: ['galleries'],
  queryFn: () => api.galleries.list(),
  staleTime: 30 * 1000, // 30 seconds
});
```

### 3. Enabled Option

Use `enabled` to conditionally fetch data:

```typescript
const { data: gallery } = useGallery(galleryId, {
  enabled: !!galleryId, // Only fetch if galleryId exists
});
```

### 4. Invalidation Strategy

**Always invalidate related queries after mutations:**

```typescript
const updateGallery = useMutation({
  mutationFn: ({ id, data }) => api.galleries.update(id, data),
  onSuccess: (_, variables) => {
    // Invalidate specific gallery
    queryClient.invalidateQueries({ queryKey: ['galleries', variables.id] });
    // Invalidate gallery lists
    queryClient.invalidateQueries({ queryKey: ['galleries', 'list'] });
  },
});
```

### 5. Error Handling

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['galleries'],
  queryFn: () => api.galleries.list(),
  retry: 1, // Retry once on failure
  retryDelay: 1000, // Wait 1 second before retry
});

if (isError) {
  return <div>Error: {error.message}</div>;
}
```

---

## Common Patterns

### 1. Loading States

```typescript
function GalleryList() {
  const { data: galleries, isLoading } = useGalleries();

  if (isLoading) {
    return <FullPageLoading text="Ładowanie galerii..." />;
  }

  return <div>{/* render galleries */}</div>;
}
```

### 2. Error States

```typescript
function GalleryList() {
  const { data: galleries, isLoading, error, isError } = useGalleries();

  if (isLoading) return <Loading />;
  if (isError) return <Error message={error.message} />;

  return <div>{/* render galleries */}</div>;
}
```

### 3. Optimistic Updates

```typescript
const updateGallery = useMutation({
  mutationFn: ({ id, data }) => api.galleries.update(id, data),
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['galleries', variables.id] });

    // Snapshot previous value
    const previousGallery = queryClient.getQueryData(['galleries', variables.id]);

    // Optimistically update
    queryClient.setQueryData(['galleries', variables.id], (old) => ({
      ...old,
      ...variables.data,
    }));

    return { previousGallery };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['galleries', variables.id], context.previousGallery);
  },
  onSettled: (_, __, variables) => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['galleries', variables.id] });
  },
});
```

### 4. Dependent Queries

```typescript
const { data: gallery } = useGallery(galleryId);
const { data: orders } = useOrders(galleryId, {
  enabled: !!gallery, // Only fetch orders if gallery exists
});
```

### 5. Polling

```typescript
const { data: gallery } = useQuery({
  queryKey: ['galleries', galleryId],
  queryFn: () => api.galleries.get(galleryId),
  refetchInterval: 5000, // Poll every 5 seconds
  refetchIntervalInBackground: false, // Don't poll when tab is inactive
});
```

---

## Migration Guide from Zustand

### Before (Zustand)

```typescript
function GalleryList() {
  const galleries = useGalleryStore(state => state.galleryList);
  const isLoading = useGalleryStore(state => state.isLoading);
  const fetchGalleries = useGalleryStore(state => state.fetchGalleries);

  useEffect(() => {
    fetchGalleries();
  }, [fetchGalleries]);

  if (isLoading) return <Loading />;
  return <div>{galleries.map(...)}</div>;
}
```

### After (React Query)

```typescript
function GalleryList() {
  const { data: galleries, isLoading } = useGalleries();

  if (isLoading) return <Loading />;
  return <div>{galleries?.map(...)}</div>;
}
```

### Key Changes

1. **Remove `useState` for data**: React Query manages data
2. **Remove `useEffect` for fetching**: React Query fetches automatically
3. **Remove manual loading states**: Use `isLoading` from React Query
4. **Remove manual error handling**: Use `error` and `isError` from React Query
5. **Remove manual cache management**: React Query handles caching

### Mutation Migration

**Before:**
```typescript
const deleteGallery = async (id: string) => {
  setLoading(true);
  try {
    await api.galleries.delete(id);
    await fetchGalleries(); // Manual refetch
  } finally {
    setLoading(false);
  }
};
```

**After:**
```typescript
const deleteGallery = useDeleteGallery(); // Mutation hook with automatic invalidation

// Usage
deleteGallery.mutate(galleryId);
```

---

## Examples from Our Codebase

### Example 1: Gallery List Query

```typescript
// hooks/queries/useGalleries.ts
export function useGalleries(filter?: string) {
  return useQuery({
    queryKey: queryKeys.galleries.list(filter),
    queryFn: async () => {
      const response = await api.galleries.list(filter);
      return Array.isArray(response) ? response : response.items || [];
    },
    staleTime: 30 * 1000,
  });
}

// Usage in component
function GalleryList({ filter }: { filter?: string }) {
  const { data: galleries, isLoading, error } = useGalleries(filter);

  if (isLoading) return <FullPageLoading />;
  if (error) return <Error message={error.message} />;

  return <div>{galleries?.map(...)}</div>;
}
```

### Example 2: Gallery Mutation with Invalidation

```typescript
// hooks/mutations/useGalleryMutations.ts
export function useDeleteGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.delete(galleryId),
    onSuccess: (_, galleryId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

// Usage in component
function DeleteButton({ galleryId }: { galleryId: string }) {
  const deleteGallery = useDeleteGallery();

  return (
    <button
      onClick={() => deleteGallery.mutate(galleryId)}
      disabled={deleteGallery.isPending}
    >
      {deleteGallery.isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}
```

### Example 3: Conditional Query

```typescript
// hooks/queries/useGalleries.ts
export function useGallery(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.detail(galleryId!),
    queryFn: () => api.galleries.get(galleryId!),
    enabled: !!galleryId, // Only fetch if galleryId exists
    staleTime: 30 * 1000,
  });
}

// Usage
function GalleryDetail({ galleryId }: { galleryId?: string }) {
  const { data: gallery, isLoading } = useGallery(galleryId);

  if (!galleryId) return <div>No gallery ID</div>;
  if (isLoading) return <Loading />;

  return <div>{gallery?.name}</div>;
}
```

---

## Troubleshooting

### Problem: Data not updating after mutation

**Solution:** Make sure you're invalidating the correct query keys:

```typescript
// ❌ Wrong - doesn't invalidate anything
queryClient.invalidateQueries({ queryKey: ['galleries'] });

// ✅ Correct - invalidates all gallery queries
queryClient.invalidateQueries({ queryKey: queryKeys.galleries.all });
```

### Problem: Query refetches too often

**Solution:** Increase `staleTime`:

```typescript
useQuery({
  queryKey: ['galleries'],
  queryFn: () => api.galleries.list(),
  staleTime: 60 * 1000, // Data is fresh for 60 seconds
});
```

### Problem: Query doesn't refetch when it should

**Solution:** Check `staleTime` and `refetchOnWindowFocus`:

```typescript
useQuery({
  queryKey: ['galleries'],
  queryFn: () => api.galleries.list(),
  staleTime: 0, // Data is immediately stale
  refetchOnWindowFocus: true, // Refetch when window regains focus
});
```

### Problem: Multiple requests for same data

**Solution:** React Query automatically deduplicates requests with the same query key. Make sure query keys are consistent:

```typescript
// ❌ Wrong - different keys = duplicate requests
useQuery({ queryKey: ['galleries', filter] });
useQuery({ queryKey: ['galleries', filter?.toLowerCase()] });

// ✅ Correct - same key = deduplicated
useQuery({ queryKey: queryKeys.galleries.list(filter) });
```

### Problem: Query runs when it shouldn't

**Solution:** Use `enabled` option:

```typescript
useQuery({
  queryKey: ['gallery', galleryId],
  queryFn: () => api.galleries.get(galleryId),
  enabled: !!galleryId && !isEditing, // Only fetch when conditions are met
});
```

### Problem: Cache not clearing on logout

**Solution:** Clear all queries on logout:

```typescript
function handleLogout() {
  queryClient.clear(); // Clears all cached data
  // ... rest of logout logic
}
```

---

## Additional Resources

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [React Query Devtools](https://tanstack.com/query/latest/docs/react/devtools)
- [Query Key Factory Pattern](https://tkdodo.eu/blog/effective-react-query-keys)

---

## Summary

React Query simplifies data fetching by:
1. **Automatic state management**: No need for `useState` and `useEffect`
2. **Intelligent caching**: Automatic cache management and deduplication
3. **Background updates**: Automatic refetching of stale data
4. **Cache invalidation**: Easy invalidation of related queries
5. **Better UX**: Loading states, error handling, and optimistic updates

The key to success with React Query is:
- Use **query keys** consistently and hierarchically
- **Invalidate** related queries after mutations
- Configure **staleTime** appropriately for your data
- Use **enabled** for conditional queries
- Let React Query handle the complexity!

