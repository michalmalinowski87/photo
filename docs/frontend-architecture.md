# Frontend Architecture

This document describes the frontend architecture, component structure, and authentication patterns used in PhotoHub.

## Overview

PhotoHub uses a composable component architecture with shared React components for gallery views. Both the photographer dashboard and client gallery applications use the same UI components, configured differently based on authentication mode.

## Architecture Principles

1. **Composition over Inheritance**: Small, reusable components that can be combined
2. **Single Responsibility**: Each component has a clear, focused purpose
3. **Authentication via HOCs**: Higher-Order Components handle authentication logic
4. **Shared Components**: Common UI elements shared between dashboard and gallery apps

## Component Structure

### Shared Components (`packages/gallery-components`)

Located in `packages/gallery-components/src/`, these components are used by both frontend applications:

#### `GalleryThumbnails.jsx`
- **Purpose**: Displays image grid with thumbnails
- **Props**:
  - `images` - Array of image objects with `key`, `previewUrl`, `thumbUrl`
  - `selectedKeys` - Set of selected image keys
  - `onToggle` - Function to toggle selection
  - `onDelete` - Function to delete photo (optional)
  - `onImageClick` - Function called when image clicked
  - `canSelect` - Boolean to enable/disable selection
  - `showDeleteButton` - Boolean to show delete button (owner mode)
- **Usage**: Used in both purchase view and owner view

#### `SelectionActions.jsx`
- **Purpose**: Displays selection status, pricing, and action buttons
- **Props**:
  - `galleryInfo` - Gallery metadata including approval status
  - `selectedCount` - Number of selected photos
  - `onApprove` - Function to approve selection
  - `onRequestChange` - Function to request changes
  - `canSelect` - Boolean to enable/disable selection
  - `canRequestChange` - Boolean to show request changes button
  - `saving` - Boolean indicating save in progress
  - `isPurchaseMore` - Boolean indicating purchase more mode
  - `includedCount` - Number of included photos in package
  - `extraPriceCents` - Price per extra photo in cents
  - `currentOverageCount` - Current overage count
  - `currentOverageCents` - Current overage cost in cents
  - `minSelectionRequired` - Minimum selection required
  - `meetsMinimumSelection` - Boolean indicating minimum met
- **Usage**: Used in client gallery purchase view

#### `ProcessedPhotosView.jsx`
- **Purpose**: Self-contained component for viewing processed photos and delivered orders
- **Props**:
  - `galleryId` - Gallery ID
  - `token` - Authentication token (Cognito or client JWT)
  - `apiUrl` - API base URL
  - `onImageClick` - Function called when image clicked (for modal)
  - `onFinalImagesChange` - Callback with final images array (for modal)
  - `apiFetch` - Custom fetch function (optional, uses fetch by default)
- **Features**:
  - Loads delivered orders automatically
  - Handles order selection (single vs multiple orders)
  - Loads final images for selected order
  - Provides ZIP download functionality
  - Shows empty state when no orders
- **Usage**: Used in both client gallery and owner view

#### `PurchaseView.jsx`
- **Purpose**: Combines `GalleryThumbnails` and `SelectionActions` for purchase flow
- **Props**: Combines props from both `GalleryThumbnails` and `SelectionActions`
- **Usage**: Used in client gallery purchase view

#### `ImageModal.jsx`
- **Purpose**: Full-screen image viewer with navigation
- **Props**:
  - `image` - Current image object
  - `images` - Array of all images
  - `index` - Current image index
  - `onClose` - Function to close modal
  - `onNavigate` - Function to navigate (prev/next)
  - `onToggle` - Function to toggle selection (optional)
  - `canSelect` - Boolean to enable selection in modal
  - `isProcessed` - Boolean indicating processed photo view
  - `selectedKeys` - Set of selected keys (for selection indicator)
- **Features**:
  - Keyboard navigation (Arrow keys, Escape)
  - Click outside to close
  - Image counter display
  - Selection indicator (heart icon)
  - Right-click save for processed photos
- **Usage**: Used in both client gallery and owner view

### Higher-Order Components (HOCs)

#### `withClientAuth.js` (Client Gallery)
- **Location**: `frontend/gallery/hocs/withClientAuth.js`
- **Purpose**: Handles client JWT authentication
- **Behavior**:
  - Checks localStorage for gallery token
  - Validates token and extracts `clientId` and `galleryId`
  - Redirects to login if token missing or invalid
  - Passes `token`, `clientId`, `galleryId`, `galleryName`, and `mode="client"` to wrapped component

#### `withOwnerAuth.js` (Dashboard)
- **Location**: `frontend/dashboard/hocs/withOwnerAuth.js`
- **Purpose**: Handles Cognito authentication for owner view
- **Behavior**:
  - Initializes Cognito auth
  - Gets Cognito ID token
  - Extracts `ownerId` from token `sub` claim
  - Redirects to login if not authenticated
  - Passes `token` (Cognito JWT), `ownerId`, `galleryId`, and `mode="owner"` to wrapped component

## Application Structure

### Client Gallery (`frontend/gallery`)

**Main Page**: `pages/gallery/[id].jsx`
- Wrapped with `withClientAuth` HOC
- Uses `PurchaseView` for purchase/selection flow
- Uses `ProcessedPhotosView` for processed photos
- Uses `ImageModal` for full-screen viewing
- Manages selection state, gallery info, and view mode

**Features**:
- Photo selection with real-time pricing
- Selection approval
- Change request functionality
- Processed photos viewing
- ZIP download

### Dashboard Owner View (`frontend/dashboard`)

**Owner Gallery Page**: `pages/galleries/[id]/view.jsx`
- Wrapped with `withOwnerAuth` HOC
- Uses `GalleryThumbnails` for image grid (read-only, with delete)
- Uses `ProcessedPhotosView` for processed photos
- Uses `ImageModal` for full-screen viewing
- Manages view mode toggle (Original Photos / Processed Photos)

**Features**:
- View gallery as client sees it
- View processed photos
- Delete photos manually
- No selection/approval capabilities
- No payment information display

## Authentication Flow

### Client Authentication
1. Client receives gallery link and password via email
2. Client navigates to `/gallery/login?id={galleryId}`
3. Enters password
4. Backend validates password and returns JWT token
5. Token stored in localStorage: `gallery_token_{galleryId}`
6. Token includes `galleryId` and `clientId` claims
7. Token sent in `Authorization: Bearer {token}` header for API calls

### Owner Authentication
1. Photographer logs in via Cognito Hosted UI
2. Cognito returns ID token
3. Token stored in Cognito session
4. Token sent in `Authorization: Bearer {token}` header for API calls
5. Backend validates token via API Gateway authorizer or manual validation

## API Integration

### Client Gallery API Client
- **Location**: `frontend/gallery/lib/api.js`
- Uses standard `fetch` API
- Adds `Authorization: Bearer {token}` header for authenticated requests
- Handles JSON parsing and error formatting

### Dashboard API Client
- **Location**: `frontend/dashboard/lib/api.js`
- Uses standard `fetch` API
- Provides `apiFetchWithAuth` helper that automatically adds Cognito token
- Handles JSON parsing and error formatting

## State Management

Both applications use React hooks for state management:
- `useState` for local component state
- `useEffect` for side effects (API calls, subscriptions)
- No global state management library (Redux, Zustand, etc.)

**Key State Patterns**:
- Selection state: `Set` of selected image keys
- Gallery info: Object with approval status, pricing, etc.
- View mode: `'purchase'` or `'processed'`
- Modal state: Current image index or `null`

## Styling

Components use inline styles (JavaScript objects) rather than CSS files:
- Consistent styling approach across components
- Easy to customize per component
- No CSS build step required
- Styles can be conditionally applied based on props

## Environment Variables

### Client Gallery
- `NEXT_PUBLIC_API_URL` - API base URL
- `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` - CloudFront domain for images

### Dashboard
- `NEXT_PUBLIC_API_URL` - API base URL
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID` - Cognito User Pool ID
- `NEXT_PUBLIC_COGNITO_CLIENT_ID` - Cognito Client ID
- `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` - CloudFront domain for images

## Development Workflow

1. **Shared Components**: Edit in `packages/gallery-components/src/`
2. **Client Gallery**: Edit in `frontend/gallery/`
3. **Dashboard**: Edit in `frontend/dashboard/`
4. **Build**: Components are imported via workspace linking (no build step needed in development)

## Future Enhancements

Potential improvements:
- TypeScript migration for type safety
- CSS-in-JS library (styled-components, emotion) for better styling
- State management library for complex state
- Unit tests for components
- Storybook for component documentation
- Performance optimizations (React.memo, useMemo, useCallback)

