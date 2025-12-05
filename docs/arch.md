# PhotoCloud Architecture

## Overview

PhotoCloud is a serverless SaaS platform for photographers to create secure private galleries with client selection and final delivery. Built on AWS using CDK v2 for infrastructure as code.

## Architecture Components

### Infrastructure (AWS CDK)

- **API Gateway HTTP API**: RESTful API endpoints with Cognito JWT authentication
- **Lambda Functions**: Serverless compute for all business logic
- **DynamoDB Tables**: 
  - `Galleries` - Gallery metadata and configuration (with TTL for UNPAID drafts)
  - `Orders` - Order tracking and billing (includes client selections)
  - `Wallets` - User wallet balances
  - `WalletLedger` - Transaction history
  - `Transactions` - Payment transactions (with GSI on galleryId-status)
  - `Clients` - Client records (with GSI on ownerId)
  - `Packages` - Pricing package templates (with GSI on ownerId)
  - `Notifications` - In-app notifications (planned)
- **S3 Bucket**: Storage for originals, previews, thumbnails, final assets, ZIPs, and archives
- **CloudFront**: CDN for serving previews and thumbnails
- **Cognito User Pool**: Authentication for photographers
- **SES**: Email notifications
- **EventBridge**: Scheduled tasks (expiry checks)

### Backend Functions

#### Gallery Management
- `galleries/create.ts` - Create new gallery as UNPAID draft with 3-day TTL
- `galleries/get.ts` - Get gallery details (includes payment status and effective state)
- `galleries/list.ts` - List user's galleries with status filtering (with GSI on ownerId)
- `galleries/pay.ts` - Pay for unpaid gallery (uses existing UNPAID transaction)
- `galleries/delete.ts` - Comprehensive GDPR deletion
- `galleries/setClientPassword.ts` - Set client access password
- `galleries/setSelectionMode.ts` - Enable/disable selection mode
- `galleries/updatePricingPackage.ts` - Update pricing configuration
- `galleries/sendGalleryToClient.ts` - Send gallery invitation to client

#### Selections
- `selections/approveSelection.ts` - Approve selection and create order (ZIPs generated on-demand, one-time use)
- `selections/getSelection.ts` - Get current selection
- `selections/changeRequest.ts` - Request selection changes

#### Orders
- `orders/list.ts` - List orders for a gallery
- `orders/get.ts` - Get order details
- `orders/listDelivered.ts` - List delivered orders (supports both owner and client access)
- `orders/listFinalImages.ts` - List final images for a specific order (supports both owner and client access)
- `orders/uploadFinal.ts` - Upload final processed photos for an order (owner-only)
  - Automatically sets order status to `PREPARING_DELIVERY` when first photo uploaded
- `orders/downloadZip.ts` - Get presigned download URL for order ZIP (generates on-demand, one-time use - deleted after download)
- `orders/downloadFinalZip.ts` - Download final ZIP for an order (supports both owner and client access)
- `orders/sendFinalLink.ts` - Send final delivery link to client
- `orders/approveChangeRequest.ts` - Approve client change requests (restores order to CLIENT_SELECTING)
- `orders/markPaid.ts` - Mark order as paid
- `orders/markPartiallyPaid.ts` - Mark order as partially paid (replaces markDepositPaid)
- `orders/markCanceled.ts` - Mark order as canceled
- `orders/markRefunded.ts` - Mark order as refunded

#### Uploads & Downloads
- `uploads/presign.ts` - Generate presigned S3 upload URLs
- `downloads/createZip.ts` - Create ZIP of selected photos

#### Image Processing
- Image resizing is now handled client-side via Uppy thumbnail generation plugin
- No server-side Lambda function needed

#### Processing
- `processed/complete.ts` - Mark order as delivered
- `orders/cleanupOriginals.ts` - Manually cleanup originals, previews, and thumbnails for selected photos (selection galleries only)

#### Payments
- `payments/checkout.ts` - Create Stripe checkout session
- `payments/webhook.ts` - Handle Stripe webhooks (removes TTL on payment success)
- `payments/cancel.ts` - Handle Stripe checkout cancellation

#### Clients Management
- `clients/create.ts` - Create new client
- `clients/list.ts` - List photographer's clients (with GSI on ownerId)
- `clients/get.ts` - Get client details
- `clients/update.ts` - Update client information
- `clients/delete.ts` - Delete client

#### Packages Management
- `packages/create.ts` - Create new pricing package
- `packages/list.ts` - List photographer's packages (with GSI on ownerId)
- `packages/get.ts` - Get package details
- `packages/update.ts` - Update package information
- `packages/delete.ts` - Delete package

#### Expiry
- `expiry/checkAndNotify.ts` - Scheduled check for expiring galleries (handles both UNPAID drafts with TTL and paid galleries with expiresAt)

### Frontend Applications

#### Dashboard (`frontend/dashboard`)
- Next.js application for photographers with Polish UI
- Cognito Hosted UI authentication
- **Main Navigation** (Left Sidebar):
  - Panel główny (Dashboard)
  - Galerie (collapsible with sub-items for status filters)
  - Klienci (Clients CRUD)
  - Pakiety (Packages CRUD)
  - Portfel (Wallet)
  - Ustawienia (Settings)
  - Wyloguj (Logout)
- **Dashboard Page** (`/`):
  - Statistics cards (delivered orders, client selecting, ready to ship, total revenue)
  - Active orders list (top 10)
  - Wallet balance with quick top-up buttons
- **Gallery Management**:
  - Multi-step gallery creation wizard (5 steps)
  - Gallery list with status filtering (6 filter pages)
  - Gallery detail page with sidebar and orders mini-control-panel
  - Order detail page with Oryginały/Finały tabs and ZIP download
- **Clients & Packages CRUD**: Full CRUD interfaces
- **Wallet Management**: Balance display, transaction history, top-up functionality
- **Settings**: Business info and password change forms
- Uses template components from `free-react-tailwind-admin-dashboard-main`
- No `alert()` or `window.confirm()` - uses template modals/toasts

#### Client Gallery (`frontend/gallery`)
- Next.js public-facing gallery
- Password-protected access
- Photo selection interface
- Order approval flow
- Processed photos viewing and download

#### Shared Components (`packages/gallery-components`)
- Reusable React components for gallery views:
  - `GalleryThumbnails` - Image grid with selection/delete capabilities
  - `SelectionActions` - Status, pricing, and action buttons
  - `ProcessedPhotosView` - Self-contained processed photos viewer
  - `PurchaseView` - Purchase/selection view combining thumbnails and actions
  - `ImageModal` - Full-screen image viewer with navigation
- Used by both dashboard (owner view) and client gallery
- Composable architecture with HOCs for authentication:
  - `withClientAuth` - Client JWT authentication
  - `withOwnerAuth` - Cognito authentication

## Data Flow

### Gallery Creation Flow
1. Photographer authenticates via Cognito
2. Clicks "+ Utwórz galerię" button in header
3. Completes 5-step wizard:
   - Step 1: Select gallery type (client selection or all photos)
   - Step 2: Enter gallery name
   - Step 3: Configure package (manual or select from saved packages)
   - Step 4: Select client (new or existing)
   - Step 5: Review summary and enter initial payment amount
4. Submits wizard → `POST /galleries`
5. Gallery created as UNPAID draft with 3-day TTL
6. No immediate payment - photographer can pay later via "Opłać galerię" button
7. Sets client password and pricing package (if provided in wizard)
8. Uploads originals via presigned URLs
9. System generates previews/thumbnails automatically

### Client Selection Flow
1. Client accesses gallery with password
2. Views previews via CloudFront
3. Selects photos (stored in memory on frontend)
4. Selects photos (pricing based on package configuration)
5. Approves selection via `POST /galleries/{id}/selections/approve`
6. System creates order (with CLIENT_APPROVED status)
7. ZIP can be generated on-demand when photographer or client requests download (one-time use)
9. Client can request changes (changes order to CHANGES_REQUESTED status)
10. Photographer approves change request (restores order to CLIENT_SELECTING status)
11. Photographer processes and marks delivered (changes order to DELIVERED status)
12. **ZIP handling on delivery**:
    - ZIPs are one-time use: deleted after first download (if generated)

### GDPR Deletion Flow
1. Photographer requests deletion via `DELETE /galleries/{id}`
2. System deletes all S3 objects (originals, previews, thumbs, final, zips, archive)
3. System deletes all DynamoDB records (orders)
4. System deletes gallery record
5. Returns deletion summary

## Security

- **Authentication**: 
  - Cognito JWT for photographer endpoints (via API Gateway authorizer or Authorization header)
  - Client JWT tokens for client gallery access (password-based, PBKDF2 with salt/iterations)
- **Authorization**: 
  - Unified `verifyGalleryAccess` helper supports both authentication types
  - Owner-only access enforced via `requireOwnerOr403` for write operations
  - Returns access type (`isOwner`, `isClient`) for conditional logic
- **Client Access**: Password-based authentication scoped to specific gallery
- **S3**: Private bucket with CloudFront OAI for previews
- **CORS**: Configurable origins via CDK context/environment

## Storage Layout

```
galleries/{galleryId}/
  originals/          # Original uploaded photos
  previews/           # 1200px previews (CloudFront)
  thumbs/             # 200px thumbnails (CloudFront)
  final/              # Processed final photos
  zips/               # Generated ZIP files
  archive/            # Long-term archive ZIPs (Glacier)
```

## Environment Variables

- `STAGE` - Deployment stage (dev/prod)
- `GALLERIES_BUCKET` - S3 bucket name
- `COGNITO_USER_POOL_ID` - Cognito User Pool ID
- `COGNITO_USER_POOL_CLIENT_ID` - Cognito Client ID
- `COGNITO_DOMAIN` - Cognito Hosted UI domain
- `CLOUDFRONT_DOMAIN` - CloudFront distribution domain
- `SENDER_EMAIL` - SES sender email
- `PHOTOGRAPHER_NOTIFY_EMAIL` - Notification email
- Table names for all DynamoDB tables

## Deployment

Infrastructure is deployed via AWS CDK:

```bash
cd infra
yarn build
yarn deploy --context stage=dev
```

Frontend apps are deployed separately (Vercel, CloudFront, etc.) with environment variables pointing to the API.

