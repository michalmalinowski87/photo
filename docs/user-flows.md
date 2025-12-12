# PhotoCloud User Flows

This document describes the main user flows for photographers and clients using PhotoCloud.

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
Photographers authenticate, receive welcome bonus on first registration, manage their wallet balance, and view transaction history.

### Detailed Steps

1. **Authentication**
   - Photographer navigates to dashboard
   - Signs up/logs in via Cognito Hosted UI
   - Receives JWT token for authenticated API calls

2. **Welcome Bonus (New Users Only)**
   - **Automatic Credit**: When a new user accesses their wallet for the first time (via `GET /wallet/balance`):
     - System detects new user (no existing wallet and no previous transactions)
     - Automatically credits **900 cents (9 PLN)** to wallet - equivalent to 1GB 3-month plan cost
     - This is our customer acquisition cost (CAC) - allows users to try the service for free
     - Creates transaction record with type `WELCOME_BONUS` and status `PAID`
     - Creates ledger entry with type `WELCOME_BONUS`
     - Transaction appears in wallet history as "Bonus powitalny"
   - **One-Time Only**: Welcome bonus is only credited once per user:
     - Checks for existing transactions before crediting
     - Checks ledger for existing `WELCOME_BONUS` entries
     - Prevents double crediting if user accesses wallet multiple times
   - **User Benefit**: New users can immediately create their first gallery without needing to top up wallet first

3. **Wallet Top-Up**
   - Navigate to wallet page in dashboard
   - Enter amount (minimum 20 PLN / 2000 cents)
   - Click "Top Up" button
   - System creates Stripe checkout session via `POST /payments/checkout`
   - Redirects to Stripe checkout page
   - Complete payment with credit card
   - Stripe webhook processes payment:
     - Credits wallet balance
     - Creates ledger entry in `WalletLedger` table
     - Records payment in `Payments` table
   - Redirects back to wallet page with success confirmation

4. **View Balance & Transactions**
   - Wallet page displays current balance
   - Transaction history shows:
     - Welcome bonus (WELCOME_BONUS) - for new users
     - Top-ups (WALLET_TOPUP)
     - Gallery creation debits (GALLERY_PLAN)
     - Plan upgrades (GALLERY_PLAN_UPGRADE)
     - Refunds (REFUND)
     - Timestamps and amounts

### Key Endpoints
- `GET /wallet/balance` - Get current wallet balance (automatically credits welcome bonus for new users on first access)
- `POST /payments/checkout` - Create Stripe checkout session for wallet top-up
- `GET /wallet/transactions` - List transaction history

### Data Flow
```
New User → GET /wallet/balance → Welcome Bonus (900 cents) → Wallet Credit
Dashboard → POST /payments/checkout → Stripe Checkout → Payment → Webhook → Wallet Credit
```

---

## 2. Gallery Creation & Setup

### Flow Overview
Photographers create galleries using a multi-step wizard, upload photos first, then calculate and pay for a plan based on actual upload size. **Galleries are created as UNPAID drafts without a plan** - plan is calculated after photos are uploaded, and payment is deferred until the photographer clicks "Opłać galerię".

### Detailed Steps

1. **Create Gallery via Multi-Step Wizard**
   - Navigate to dashboard
   - Click "+ Utwórz galerię" button in header (or from galleries page)
   - **Step 1: Typ galerii**
     - Choose "Wybór przez klienta" (client selects photos) or "Wszystkie zdjęcia" (all photos)
   - **Step 2: Nazwa galerii**
     - Enter unique gallery name
     - System validates uniqueness
   - **Step 3: Szczegóły pakietu**
     - Choose package source:
       - "Wprowadź ręcznie": Enter package name, included count, extra price, package price
       - "Wybierz z istniejących pakietów": Select from saved packages
     - **Note**: Plan selection removed - plan will be calculated automatically after upload
   - **Step 4: Dane klienta**
     - Choose client source:
       - "Nowy klient": Enter email, password (optional), name/company details
       - "Wybierz z istniejących klientów": Select from saved clients
   - **Step 5: Podsumowanie**
     - Review all settings
     - Click "Utwórz galerię"

2. **Gallery Creation (UNPAID Draft - No Plan)**
   - **No Immediate Payment**: Gallery is created WITHOUT deducting from wallet or redirecting to Stripe
   - **Draft State**: Gallery created with:
     - `state: 'DRAFT'`
     - `plan`: Not set (will be calculated after upload)
     - `priceCents`: Not set
     - `originalsLimitBytes`: Not set (draft galleries limited to 10GB max upload)
     - `finalsLimitBytes`: Not set
     - `originalsBytesUsed: 0`
     - `finalsBytesUsed: 0`
     - `expiresAt`: Set to 3 days from creation (EventBridge Scheduler for automatic deletion)
     - `selectionStatus`: `DISABLED` if selection disabled, otherwise `DISABLED` (until paid)
   - **No Transaction Created**: Transaction will be created when plan is selected and payment is initiated
   - **Response**: Returns `paid: false` with message "Wersja robocza została utworzona. Wygasa za 3 dni jeśli nie zostanie opłacona."

3. **Upload Photos to Draft Gallery**
   - Navigate to gallery photos page
   - Select and upload photos
   - **Upload Limits**:
     - **Draft galleries (no plan)**: Maximum 10GB total upload (prevents exceeding largest available plan)
     - **Paid galleries**: Limited by `originalsLimitBytes` from selected plan
   - **Upload Locking Protection**:
     - If `paymentLocked === true`: Uploads are blocked with `423 Locked` error
     - Message: "Cannot upload photos while payment is being processed. Please wait for payment to complete or cancel the payment to continue uploading."
     - Prevents concurrent uploads during payment that could invalidate payment state
   - System validates upload size BEFORE allowing upload:
     - For draft galleries: Checks if `currentSize + fileSize <= 10GB`
     - For paid galleries: Checks if `currentSize + fileSize <= originalsLimitBytes`
   - If limit exceeded: Shows error message with current usage and limit
   - After upload completes: System processes images and updates `originalsBytesUsed`

4. **Calculate Plan Based on Upload Size**
   - After uploading photos, photographer clicks "Opłać galerię" button
   - System automatically calculates plan:
     - Calls `GET /galleries/{id}/calculate-plan`
     - Calculates total uploaded size from S3 (`galleries/{galleryId}/originals/`) - **S3 is source of truth**
     - Finds best matching plan (smallest plan that fits, or largest if exceeds all plans)
     - Calculates pricing:
       - **Selection galleries**: Standard plan price
       - **Non-selection galleries**: 20% discount (plan price × 0.8)
     - Returns suggested plan with:
       - Plan name and key (e.g., "3GB - 3 miesiące")
       - Price (with discount applied if non-selection)
       - Storage limits (`originalsLimitBytes` and `finalsLimitBytes` = plan size)
       - Duration options (1m, 3m, 12m)
       - **Capacity warnings**: `usagePercentage`, `isNearCapacity` (≥95%), `isAtCapacity` (≥99.9%)
       - **Next tier suggestion**: If near/at capacity, suggests larger plan option

5. **Select Plan and Pay**
   - Pricing modal displays calculated plan options with **user-centric protections**:
     - **Capacity Warnings**:
       - ⚠️ **Critical Warning** (≥95% capacity): Yellow banner showing "Galeria jest prawie pełna" with usage percentage and suggestion to consider larger plan
       - ℹ️ **Info Warning** (≥80% capacity): Blue banner showing current usage and remaining capacity
     - Photographer reviews:
       - Uploaded size
       - Suggested plan details (storage limits, duration, price)
       - Gallery type (selection vs non-selection with discount note)
       - Capacity warnings (if applicable)
   - Photographer selects plan duration (1m, 3m, or 12m)
   - System updates gallery with selected plan:
     - `plan`: Selected plan key
     - `priceCents`: Calculated price (with discount if applicable)
     - `originalsLimitBytes`: Plan storage limit
     - `finalsLimitBytes`: Plan storage limit
     - `paymentLocked`: Set to `true` (prevents concurrent uploads during payment)
   - **Pre-Payment Validation** (user-centric protection):
     - System **recalculates uploaded size from S3** before processing payment
     - **Blocks payment** if uploaded size exceeds selected plan limit
     - Returns error: "Cannot proceed with payment. Current uploads (X GB) exceed selected plan limit (Y GB) by Z GB. Please recalculate plan or delete excess files."
     - This prevents paying for plans that don't fit actual uploads
   - **Payment Processing**:
     - Creates transaction with `type: 'GALLERY_PLAN'`
     - **Stores plan details in transaction metadata** (prevents race conditions):
       - Plan key, price, limits, calculation timestamp
       - Original plan details for future upgrade calculations
     - Uses wallet balance if available
     - Creates Stripe checkout session if needed
     - Updates transaction with `stripeSessionId`
   - **Upload Locking During Payment**:
     - While `paymentLocked === true`, uploads are blocked
     - `presign.ts` returns `423 Locked` error: "Cannot upload photos while payment is being processed"
     - Prevents concurrent uploads that could invalidate payment
   - **Payment Success** (via webhook or wallet):
     - Updates gallery: `state: 'PAID_ACTIVE'`
     - Updates `expiresAt` to full plan duration (replaces 3-day draft expiry)
     - **Removes `paymentLocked` flag** (allows uploads again)
     - Sets `expiresAt` to full plan duration
     - Sets `selectionStatus` to `NOT_STARTED` if selection enabled
     - Updates transaction: `status: 'PAID'`

6. **Plan Upgrade (For Paid Galleries)**
   - If photographer exceeds storage limit after payment:
     - System detects limit exceeded after upload completes
     - Shows `LimitExceededModal` with:
       - Current usage vs limit
       - Excess amount
       - Next tier plan option
   - Photographer can upgrade plan:
     - Clicks "Zaktualizuj plan" button
     - System calls `POST /galleries/{id}/upgrade-plan`
     - Calculates price difference between current and new plan
     - **Only charges difference** (not full plan price)
     - **Duration Handling** (user-centric):
       - **Upgrade keeps original expiry date** - only storage size is upgraded
       - User doesn't pay for duration they didn't request
       - Example: If user has 3GB-1m plan (expires in 30 days), upgrading to 10GB-3m keeps original 30-day expiry
     - Stripe checkout shows clear breakdown:
       - "Already purchased: [Current Plan] ([Current Price] PLN)"
       - "Upgrade cost: [Price Difference] PLN"
     - Payment processes difference only
     - Gallery plan updated immediately after payment:
       - `plan`: New plan key
       - `priceCents`: New plan price
       - `originalsLimitBytes`: New storage limit
       - `finalsLimitBytes`: New storage limit
       - **`expiresAt`: Unchanged** (keeps original expiry date)

4. **Draft Expiry Warning**
   - Scheduled job runs every 6 hours
   - Checks for UNPAID galleries with `expiresAt` expiring within 24 hours
   - Sends email notification to photographer
   - Stores notification flag (`expiryWarning24hSent: true`)
   - **After 3 days**: EventBridge Scheduler automatically deletes UNPAID gallery

5. **Gallery Management**
   - **Gallery Detail Page**: Left sidebar shows:
     - Gallery name and status
     - UNPAID banner (if unpaid) with "Opłać galerię" button
     - Gallery URL (with copy button)
     - Creation date
     - "Wyślij link do klienta" button (if paid and client email set)
     - "Ustawienia galerii" button (opens modal)
     - "Zdjęcia w galerii" link
   - **Settings Modal**: Edit gallery name, client email, password, pricing package
   - **Orders Mini-Control-Panel**: Shows all orders with status badges and quick actions

6. **Send Gallery to Client**
   - Only available if gallery is PAID and has client email
   - Click "Wyślij link do klienta" in sidebar
   - System sends invitation email via `POST /galleries/{id}/send`:
     - Email includes gallery link
     - Includes password (if set)
     - Client can access gallery immediately

### Key Endpoints
- `POST /galleries` - Create new gallery (creates UNPAID draft without plan, 3-day expiry via EventBridge Scheduler)
- `GET /galleries/{id}/calculate-plan` - Calculate best matching plan based on uploaded size
- `POST /galleries/{id}/pay` - Pay for unpaid gallery (creates transaction, requires plan to be set first)
- `POST /galleries/{id}/upgrade-plan` - Upgrade plan for paid gallery (pays difference only)
- `POST /galleries/{id}/validate-upload-limits` - Validate upload limits after batch upload completes
- `POST /galleries/{id}/client-password` - Set client access password
- `POST /galleries/{id}/pricing-package` - Update pricing configuration
- `POST /galleries/{id}/selection-mode` - Enable/disable selection mode
- `POST /galleries/{id}/send` - Send gallery invitation to client

### User-Centric Protections & Edge Cases

#### Capacity Warnings Before Payment
- **When**: Plan calculation returns `usagePercentage ≥ 95%` or `usagePercentage ≥ 80%`
- **Display**: Pricing modal shows prominent warnings:
  - **Critical (≥95%)**: Yellow warning banner with icon, usage percentage, and suggestion to consider larger plan
  - **Info (≥80%)**: Blue info banner showing current usage and remaining capacity
- **User Benefit**: Users are informed before payment if they're near capacity, preventing frustration after payment

#### Pre-Payment Validation
- **When**: Before processing payment in `pay.ts`
- **Action**: System recalculates uploaded size from S3 (source of truth) and compares against selected plan
- **Blocking**: Payment is blocked if `uploadedSizeBytes > originalsLimitBytes`
- **Error Message**: Clear error explaining current usage, plan limit, and excess amount
- **User Benefit**: Prevents users from paying for plans that don't fit their uploads

#### Upload Locking During Payment
- **When**: `paymentLocked` flag is set when payment is initiated
- **Effect**: All upload requests return `423 Locked` error with clear message
- **Cleared**: Automatically removed when payment succeeds (webhook or wallet payment)
- **User Benefit**: Prevents concurrent uploads during payment, ensuring payment uses correct gallery state

#### Plan Recalculation Before Payment
- **When**: Always before payment processing
- **Action**: Recalculates uploaded size from S3, not relying on cached `originalsBytesUsed`
- **Reason**: S3 is source of truth - Lambda processing may be delayed or failed
- **User Benefit**: Ensures payment uses current gallery state, not stale calculations

#### Duration Handling in Upgrades
- **Rule**: Upgrades keep original expiry date, only upgrade storage size
- **Rationale**: User paid for original duration, shouldn't pay for duration they didn't request
- **Implementation**: `upgradePlan.ts` only updates plan, price, and storage limits - `expiresAt` unchanged
- **User Benefit**: Fair pricing - users only pay for what they need (more storage)

#### Plan Stored in Transaction Metadata
- **When**: Transaction created during payment
- **Stored**: Plan key, price, limits, calculation timestamp, original plan details
- **Reason**: Prevents race conditions where plan is overwritten before payment completes
- **User Benefit**: Ensures payment uses correct plan even if gallery is modified concurrently

#### Gallery Type Change Restriction
- **Rule**: Only upgrades allowed (non-selection → selection), downgrades blocked
- **Rationale**: Maintains pricing consistency - users can't switch to cheaper type after upload
- **Implementation**: `setSelectionMode.ts` checks current type and blocks downgrades
- **User Benefit**: Prevents pricing manipulation, ensures fair pricing

#### Optimistic Locking with Version Numbers
- **When**: Gallery updates include optional `version` field
- **Behavior**: 
  - Gallery creation sets `version: 1`
  - Updates increment version automatically
  - If `version` provided in request, checks matches current version
  - Version mismatch returns `409 Conflict` with clear message
- **User Benefit**: Prevents concurrent updates from overwriting each other, clear error guides user to refresh

#### Payment Failure Recovery
- **When**: Payment fails, cancels, or session expires
- **Action**: `paymentLocked` flag automatically cleared
- **Scenarios**: 
  - User clicks back from Stripe checkout
  - Payment intent fails
  - Payment intent canceled
  - Checkout session expires
- **User Benefit**: Users can retry payment or continue uploading after payment failure

### Payment Flow Edge Cases

1. **Stripe Cancel (Back Button)**
   - User clicks back from Stripe checkout
   - `GET /payments/cancel` endpoint called
   - Transaction status updated to `CANCELED`
   - **`paymentLocked` flag automatically cleared** (allows uploads again)
   - Gallery remains as UNPAID draft (expiry schedule still active)
   - User can retry payment via "Opłać galerię" button

2. **Retry Payment**
   - User clicks "Opłać galerię" on unpaid gallery
   - If no plan set: System calculates plan first, shows pricing modal
   - If plan set: **Pre-payment validation runs** - recalculates uploaded size from S3
   - If uploaded size exceeds plan: Payment blocked with clear error message
   - If within limit: Creates transaction and processes payment
   - Updates transaction with new Stripe session
   - Supports fractional payments (wallet + Stripe)

3. **Plan Upgrade Flow**
   - If paid gallery exceeds storage limit:
     - System detects after upload completes
     - Shows `LimitExceededModal` with upgrade option
     - User clicks "Zaktualizuj plan"
     - System calls `POST /galleries/{id}/upgrade-plan` with new plan
     - Calculates price difference (new plan price - current plan price)
     - Only charges difference (not full plan price)
     - **Duration**: Upgrade keeps original expiry date (only storage size upgraded)
     - Stripe checkout clearly shows:
       - "Already purchased: [Current Plan] ([Current Price] PLN)"
       - "Upgrade cost: [Price Difference] PLN"
     - After payment: Gallery plan updated immediately
     - **Note**: `expiresAt` remains unchanged - keeps original expiry date

3. **Draft Auto-Expiry**
   - EventBridge Scheduler automatically deletes UNPAID galleries after 3 days (precise timing)
   - 24h before expiry: Email notification sent to photographer
   - After expiry: Gallery and associated transaction deleted automatically

4. **Manual Cancel**
   - User can cancel UNPAID transaction via "Cancel" button
   - Transaction status updated to `CANCELED`
   - Gallery deleted (if type is GALLERY_PLAN)

5. **Payment Status Derivation**
   - Gallery payment status derived from transactions (not stored in gallery)
   - Query transactions table for `GALLERY_PLAN` or `GALLERY_PLAN_UPGRADE` type with `PAID` status
   - If no paid transaction exists: gallery disabled (only Pay/Cancel actions)
   - If paid transaction exists: gallery enabled (all actions allowed)

6. **Upload Limit Exceeded**
   - If upload exceeds limit (draft: 10GB, paid: plan limit):
     - Pre-upload check in `presign.ts` prevents upload
     - Post-upload validation detects if limit exceeded
     - Shows `LimitExceededModal` with:
       - Current usage and limit
       - Excess amount
       - Next tier plan option
     - Options:
       - Upgrade plan (pays difference only if already paid)
       - Cancel and remove excess files

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
     - **Storage Limits** (checked BEFORE upload):
       - **Draft galleries (no plan)**: Maximum 10GB total (`currentSize + fileSize <= 10GB`)
       - **Paid galleries**: Limited by plan (`currentSize + fileSize <= originalsLimitBytes`)
     - Returns error if limit would be exceeded with clear message
   - Returns presigned S3 URL with PUT permission
   - URL expires after configured time (typically 15 minutes)

2. **Upload Originals**
   - Dashboard uploads each image directly to S3 using presigned URL
   - Images stored in: `galleries/{galleryId}/originals/{filename}`
   - Upload progress tracked in frontend
   - **Note**: Storage limit checked BEFORE upload (prevents partial uploads)

3. **Automatic Processing**
   - Client-side thumbnail generation via Uppy plugin
   - Plugin processes each image in browser:
     - Generates 1200px preview → `galleries/{galleryId}/previews/{filename}`
     - Generates 200px thumbnail → `galleries/{galleryId}/thumbs/{filename}`
     - Uses Canvas API for resizing
     - Uploads previews/thumbs to S3 using presigned URLs
   - Previews and thumbnails served via CloudFront CDN
   - Processing happens immediately (no server-side delay)

4. **Post-Upload Validation**
   - After batch upload completes, system calls `POST /galleries/{id}/validate-upload-limits`
   - Validates actual uploaded size against plan limits
   - If limit exceeded:
     - Returns error with:
       - Current usage vs limit
       - Excess amount
       - Next tier plan option (for upgrade)
     - Shows `LimitExceededModal` to photographer
     - Photographer can:
       - Upgrade to next tier plan (pays difference only if gallery already paid)
       - Cancel and remove excess files

5. **View Uploaded Images**
   - Photographer can view gallery images via `GET /galleries/{id}/images`
   - Returns list with CloudFront URLs for previews and thumbnails
   - Images appear in gallery view immediately after upload
   - Storage usage displayed:
     - Originals: X GB / Y GB
     - Finals: A GB / B GB

### Key Endpoints
- `POST /uploads/presign` - Generate presigned S3 upload URL (validates storage limits before upload)
- `POST /galleries/{id}/validate-upload-limits` - Validate upload limits after batch upload completes
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
   - **ZIP Generation**:
     - ZIPs are generated on-demand when photographer or client requests download
     - ZIP is generated only when needed (not automatically on approval)
     - ZIP is one-time use: deleted after first download
     - ZIP generation available only when order status is `CLIENT_APPROVED` (before final photos uploaded)
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
     - ZIP download available (if generated)
   - **Download ZIP**:
     - "Pobierz ZIP" button available when:
     - Order status is `CLIENT_APPROVED` (before final photos uploaded)
     - ZIP is generated on-demand when requested
     - ZIP is one-time use: deleted after first download
     - ZIP contains selected original photos

2. **Approve Change Request (If Applicable)**
   - If order status is `CHANGES_REQUESTED`:
     - Click "Approve Change Request" button
     - Calls `POST /galleries/{id}/orders/{orderId}/change-request/approve`
     - System updates order status to `CLIENT_SELECTING`
     - Client can now modify selection
     - Order restored to selection state

3. **Process Photos**
   - Photographer processes selected photos in editing software
   - **Note**: Once final photos are uploaded, original photos will be deleted after delivery
   - ZIP download is only available before final photos are uploaded (when order status is `CLIENT_APPROVED`)
   - Upload final processed photos:
     - Click "Upload Final Photos" button
     - Select processed image files
     - Calls `POST /galleries/{id}/orders/{orderId}/final/upload`
     - System uploads to `galleries/{galleryId}/final/{orderId}/{filename}`
     - Photos stored in original, unprocessed format
     - **First photo upload**: Order status automatically changes from `CLIENT_APPROVED` to `PREPARING_DELIVERY`
     - Subsequent uploads: Order remains `PREPARING_DELIVERY` status
     - **Note**: Once status changes to `PREPARING_DELIVERY`, ZIP generation is no longer available
   - Client can view photos in `PREPARING_DELIVERY` status (before final delivery)

4. **Mark Payment Status**
   - Update payment status as needed:
     - `POST /galleries/{id}/orders/{orderId}/paid` - Mark as fully paid
     - `POST /galleries/{id}/orders/{orderId}/deposit-paid` - Mark deposit paid
     - `POST /galleries/{id}/orders/{orderId}/canceled` - Cancel order
     - `POST /galleries/{id}/orders/{orderId}/mark-refunded` - Mark as refunded
     - `POST /galleries/{id}/orders/{orderId}/mark-partially-paid` - Mark as partially paid (replaces DEPOSIT_PAID)

5. **Send Final Delivery**
   - Once photos processed and payment confirmed:
     - Click "Send Final Link" button
     - Calls `POST /galleries/{id}/orders/{orderId}/send-final-link`
     - System:
       - Sends email to client with gallery link
       - Marks order as `DELIVERED`
       - Sets `deliveredAt` timestamp
       - Keeps final photos
       - **Note**: ZIPs are one-time use and are deleted after first download (if generated)
   - **Optional Cleanup (Selection Galleries Only)**:
     - For selection galleries (user-selecting galleries), photographer is prompted:
       - Prompt: "Czy chcesz usunąć wybrane oryginały? To działanie jest nieodwracalne i usunie oryginały, podglądy oraz miniatury dla wybranych zdjęć."
     - If photographer confirms:
       - Calls `POST /galleries/{id}/orders/{orderId}/cleanup-originals`
       - System deletes:
         - Originals for selected photos
         - Previews for selected photos
         - Thumbnails for selected photos
     - If photographer cancels or gallery is non-selection:
       - Originals, previews, and thumbnails are kept
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
- `GET /galleries/{id}/orders/{orderId}` - Get order details
- `GET /galleries/{id}/orders/{orderId}/final/images` - List final images for order
- `POST /galleries/{id}/orders/{orderId}/final/images/{filename}` - Upload final image (via presigned URL)
- `DELETE /galleries/{id}/orders/{orderId}/final/images/{filename}` - Delete final image
- `GET /galleries/{id}/orders/{orderId}/zip` - Download ZIP (generates on-the-fly if needed)
- `POST /galleries/{id}/orders/{orderId}/generate-zip` - Generate ZIP for order
- `POST /galleries/{id}/orders/{orderId}/change-request/approve` - Approve change request
- `GET /galleries/{id}/orders/{orderId}/zip` - Download ZIP (generates on-demand, one-time use - deleted after download)
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
- **CLIENT_APPROVED**: Client approved selection, order created. ZIP can be generated on-demand by photographer or client (one-time use, deleted after download).
- **CHANGES_REQUESTED**: Client requested changes, photographer can approve to restore to CLIENT_SELECTING
- **PREPARING_DELIVERY**: Photographer has started uploading final photos (first photo triggers this status). **Selection is locked** (same as CLIENT_APPROVED) because photographer has done the work, but client can still request changes. **ZIP generation no longer available**.
- **DELIVERED**: Order delivered, final link sent. Originals cleanup is optional (photographer can choose to clean up originals, previews, and thumbnails when marking as delivered for selection galleries). ZIPs are one-time use and deleted after download (if generated).

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

## 8. Order Detail View

### Flow Overview
Photographers view order details, manage original and final photos, and download ZIPs.

### Detailed Steps

1. **Navigate to Order Detail**
   - From gallery detail page, click "Szczegóły" on order row
   - Or navigate directly to `/galleries/{galleryId}/orders/{orderId}`

2. **Order Information Display**
   - Order number and status badges (delivery + payment)
   - Total amount
   - Creation date
   - Selected photos count (if applicable)

3. **Tabs: Oryginały and Finały**
   - **Oryginały Tab**:
     - Shows all original photos uploaded to gallery
     - Highlights photos selected by client (green badge)
     - Displays selection count: "Wybrane zdjęcia przez klienta: X z Y"
     - Shows selected keys list
   - **Finały Tab**:
     - Shows final processed photos for this order
     - Upload interface (if order status allows):
       - File picker (multiple files)
       - "Prześlij" button
       - Uses presigned URLs for upload
     - Delete button on each final photo
     - Only visible if order is CLIENT_APPROVED, PREPARING_DELIVERY, or DELIVERED

4. **ZIP Download**
   - "Pobierz ZIP" button available if:
     - Order has zipKey (already generated), OR
     - Order status allows ZIP generation (CLIENT_APPROVED+)
   - If ZIP doesn't exist: Generates on-the-fly via `POST /galleries/{id}/orders/{orderId}/generate-zip`
   - Downloads ZIP file directly

5. **Order Actions**
   - All order status change actions available
   - Mark as paid, partially paid, canceled, refunded
   - Send final link to client

### Key Endpoints
- `GET /galleries/{id}/orders/{orderId}` - Get order details
- `GET /galleries/{id}/images` - List original images
- `GET /galleries/{id}/orders/{orderId}/final/images` - List final images
- `POST /uploads/presign` - Get presigned URL for final photo upload
- `DELETE /galleries/{id}/orders/{orderId}/final/images/{filename}` - Delete final image
- `GET /galleries/{id}/orders/{orderId}/zip` - Download ZIP (generates if needed)
- `POST /galleries/{id}/orders/{orderId}/generate-zip` - Generate ZIP for order

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
- **DELIVERED**: Order delivered to client. Final link sent. Originals cleanup is optional (photographer can choose to clean up originals, previews, and thumbnails when marking as delivered for selection galleries). Final ZIPs remain available.

---

## Payment Status

Orders track payment status independently from delivery status:

- **UNPAID**: Order created but payment not yet received
- **PAID**: Full payment received
- **PARTIALLY_PAID**: Partial payment received (replaces DEPOSIT_PAID)
- **CANCELED**: Order canceled by photographer
- **REFUNDED**: Payment refunded to client

### Payment Status Flow

```
UNPAID → PAID (or PARTIALLY_PAID) → [DELIVERED]
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
4. **Delivery**: Order marked delivered → optional cleanup of originals/previews/thumbs for selected photos (photographer chooses)
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

