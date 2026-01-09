# Navigation Performance Optimization

## Problem

When navigating between pages, there was a 1-2 second delay before the view switched. This was not a Next.js issue per se, but rather a combination of several factors:

## Root Causes Identified

1. **Scroll Restoration Delay**: Next.js by default restores scroll position during navigation, which can cause delays, especially on pages with heavy content.

2. **ClientOnly Component Delay**: The `ClientOnly` component was using `useEffect`, which runs after paint, causing a delay before children are rendered.

3. **Missing Scroll Optimization**: Router navigation calls didn't disable scroll restoration, causing Next.js to wait for layout calculations.

4. **Heavy Component Initialization**: Some pages have heavy initial renders with React Query hooks that block navigation.

## Solutions Implemented

### 1. Disabled Scroll Restoration During Navigation

**File**: `lib/navigation.ts`

- Added `scroll: false` to `navigateWithCleanup` and `replaceWithCleanup` functions
- This prevents Next.js from waiting for scroll position calculations during navigation
- Scroll is manually restored to top after navigation completes in `_app.tsx`

```typescript
return router.push(url, undefined, {
  scroll: false, // Disable scroll restoration for faster navigation
  ...options, // Allow override if needed
});
```

### 2. Optimized ClientOnly Component

**File**: `components/ClientOnly.tsx`

- Changed from `useEffect` to `useLayoutEffect` for synchronous rendering
- `useLayoutEffect` runs synchronously before paint, reducing delay before children render

```typescript
// Use useLayoutEffect for synchronous rendering before paint
// This reduces the delay before children are rendered
useLayoutEffect(() => {
  setHasMounted(true);
}, []);
```

### 3. Manual Scroll Restoration After Navigation

**File**: `pages/_app.tsx`

- Added scroll restoration after route change completes
- Uses `requestAnimationFrame` to ensure DOM is ready before scrolling

```typescript
const handleRouteChangeComplete = () => {
  restoreThemeAndClearSessionExpired();
  setNavigationLoading(false);
  // Restore scroll position after navigation completes
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
  });
};
```

## Expected Improvements

- **Navigation delay reduced from 1-2 seconds to < 200ms**
- **Faster initial render** due to `useLayoutEffect` optimization
- **Smoother page transitions** without scroll restoration blocking

## Additional Optimizations Implemented

### 1. Aggressive Route Prefetching

**File**: `components/layout/AppSidebar.tsx`

- **On Sidebar Mount/Expand**: Prefetches all navigation routes when sidebar becomes visible
- **On Link Hover**: Aggressively prefetches routes when user hovers over navigation links
- **Explicit Prefetch**: All Link components have `prefetch={true}` to ensure Next.js prefetches

This eliminates the first-visit delay by preloading JavaScript bundles before navigation.

### 2. Critical Routes Prefetching on App Mount

**File**: `pages/_app.tsx`

- Prefetches critical dashboard routes 1 second after app mount (for authenticated users)
- Preloads JavaScript bundles for: `/`, `/clients`, `/packages`, `/wallet`, `/settings`, `/galleries/robocze`
- Prevents first-visit delay for most commonly used pages

### How It Works

1. **First Visit**: Routes are prefetched on hover or after 1 second, so bundles are ready
2. **Subsequent Visits**: Bundles are cached by browser, so navigation is instant
3. **Hover Prefetching**: When user hovers over a link, the route is immediately prefetched

## Additional Recommendations

### For Further Optimization:

1. **Code Splitting**: Ensure heavy components are lazy-loaded:
   ```tsx
   const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
     loading: () => <Loading />,
   });
   ```

2. **React Query Optimization**: Use `staleTime` and `cacheTime` to reduce unnecessary refetches:
   ```typescript
   useQuery({
     queryKey: ['key'],
     queryFn: fetchData,
     staleTime: 5 * 60 * 1000, // 5 minutes
   });
   ```

3. **Monitor Navigation Performance**: Use Next.js Analytics or React DevTools Profiler to identify slow navigations.

4. **Bundle Analysis**: Use `@next/bundle-analyzer` to identify large bundles that could be code-split:
   ```bash
   npm install @next/bundle-analyzer
   ```

## Testing

After these changes, test navigation between:
- Dashboard pages (/, /clients, /packages, /wallet)
- Gallery pages (/galleries/[id], /galleries/[id]/photos)
- Filter pages (/galleries/robocze, /galleries/wyslano, etc.)

Navigation should feel instant (< 200ms) with smooth transitions.

