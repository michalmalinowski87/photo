# PhotoHub User Flows

This document describes the main user flows for photographers and clients using PhotoHub.

## Table of Contents

1. [Photographer Onboarding & Wallet Management](#1-photographer-onboarding--wallet-management)
2. [Gallery Creation & Setup](#2-gallery-creation--setup)
3. [Image Upload & Processing](#3-image-upload--processing)
4. [Client Selection Workflow](#4-client-selection-workflow)
5. [Order Processing & Delivery](#5-order-processing--delivery)
6. [Purchase More Flow](#6-purchase-more-flow)
7. [Gallery Management](#7-gallery-management)
8. [Order Status Lifecycle](#order-status-lifecycle)
9. [Payment Status](#payment-status)

---

## 1. Photographer Onboarding & Wallet Management

### Flow Overview
Photographers authenticate, manage their wallet balance, and view transaction history.

### Detailed Steps

1. **Authentication**
   - Photographer navigates to dashboard
   - Signs up/logs in via Cognito Hosted UI
   - Receives JWT token for authenticated API calls

2. **Wallet Top-Up**
   - Navigate to wallet page in dashboard
   - Enter amount (minimum 100 PLN / 10000 cents)
   - Click "Top Up" button
   - System creates Stripe checkout session via `POST /payments/checkout`
   - Redirects to Stripe checkout page
   - Complete payment with credit card
   - Stripe webhook processes payment:
     - Credits wallet balance
     - Creates ledger entry in `WalletLedger` table
     - Records payment in `Payments` table
   - Redirects back to wallet page with success confirmation

3. **View Balance & Transactions**
   - Wallet page displays current balance
   - Transaction history shows:
     - Top-ups (CREDIT)
     - Gallery creation debits (DEBIT)
     - Timestamps and amounts

### Key Endpoints
- `POST /payments/checkout` - Create Stripe checkout session for wallet top-up
- `GET /wallet/balance` - Get current wallet balance
- `GET /wallet/transactions` - List transaction history

### Data Flow
```
Dashboard → POST /payments/checkout → Stripe Checkout → Payment → Webhook → Wallet Credit
```

---

## 2. Gallery Creation & Setup

### Flow Overview
Photographers create galleries, configure pricing, and send invitations to clients.

### Detailed Steps

1. **Create Gallery**
   - Navigate to galleries page
   - Click "Create Gallery"
   - Fill in form:
     - Gallery name (optional)
     - Pricing plan: Small (50 PLN), Medium (100 PLN), or Large (200 PLN)
     - Client pricing package:
       - Package name
       - Included photo count
       - Extra price per photo (in cents)
     - Enable/disable selection mode
     - Optionally set client email and password
   - Submit form → `POST /galleries`

2. **Payment Processing**
   - System attempts wallet debit first:
     - Checks wallet balance
     - If sufficient: debits wallet, creates gallery with `PAID_ACTIVE` state
     - Creates ledger entry for debit
   - If insufficient balance:
     - Creates Stripe checkout session (if Stripe configured)
     - Gallery created with `DRAFT` state
     - Returns checkout URL to photographer
   - Photographer completes Stripe payment
   - Webhook processes payment:
     - Marks gallery as `PAID_ACTIVE`
     - Updates gallery state in DynamoDB

3. **Configure Gallery Settings**
   - Set client password: `POST /galleries/{id}/client-password`
   - Update pricing package: `POST /galleries/{id}/pricing-package`
   - Enable/disable selection mode: `POST /galleries/{id}/selection-mode`

4. **Send Gallery to Client**
   - Click "Send Gallery" button
   - System sends invitation email via `POST /galleries/{id}/send`:
     - Email includes gallery link
     - Includes password (if set)
     - Client can access gallery immediately

### Key Endpoints
- `POST /galleries` - Create new gallery
- `POST /galleries/{id}/client-password` - Set client access password
- `POST /galleries/{id}/pricing-package` - Update pricing configuration
- `POST /galleries/{id}/selection-mode` - Enable/disable selection mode
- `POST /galleries/{id}/send` - Send gallery invitation to client

### Gallery States
- `DRAFT` - Created but payment pending
- `PAID_ACTIVE` - Payment received, gallery active

### Selection Status
- `DISABLED` - Selection mode disabled
- `NOT_STARTED` - Selection enabled, client hasn't started
- `IN_PROGRESS` - Client is selecting photos
- `APPROVED` - Client approved selection, order created

---

## 3. Image Upload & Processing

### Flow Overview
Photographers upload original photos, system automatically generates previews and thumbnails.

### Detailed Steps

1. **Get Presigned Upload URLs**
   - Photographer selects images to upload
   - Dashboard calls `POST /uploads/presign` for each image
   - System validates:
     - Photographer is authenticated
     - Photographer owns the gallery (`requireOwnerOr403`)
   - Returns presigned S3 URL with PUT permission
   - URL expires after configured time (typically 15 minutes)

2. **Upload Originals**
   - Dashboard uploads each image directly to S3 using presigned URL
   - Images stored in: `galleries/{galleryId}/originals/{filename}`
   - Upload progress tracked in frontend

3. **Automatic Processing**
   - S3 upload triggers Lambda function (`onUploadResize`)
   - Lambda processes each image:
     - Generates 1200px preview → `galleries/{galleryId}/previews/{filename}`
     - Generates 200px thumbnail → `galleries/{galleryId}/thumbs/{filename}`
     - Uses Sharp library for resizing
   - Previews and thumbnails served via CloudFront CDN
   - Processing happens asynchronously (no blocking)

4. **View Uploaded Images**
   - Photographer can view gallery images via `GET /galleries/{id}/images`
   - Returns list with CloudFront URLs for previews and thumbnails
   - Images appear in gallery view immediately after upload

### Key Endpoints
- `POST /uploads/presign` - Generate presigned S3 upload URL
- `GET /galleries/{id}/images` - List all images with CloudFront URLs

### Storage Structure
```
galleries/{galleryId}/
  ├── originals/     # Original uploaded photos (private)
  ├── previews/      # 1200px previews (CloudFront CDN)
  └── thumbs/        # 200px thumbnails (CloudFront CDN)
```

---

## 4. Client Selection Workflow

### Flow Overview
Clients access password-protected galleries, browse photos, select favorites, and approve selections.

### Detailed Steps

1. **Client Access**
   - Client receives email invitation with:
     - Gallery link: `https://gallery-domain/gallery/{galleryId}`
     - Password (if set by photographer)
   - Client navigates to gallery login page
   - Enters gallery ID and password
   - System validates password (PBKDF2 hash verification)
   - Returns JWT token scoped to:
     - `galleryId` - Specific gallery
     - `clientId` - Unique client identifier
   - Token stored in localStorage for session persistence

2. **Browse Gallery**
   - Client views gallery page with:
     - Thumbnail grid view
     - Full-screen modal view (click thumbnail)
     - Keyboard navigation (arrow keys, Escape)
     - Gallery name and metadata
   - Images loaded from CloudFront CDN (fast delivery)
   - Selection count displayed in real-time

3. **Select Photos**
   - Client clicks thumbnails to toggle selection
   - Selections stored in memory (not auto-saved)
   - UI shows:
     - Selected count
     - Included count (from pricing package)
     - Overage count (selected - included)
     - Total price calculation
   - Pricing display:
     - If first selection: uses package pricing (included + overage)
     - If "purchase more": all photos charged at extra price

4. **Approve Selection**
   - Client clicks "Approve Selection" button
   - Frontend sends selection to `POST /galleries/{id}/selections/approve`
   - System validates:
     - JWT token matches gallery
     - Selection contains at least one photo
     - No existing `CLIENT_APPROVED` order
   - Creates order:
     - Order ID: `{orderNumber}-{timestamp}`
     - Status: `CLIENT_APPROVED`
     - Payment status: `UNPAID`
     - Stores selected keys, counts, pricing
   - Generates ZIP file:
     - Lambda function creates ZIP of selected originals
     - Stores in `galleries/{galleryId}/zips/{orderId}.zip`
     - Updates order with ZIP key
   - Updates gallery:
     - Selection status: `APPROVED`
     - Stores selection stats
     - Sets current order ID
   - Sends notification email to photographer
   - Returns success response to client

5. **Request Changes (Optional)**
   - If client wants to modify selection:
     - Click "Request Changes" button
     - Calls `POST /galleries/{id}/selections/change-request`
     - System validates:
       - Order exists with `CLIENT_APPROVED` status
       - No existing `CHANGES_REQUESTED` order
     - Updates order status to `CHANGES_REQUESTED`
     - Sends notification email to photographer
     - Photographer can approve change request (restores to `CLIENT_SELECTING`)

### Key Endpoints
- `POST /gallery/login` - Client authentication (password-based)
- `GET /galleries/{id}/images` - List gallery images (requires JWT)
- `GET /galleries/{id}/selections/{clientId}` - Get current selection state
- `POST /galleries/{id}/selections/approve` - Approve selection and create order
- `POST /galleries/{id}/selections/change-request` - Request selection changes

### Selection States
- No selection - Client hasn't selected yet
- In progress - Client selecting photos (stored in memory)
- Approved - Selection approved, order created
- Changes requested - Client requested changes, waiting for photographer approval

---

## 5. Order Processing & Delivery

### Flow Overview
Photographers review orders, process photos, and deliver final products to clients.

### Detailed Steps

1. **Photographer Reviews Order**
   - Navigate to orders page in dashboard
   - View order list for gallery
   - See order details:
     - Order number and ID
     - Delivery status: `CLIENT_APPROVED`
     - Payment status: `UNPAID`
     - Selected photo count
     - Overage count and pricing
     - ZIP download available

2. **Approve Change Request (If Applicable)**
   - If order status is `CHANGES_REQUESTED`:
     - Click "Approve Change Request" button
     - Calls `POST /galleries/{id}/orders/{orderId}/change-request/approve`
     - System updates order status to `CLIENT_SELECTING`
     - Client can now modify selection
     - Order restored to selection state

3. **Process Photos**
   - Photographer processes selected photos in editing software
   - Upload final processed photos:
     - Click "Upload Final Photos" button
     - Select processed image files
     - Calls `POST /galleries/{id}/orders/{orderId}/final/upload`
     - System uploads to `galleries/{galleryId}/final/{orderId}/{filename}`
     - Photos stored in original, unprocessed format
     - **First photo upload**: Order status automatically changes from `CLIENT_APPROVED` to `PREPARING_DELIVERY`
     - Subsequent uploads: Order remains `PREPARING_DELIVERY` status
   - Client can view photos in `PREPARING_DELIVERY` status (before final delivery)

4. **Mark Payment Status**
   - Update payment status as needed:
     - `POST /galleries/{id}/orders/{orderId}/paid` - Mark as fully paid
     - `POST /galleries/{id}/orders/{orderId}/deposit-paid` - Mark deposit paid
     - `POST /galleries/{id}/orders/{orderId}/canceled` - Cancel order
     - `POST /galleries/{id}/orders/{orderId}/refunded` - Mark as refunded

5. **Send Final Delivery**
   - Once photos processed and payment confirmed:
     - Click "Send Final Link" button
     - Calls `POST /galleries/{id}/orders/{orderId}/final/send`
     - System:
       - Sends email to client with gallery link
       - Marks order as `DELIVERED`
       - Sets `deliveredAt` timestamp
       - Cleans up storage:
         - Deletes originals for selected photos
         - Deletes previews for selected photos
         - Deletes thumbnails for selected photos
         - Keeps final photos and ZIPs
   - Client receives email notification

6. **Client Downloads Final Photos**
   - Client accesses gallery (using same login)
   - Switches to "Processed Photos" view tab
   - Views delivered orders (includes `PREPARING_DELIVERY` and `DELIVERED` orders):
     - Calls `GET /galleries/{id}/orders/delivered`
     - Sees list of orders (including those being prepared)
   - Selects specific order to view:
     - Calls `GET /galleries/{id}/orders/{orderId}/final/images`
     - Views final processed photos (available in both `PREPARING_DELIVERY` and `DELIVERED` status)
   - Downloads final ZIP:
     - Click "Download Final ZIP" button
     - Calls `POST /galleries/{id}/orders/{orderId}/final/zip`
     - System generates ZIP file on-the-fly (base64 encoded)
     - ZIP contains final processed photos
     - Download starts immediately
   
   **Owner View**: Photographers can also view processed photos:
   - Navigate to gallery → "View as Owner" button
   - Switches to owner gallery view (read-only mode)
   - Can view processed photos same as clients
   - Can view original photos and delete them
   - Uses Cognito authentication (no client password needed)

### Key Endpoints
- `GET /galleries/{id}/orders` - List all orders for gallery (photographer)
- `POST /galleries/{id}/orders/{orderId}/change-request/approve` - Approve change request
- `POST /galleries/{id}/orders/{orderId}/final/upload` - Upload final processed photos
- `POST /galleries/{id}/orders/{orderId}/final/send` - Send final link and mark delivered
- `GET /galleries/{id}/orders/delivered` - List delivered orders (client)
- `GET /galleries/{id}/orders/{orderId}/final/images` - List final images for order
- `POST /galleries/{id}/orders/{orderId}/final/zip` - Get presigned download URL for final ZIP

### Order Status Flow
```
CLIENT_SELECTING → CLIENT_APPROVED → PREPARING_DELIVERY → DELIVERED
                    ↓                      ↑
              CHANGES_REQUESTED → CLIENT_SELECTING (if approved)
                    ↓
              CLIENT_APPROVED → PREPARING_DELIVERY → DELIVERED
```

**Status Descriptions**:
- **CLIENT_SELECTING**: Client is actively selecting photos
- **CLIENT_APPROVED**: Client approved selection, order created, ZIP generated
- **CHANGES_REQUESTED**: Client requested changes, photographer can approve to restore to CLIENT_SELECTING
- **PREPARING_DELIVERY**: Photographer has started uploading final photos (first photo triggers this status). **Selection is locked** (same as CLIENT_APPROVED) because photographer has done the work, but client can still request changes.
- **DELIVERED**: Order delivered, final link sent, originals cleaned up

---

## 6. Purchase More Flow

### Flow Overview
After receiving delivered order, clients can purchase additional photos from the same gallery.

### Detailed Steps

1. **Client Views Gallery After Delivery**
   - Client accesses gallery (same login)
   - Sees "Purchase More" option available
   - System detects:
     - Has `DELIVERED` order
     - No active `CLIENT_APPROVED`, `PREPARING_DELIVERY`, or `CHANGES_REQUESTED` orders

2. **Select Additional Photos**
   - Client browses gallery in "Purchase" view
   - Selects additional photos
   - Pricing calculation:
     - All selected photos charged at extra price
     - No included count (first-time selection benefit doesn't apply)
     - Total = selected count × extra price per photo

3. **Approve New Selection**
   - Client clicks "Approve Selection"
   - System creates new order:
     - New order number (incremented)
     - Status: `CLIENT_APPROVED`
     - Payment status: `UNPAID`
     - Pricing reflects "purchase more" (no included count)
   - Generates ZIP of selected photos
   - Sends notification to photographer
   - Same processing workflow applies

### Key Differences from First Selection
- No included photo count
- All photos charged at extra price
- Creates new order (not updating existing)
- Order number increments

---

## 7. Gallery Management

### Flow Overview
Photographers manage their galleries: view, update settings, and delete galleries.

### Detailed Steps

1. **List Galleries**
   - Navigate to galleries page
   - Calls `GET /galleries`
   - System queries DynamoDB GSI on `ownerId`
   - Returns list sorted by creation date
   - Displays:
     - Gallery name/ID
     - Creation date
     - Status (PAID_ACTIVE, DRAFT)
     - Selection status
     - Order counts

2. **View Gallery Details**
   - Click on gallery to view details
   - Calls `GET /galleries/{id}`
   - System validates ownership (`requireOwnerOr403`)
   - Returns gallery metadata:
     - Gallery name, ID, owner
     - Pricing package configuration
     - Client email (if set)
     - Selection status
     - Order history
     - Image counts
     - Creation/update timestamps

3. **Update Gallery Settings**
   - Update client password: `POST /galleries/{id}/client-password`
   - Update pricing package: `POST /galleries/{id}/pricing-package`
   - Toggle selection mode: `POST /galleries/{id}/selection-mode`
   - Send gallery to client: `POST /galleries/{id}/send`

4. **Delete Gallery (GDPR Compliance)**
   - Click "Delete Gallery" button
   - Calls `DELETE /galleries/{id}`
   - System validates ownership
   - Comprehensive deletion process:
     - **S3 Cleanup:**
       - Deletes all originals: `galleries/{galleryId}/originals/*`
       - Deletes all previews: `galleries/{galleryId}/previews/*`
       - Deletes all thumbnails: `galleries/{galleryId}/thumbs/*`
       - Deletes all final photos: `galleries/{galleryId}/final/*`
       - Deletes all ZIPs: `galleries/{galleryId}/zips/*`
       - Deletes archive: `galleries/{galleryId}/archive/*`
     - **DynamoDB Cleanup:**
       - Queries and deletes all orders for gallery
       - Deletes gallery record
     - Returns deletion summary:
       - S3 objects deleted count
       - Orders deleted count
   - Gallery completely removed from system

### Key Endpoints
- `GET /galleries` - List photographer's galleries
- `GET /galleries/{id}` - Get gallery details
- `DELETE /galleries/{id}` - Delete gallery (GDPR compliant)

---

## Order Status Lifecycle

Orders progress through the following statuses:

```
┌─────────────────┐
│ CLIENT_SELECTING │  Client is selecting photos
└────────┬─────────┘
         │
         │ Client approves selection
         ↓
┌─────────────────┐
│ CLIENT_APPROVED │  Selection approved, order created
└────────┬─────────┘
         │
         ├─→ Client requests changes
         │   ↓
         │ ┌─────────────────────┐
         │ │ CHANGES_REQUESTED   │  Client wants to modify selection
         │ └──────────┬──────────┘
         │            │
         │            │ Photographer approves
         │            ↓
         │      ┌─────────────────┐
         │      │ CLIENT_SELECTING │  Back to selection
         │      └─────────────────┘
         │
         │ Photographer processes & sends final link
         ↓
┌─────────────────┐
│   DELIVERED     │  Order delivered to client
└─────────────────┘
```

### Status Descriptions

- **CLIENT_SELECTING**: Client is actively selecting photos. Order may exist but not finalized.
- **CLIENT_APPROVED**: Client approved selection. Order created with selected photos. ZIP generated. Ready for photographer processing.
- **CHANGES_REQUESTED**: Client requested changes to approved selection. Photographer can approve to restore to CLIENT_SELECTING.
- **PREPARING_DELIVERY**: Photographer has started uploading final processed photos. **Selection is locked** (same as CLIENT_APPROVED) because photographer has done the work, but client can still request changes. Client can view photos but order not yet marked as delivered.
- **DELIVERED**: Order delivered to client. Final link sent. Originals/previews/thumbs cleaned up. Final ZIPs remain available.

---

## Payment Status

Orders track payment status independently from delivery status:

- **UNPAID**: Order created but payment not yet received
- **PAID**: Full payment received
- **DEPOSIT_PAID**: Partial payment (deposit) received
- **CANCELED**: Order canceled by photographer
- **REFUNDED**: Payment refunded to client

### Payment Status Flow

```
UNPAID → PAID (or DEPOSIT_PAID) → [DELIVERED]
   ↓
CANCELED or REFUNDED
```

Payment status can be updated independently:
- Photographer marks as paid after receiving payment
- Can mark deposit paid for partial payments
- Can cancel or refund as needed

---

## Storage Structure

All gallery assets stored in S3 with the following structure:

```
galleries/{galleryId}/
  ├── originals/          # Original uploaded photos (private)
  │   └── {filename}
  ├── previews/           # 1200px previews (CloudFront CDN)
  │   └── {filename}
  ├── thumbs/             # 200px thumbnails (CloudFront CDN)
  │   └── {filename}
  ├── final/              # Processed final photos
  │   └── {orderId}/
  │       └── {filename}
  ├── zips/               # Generated ZIP files
  │   └── {orderId}.zip
  └── archive/            # Long-term archive ZIPs (Glacier)
      └── {orderId}.zip
```

### Storage Lifecycle

1. **Upload**: Originals uploaded → previews/thumbs generated
2. **Selection**: Client selects photos → ZIP generated from originals
3. **Processing**: Photographer uploads final photos → stored in `final/{orderId}/`
4. **Delivery**: Order marked delivered → originals/previews/thumbs deleted for selected photos
5. **Archive**: Final photos and ZIPs remain indefinitely

---

## Email Notifications

The system sends email notifications at key points:

### To Photographer
- **Selection Approved**: When client approves selection and order is created
- **Change Request**: When client requests changes to approved selection

### To Client
- **Gallery Invitation**: When photographer sends gallery link and password
- **Final Link**: When photographer sends final delivery link

All emails sent via AWS SES with HTML and plain text formats.

---

## Security & Access Control

### Photographer Access
- Cognito JWT authentication required
- Owner-only access enforced (`requireOwnerOr403`)
- Can only access own galleries and orders

### Client Access
- Password-based authentication (PBKDF2 hashing)
- JWT token scoped to specific gallery
- Can only access assigned gallery
- Token stored in localStorage for session persistence

### S3 Access
- Private bucket with CloudFront OAI for previews/thumbnails
- Presigned URLs for uploads (time-limited)
- Presigned URLs for downloads (time-limited)

---

## Error Handling

Common error scenarios and handling:

- **401 Unauthorized**: Invalid or missing authentication token
- **403 Forbidden**: User doesn't own the resource
- **404 Not Found**: Gallery or order doesn't exist
- **400 Bad Request**: Invalid request parameters
- **402 Payment Required**: Insufficient wallet balance, payment needed
- **500 Internal Server Error**: System error, logged for investigation

All errors return JSON with error message and status code.

