# Lambda Functions in PhotoHub System

This document lists all Lambda functions in the PhotoHub infrastructure and their purposes.

## HTTP API Functions

### 1. **authFn** (`AuthFunction`)
- **Entry**: `backend/functions/auth/index.ts`
- **Purpose**: Handles all authentication endpoints
- **Endpoints**: Signup, login, password reset, email verification, business info updates
- **Trigger**: API Gateway HTTP API (`/auth/public/*` and `/auth/*`)
- **Memory**: 256MB
- **Timeout**: 30 seconds
- **Permissions**:
  - DynamoDB: `users`, `emailCodeRateLimit` (read/write)
  - Cognito: Admin operations (create user, initiate auth, set password, etc.)
  - SSM: Read configuration parameters

### 2. **apiFn** (`ApiFunction`)
- **Entry**: `backend/functions/api/index.ts`
- **Purpose**: Main API Lambda handling all HTTP endpoints (except auth)
- **Endpoints**: Galleries, orders, images, clients, packages, transactions, wallet, uploads, downloads, selections, dashboard, user deletion
- **Trigger**: API Gateway HTTP API (`/{proxy+}`)
- **Memory**: 512MB
- **Timeout**: 15 minutes (for large ZIP generation)
- **Permissions**:
  - DynamoDB: All tables (read/write)
  - S3: Galleries bucket (read/write)
  - SES: Send emails
  - CloudWatch: Get metrics
  - Lambda: List functions, invoke `zipFn`, `onOrderDeliveredFn`, `performUserDeletionFn`
  - SSM: Read configuration
  - EventBridge Scheduler: Create/delete schedules (for user deletion, gallery expiry)
  - IAM: PassRole (for scheduler roles)
- **Note**: Also includes dev endpoints (`/dev/*`) for testing

## Payment Functions (Stripe)

### 3. **paymentsCheckoutFn** (`PaymentsCheckoutFn`)
- **Entry**: `backend/functions/payments/checkoutCreate.ts`
- **Purpose**: Creates Stripe checkout session for gallery payments
- **Trigger**: API Gateway HTTP API (`POST /payments/checkout`)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `payments`, `transactions` (read/write)
  - SSM: Read Stripe configuration

### 4. **paymentsWebhookFn** (`PaymentsWebhookFn`)
- **Entry**: `backend/functions/payments/webhook.ts`
- **Purpose**: Processes Stripe webhook events from EventBridge partner event bus
- **Trigger**: EventBridge Rule (Stripe partner event bus)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `payments`, `transactions`, `wallet`, `walletLedger`, `galleries`, `orders` (read/write)
  - SSM: Read Stripe configuration
- **Events Handled**: `checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`, etc.

### 5. **paymentsSuccessFn** (`PaymentsSuccessFn`)
- **Entry**: `backend/functions/payments/success.ts`
- **Purpose**: Handles successful payment redirect page
- **Trigger**: API Gateway HTTP API (`GET /payments/success`)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - SSM: Read configuration

### 6. **paymentsCancelFn** (`PaymentsCancelFn`)
- **Entry**: `backend/functions/payments/cancel.ts`
- **Purpose**: Handles canceled payment redirect page
- **Trigger**: API Gateway HTTP API (`GET /payments/cancel`)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `transactions` (read/write)
  - SSM: Read configuration

### 7. **paymentsCheckStatusFn** (`PaymentsCheckStatusFn`)
- **Entry**: `backend/functions/payments/checkStatus.ts`
- **Purpose**: Checks payment transaction status
- **Trigger**: API Gateway HTTP API (`GET /payments/check-status`)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `payments`, `transactions` (read-only)
  - SSM: Read configuration

## Order Processing Functions

### 8. **zipFn** (`DownloadsZipFn`)
- **Entry**: `backend/functions/downloads/createZip.ts`
- **Purpose**: Generates ZIP files for order downloads (selected originals or final images)
- **Trigger**: Invoked by `apiFn` or `onOrderDeliveredFn`
- **Memory**: 1024MB (optimized for large ZIPs up to 15GB)
- **Timeout**: 15 minutes
- **DLQ**: `ZipGenerationDLQ`
- **Permissions**:
  - S3: Galleries bucket (read/write)
  - DynamoDB: `orders` (read/write), `galleries` (read), `images` (read, including GSI queries)
- **Note**: Uses connection reuse for 20-40% speedup on S3 operations

### 9. **onOrderDeliveredFn** (`OnOrderDeliveredFn`)
- **Entry**: `backend/functions/orders/onOrderDelivered.ts`
- **Purpose**: Handles order delivery - pre-generates final ZIP and triggers cleanup
- **Trigger**: Invoked by `apiFn` or `orderDeliveredStreamProcessor`
- **Memory**: 256MB
- **Timeout**: 5 minutes
- **Permissions**:
  - DynamoDB: `orders`, `images` (read)
  - S3: Galleries bucket (read)
  - Lambda: Invoke `zipFn`

### 10. **cleanupDeliveredOrderFn** (`CleanupDeliveredOrderFn`)
- **Entry**: `backend/functions/orders/cleanupDeliveredOrder.ts`
- **Purpose**: Cleans up original/final images from S3 after order is delivered
- **Trigger**: Invoked by `onOrderDeliveredFn`
- **Memory**: 512MB
- **Timeout**: 10 minutes
- **Permissions**:
  - DynamoDB: `orders`, `images` (read/write)
  - S3: Galleries bucket (read/write)

### 11. **orderDeliveredStreamProcessor** (`OrderDeliveredStreamProcessor`)
- **Entry**: `backend/functions/orders/onOrderDeliveredStreamProcessor.ts`
- **Purpose**: Processes DynamoDB stream events and automatically triggers `onOrderDeliveredFn` when order status changes to DELIVERED
- **Trigger**: DynamoDB Stream (Orders table)
- **Memory**: 256MB
- **Timeout**: 2 minutes
- **Permissions**:
  - Lambda: Invoke `onOrderDeliveredFn`
- **Note**: Ensures final ZIP generation happens even if order is marked DELIVERED outside of normal flow

### 12. **orderStatusChangeProcessor** (`OrderStatusChangeProcessor`)
- **Entry**: `backend/functions/orders/onOrderStatusChange.ts`
- **Purpose**: Processes order status changes and triggers ZIP generation for selected originals when status changes to CLIENT_APPROVED or PREPARING_DELIVERY
- **Trigger**: DynamoDB Stream (Orders table)
- **Memory**: 512MB
- **Timeout**: 2 minutes
- **Permissions**:
  - DynamoDB: `orders` (read/write)
  - Lambda: Invoke `zipFn`
- **Note**: Ensures ZIP generation happens even if status changes outside of approveSelection function

## Gallery & Expiry Functions

### 13. **expiryFn** (`ExpiryCheckFn`)
- **Entry**: `backend/functions/expiry/checkAndNotify.ts`
- **Purpose**: Checks gallery expiration dates and sends warning emails to users
- **Trigger**: EventBridge Rule (every 6 hours)
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `galleries` (read/write)
  - SES: Send emails
  - Cognito: AdminGetUser (for fallback email retrieval)
  - SSM: Read configuration

### 14. **galleryExpiryDeletionFn** (`GalleryExpiryDeletionFn`)
- **Entry**: `backend/functions/expiry/deleteExpiredGallery.ts`
- **Purpose**: Deletes expired galleries at exact expiry time
- **Trigger**: EventBridge Scheduler (scheduled per gallery)
- **Memory**: 1024MB
- **Timeout**: 15 minutes
- **DLQ**: `GalleryExpiryDLQ`
- **Permissions**:
  - DynamoDB: `galleries`, `transactions`, `orders`, `images` (read/write)
  - S3: Galleries bucket (read/write)
  - SES: Send emails
  - Cognito: AdminGetUser
  - SSM: Read configuration
- **Note**: Scheduled individually per gallery using EventBridge Scheduler

### 15. **galleriesDeleteHelperFn** (`GalleriesDeleteHelperFn`)
- **Entry**: `backend/functions/galleries/delete.ts`
- **Purpose**: Helper function for gallery deletion (used by expiry handlers and user deletion)
- **Trigger**: Invoked by `transactionExpiryFn` or `performUserDeletionFn`
- **Memory**: 256MB (default)
- **Timeout**: 30 seconds (default)
- **Permissions**:
  - DynamoDB: `galleries`, `transactions`, `orders` (read/write)
  - S3: Galleries bucket (read/write)
  - SES: Send emails
  - Cognito: AdminGetUser
  - SSM: Read configuration

### 16. **transactionExpiryFn** (`TransactionExpiryCheckFn`)
- **Entry**: `backend/functions/expiry/checkTransactions.ts`
- **Purpose**: Checks for expired transactions (wallet top-ups after 15 minutes, gallery transactions after 3 days) and cancels them
- **Trigger**: EventBridge Rule (every 15 minutes)
- **Memory**: 256MB (default)
- **Timeout**: 5 minutes
- **Permissions**:
  - DynamoDB: `transactions`, `galleries` (read/write)
  - Lambda: Invoke `galleriesDeleteHelperFn`
  - SSM: Read configuration

## User Deletion Functions

### 17. **performUserDeletionFn** (`PerformUserDeletionFn`)
- **Entry**: `backend/functions/users/performUserDeletion.ts`
- **Purpose**: Performs complete user account deletion (soft delete + cleanup)
- **Trigger**: EventBridge Scheduler (scheduled per user) or invoked directly by dev tools
- **Memory**: 1024MB
- **Timeout**: 15 minutes
- **DLQ**: `UserDeletionDLQ`
- **Permissions**:
  - DynamoDB: `users`, `galleries`, `orders`, `packages`, `images`, `wallet`, `walletLedger`, `transactions` (read/write)
  - S3: Galleries bucket (read/write)
  - Cognito: AdminDeleteUser
  - SES: Send emails
  - EventBridge Scheduler: DeleteSchedule
  - SSM: Read configuration
- **Process**:
  1. Deletes user's galleries (if no delivered orders)
  2. Preserves galleries with delivered orders (denormalizes ownerEmail)
  3. Deletes user's S3 objects
  4. Cancels wallet transactions
  5. Soft deletes user (nullifies PII, preserves userId)
  6. Deletes Cognito user
  7. Cancels EventBridge schedule
  8. Sends confirmation email

### 18. **inactivityScannerFn** (`InactivityScannerFn`)
- **Entry**: `backend/functions/users/inactivityScanner.ts`
- **Purpose**: Scans for inactive users and schedules automatic deletion (GDPR/RODO compliance)
- **Trigger**: EventBridge Rule (daily at 2 AM UTC)
- **Memory**: 256MB
- **Timeout**: 5 minutes
- **Permissions**:
  - DynamoDB: `users` (read/write)
  - SES: Send emails
  - EventBridge Scheduler: CreateSchedule, DeleteSchedule, GetSchedule, UpdateSchedule
  - IAM: PassRole (for scheduler role)
  - SSM: Read configuration
- **Process**:
  - Scans users table for inactive users (no login for 365+ days)
  - Sends reminder/warning emails at 365, 380, 395 days
  - Schedules deletion at 400 days of inactivity

### 19. **postAuthenticationFn** (`PostAuthenticationFn`)
- **Entry**: `backend/functions/auth/postAuthentication.ts`
- **Purpose**: Updates user's last login timestamp and cancels pending inactivity-based deletions
- **Trigger**: Cognito Post Authentication trigger (configured manually in Cognito console)
- **Memory**: 256MB
- **Timeout**: 10 seconds
- **Permissions**:
  - DynamoDB: `users` (read/write)
  - EventBridge Scheduler: DeleteSchedule (to cancel pending deletions)
  - SSM: Read configuration
- **Note**: Must be manually configured as Cognito trigger after deployment

## Batch Delete Function

### 20. **deleteBatchFn** (`ImagesOnS3DeleteBatchFn`)
- **Entry**: `backend/functions/images/onS3DeleteBatch.ts`
- **Purpose**: Processes batch delete operations from SQS queue (reduces Lambda invocations)
- **Trigger**: SQS Queue (`DeleteOperationsQueue`)
- **Memory**: 512MB
- **Timeout**: 2 minutes
- **Batch Size**: 10 delete operations per invocation
- **Permissions**:
  - DynamoDB: `galleries`, `orders`, `images` (read/write)
  - S3: Galleries bucket (read/write)
- **Note**: Processes deletes in batches to reduce costs (3000 deletes = 300 invocations instead of 3000)

## Summary

**Total Lambda Functions**: 20

**By Category**:
- HTTP API: 2 (authFn, apiFn)
- Payments: 5 (checkout, webhook, success, cancel, checkStatus)
- Order Processing: 5 (zip, onOrderDelivered, cleanup, stream processors)
- Gallery & Expiry: 4 (expiry check, deletion, delete helper, transaction expiry)
- User Deletion: 3 (perform deletion, inactivity scanner, post authentication)
- Batch Operations: 1 (batch delete)

**Event Sources**:
- API Gateway: 2 functions (authFn, apiFn)
- EventBridge Rules: 4 functions (expiryFn, transactionExpiryFn, inactivityScannerFn, paymentsWebhookFn)
- EventBridge Scheduler: 2 functions (galleryExpiryDeletionFn, performUserDeletionFn)
- DynamoDB Streams: 2 functions (orderDeliveredStreamProcessor, orderStatusChangeProcessor)
- SQS Queue: 1 function (deleteBatchFn)
- Direct Invocation: 8 functions (invoked by other Lambdas or API)

**Dead Letter Queues**: 3
- ZipGenerationDLQ
- GalleryExpiryDLQ
- UserDeletionDLQ

