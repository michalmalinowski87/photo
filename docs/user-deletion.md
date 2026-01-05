# User Account Deletion Functionality

## Overview

This document describes the comprehensive user account deletion system implemented in PhotoCloud, including manual deletion requests, GDPR/RODO-compliant inactivity-based auto-deletion, and data retention policies.

## Features

- **Manual Account Deletion**: Users can request account deletion with a 3-day undo period
- **Inactivity Auto-Deletion**: GDPR/RODO-compliant automatic deletion after 1 year of inactivity
- **Soft Delete**: Preserves transactional data while removing personal information
- **Gallery Preservation**: Galleries with delivered orders remain accessible to clients
- **Comprehensive Cleanup**: Removes photographer's data while preserving client access

## GDPR/RODO Compliance

### Right to Erasure (Article 17 GDPR)

Users have the right to request deletion of their personal data. This system implements:

- **Manual Deletion**: Users can request deletion at any time through settings
- **3-Day Grace Period**: Users can cancel deletion within 3 days
- **Confirmation Flow**: Multi-step confirmation prevents accidental deletion
- **Email Notifications**: Users receive confirmation emails with undo links

### Data Retention Policy

**Retained Data** (for legal/accounting purposes):
- User ID (for audit trail)
- Financial records (wallet balance, transactions, invoices)
- Transaction history
- Payment records

**Deleted Data**:
- Personal information (name, email, phone, address, NIP)
- Cognito user account (allows re-registration)
- Photographer's galleries without delivered orders
- Clients and packages (photographer-specific data)
- S3 originals/previews/thumbs (photographer's work files)

**Preserved Data** (for client access):
- Galleries with delivered orders (remain accessible to clients)
- Gallery finals (until gallery expires naturally)
- Orders (associated with preserved galleries)
- Clients (separate entities, not deleted)

### Inactivity Auto-Deletion (GDPR/RODO)

To comply with data minimization principles, inactive accounts are automatically deleted:

- **11 Months Inactivity**: First reminder email sent
- **12 Months Inactivity**: Final warning email + deletion scheduled for 30 days
- **Login Cancels Deletion**: Any login during the 30-day period cancels deletion
- **Automatic Cleanup**: After 30 days, account is deleted automatically

## User Flows

### Manual Deletion Flow

1. **User Requests Deletion**
   - Navigates to Settings → "Delete Account"
   - Clicks "Delete Account" button

2. **Confirmation Modal**
   - Displays consequences of deletion
   - Requires checkbox: "I understand this is permanent"
   - Requires typing confirmation phrase: "Potwierdzam"
   - Requires email input (pre-filled, editable)

3. **Deletion Scheduled**
   - User status set to `pendingDeletion`
   - `deletionScheduledAt` set to 3 days from now
   - EventBridge schedule created for deletion
   - Confirmation email sent with undo link

4. **During 3-Day Period**
   - User can log in and see deletion status banner
   - Banner shows deletion date, consequences, and undo button
   - User can cancel deletion via:
     - Undo button in settings (logs out user)
     - Undo link from email (shows confirmation page)

5. **After 3 Days**
   - `PerformUserDeletion` Lambda executes automatically
   - User data is soft-deleted
   - Cognito user is deleted
   - Final confirmation email sent

### Inactivity Auto-Deletion Flow

1. **Daily Scan** (2 AM UTC)
   - `InactivityScanner` Lambda scans all active users
   - Checks `lastLoginAt` field

2. **11 Months Inactive** (between 11-12 months)
   - Calculates days until deletion warning
   - Sends reminder email via `createInactivityReminderEmail()`
   - No action taken (user can still log in)
   - User status remains `active`

3. **12 Months Inactive** (12+ months)
   - Checks if already scheduled (skips if `status === 'pendingDeletion'`)
   - Sends final warning email via `createInactivityFinalWarningEmail()`
   - Sets `status = "pendingDeletion"`
   - Sets `deletionScheduledAt = now + 30 days` (ISO timestamp)
   - Sets `deletionReason = "inactivity"`
   - Sets `deletionRequestedAt = now`
   - Creates EventBridge schedule for deletion (30 days from now)

4. **30-Day Grace Period**
   - User can log in to cancel deletion
   - PostAuthentication trigger detects `status === 'pendingDeletion'` and `deletionReason === 'inactivity'`
   - Cancels EventBridge schedule via `cancelUserDeletionSchedule()`
   - User status restored to `active`
   - Deletion fields cleared: `deletionScheduledAt`, `deletionReason`, `deletionRequestedAt`, `undoToken`
   - **Note**: Manual deletions are NOT cancelled on login (only inactivity-based)

5. **After 30 Days**
   - EventBridge Scheduler invokes `PerformUserDeletion` Lambda
   - Lambda receives event: `{ userId }`
   - Account deleted automatically
   - Final confirmation email sent

## Technical Implementation

### Data Model

**User Table Fields**:
```typescript
{
  userId: string;                    // Preserved for audit (Cognito sub)
  status: 'active' | 'pendingDeletion' | 'deleted';
  deletionScheduledAt?: string;      // ISO timestamp (when deletion will execute)
  deletionReason?: 'manual' | 'inactivity';
  deletionRequestedAt?: string;       // ISO timestamp (when deletion was requested)
  lastLoginAt?: string;               // ISO timestamp (for inactivity tracking, updated by PostAuthentication)
  undoToken?: string;                 // Secure token for undo link (32-byte hex, generated via crypto.randomBytes)
  deletedAt?: string;                 // ISO timestamp (set when deletion completes)
  createdAt?: string;                 // ISO timestamp (preserved on deletion)
  updatedAt?: string;                 // ISO timestamp (updated on changes)
  // PII fields nullified on deletion:
  businessName: null;
  email: 'deleted_user_{userId}@deleted.example.com';
  contactEmail: 'deleted_user_{userId}@deleted.example.com';
  phone: null;
  address: null;
  nip: null;
}
```

### Deletion Process

**PerformUserDeletion Lambda** executes the following steps:

1. **Verify Deletion Status**
   - Confirms user is still `pendingDeletion`
   - Loads user data
   - Returns error if user not found or not pending deletion

2. **Process Galleries**
   - Queries galleries by `ownerId` using GSI `ownerId-index`
   - For each gallery:
     - **Galleries WITHOUT delivered orders**: Fully deleted using `deleteGallery()` function
       - Deletes gallery record, orders, images, and all S3 objects (including finals)
     - **Galleries WITH delivered orders**: 
       - Preserved (gallery record remains)
       - `ownerEmail` denormalized to gallery record (for expiration emails)
       - Only originals/previews/thumbs/bigthumbs deleted from S3
       - Finals remain until gallery expires naturally via EventBridge Scheduler

3. **Delete S3 Objects for Preserved Galleries**
   - For preserved galleries only: Deletes `originals/`, `previews/`, `thumbs/`, `bigthumbs/` prefixes
   - Uses batch deletion (1000 objects per batch, 5 parallel batches)
   - **DO NOT DELETE**: `final/` prefix (clients need access)
   - Stops deletion if approaching Lambda timeout (14 minutes safety margin)

4. **Delete Packages**
   - Queries packages by `ownerId` using GSI `ownerId-index`
   - Deletes all photographer's pricing packages
   - Packages are photographer-specific configurations

5. **Preserve Clients**
   - Clients are NOT deleted (separate entities, not photographer accounts)
   - Clients can continue accessing their galleries via gallery links
   - Client records remain in Clients table

6. **Create Forced Payout Transaction**
   - Transaction type: `FORCED_PAYOUT_UPON_DELETION`
   - Transaction ID format: `forcedPayoutUponDeletion_{userId}_{timestamp}`
   - Status: `PAID`
   - Clears wallet balance to 0
   - Creates ledger entry with type `FORCED_PAYOUT`
   - Amount: negative wallet balance (debit)
   - Allows claiming unused funds per T&C

7. **Soft Delete User**
   - Nullify all PII fields: `businessName`, `phone`, `address`, `nip`
   - Set email to `deleted_user_{userId}@deleted.example.com`
   - Set `contactEmail` to same deleted email
   - Set `status = "deleted"`
   - Set `deletedAt` timestamp
   - Preserve `userId`, `createdAt`, transaction references

8. **Delete Cognito User**
   - Uses `AdminDeleteUser` command
   - Username: `userId` (Cognito sub attribute)
   - Allows user to re-register with same email
   - Continues even if Cognito deletion fails (logs error)

9. **Cancel EventBridge Schedule**
   - Cancels user deletion schedule using `cancelUserDeletionSchedule()`
   - Schedule name: `user-deletion-{userId}`
   - Does NOT cancel gallery expiry schedules
   - Continues even if schedule cancellation fails (may not exist)

10. **Send Final Email**
    - Confirmation email sent to preserved email address (before deletion)
    - Uses `createDeletionCompletedEmail()` template
    - Continues even if email fails (logs error)

11. **Audit Logging**
    - Full audit trail logged to CloudWatch
    - Includes: galleries deleted/preserved, S3 objects deleted, packages deleted, deletion reason, timestamps

### EventBridge Scheduler

**User Deletion Schedules**:
- Schedule Name Format: `user-deletion-{userId}` (generated by `getUserDeletionScheduleName()`)
- Created dynamically via `createUserDeletionSchedule()` function
- One-time schedule at `deletionScheduledAt` (ISO timestamp)
- Schedule Expression: `at(yyyy-mm-ddThh:mm:ss)` format (UTC, no milliseconds)
- Minimum schedule time: 1 minute in the future (EventBridge requirement)
- If deletion time is in the past or < 1 minute away, schedules for 1 minute from now
- Target: PerformUserDeletion Lambda ARN
- Payload: `{ userId }` (JSON stringified)
- Flexible Time Window: `OFF` (exact timing)
- Dead Letter Queue: Optional DLQ ARN (if provided)
- Handles conflicts: If schedule exists, deletes and recreates it

**Inactivity Scanner Schedule**:
- **NOT CURRENTLY CONFIGURED** - needs EventBridge Rule in CDK stack
- Recommended: Daily cron `cron(0 2 * * ? *)` (2 AM UTC)
- Target: InactivityScanner Lambda
- Should be configured as EventBridge Rule (not EventBridge Scheduler)

### Cognito Post-Authentication Trigger

**⚠️ IMPORTANT: The Post Authentication trigger is NOT currently configured in the CDK stack.**

**PostAuthentication Lambda**:
- Entry: `backend/functions/auth/postAuthentication.ts`
- Updates `lastLoginAt` on every successful login
- Extracts `userId` from Cognito event (`request.userAttributes.sub` or `userName`)
- Creates user record if it doesn't exist (with `createdAt`)
- Preserves existing user fields when updating
- Auto-cancels inactivity deletions on login:
  - Checks if `status === 'pendingDeletion'` and `deletionReason === 'inactivity'`
  - Sets `status = 'active'`
  - Clears deletion fields: `deletionScheduledAt`, `deletionReason`, `deletionRequestedAt`, `undoToken`
  - Cancels EventBridge schedule via `cancelUserDeletionSchedule()`
- Does NOT cancel manual deletions (only inactivity-based)
- Returns event unchanged (Cognito requirement)
- Never throws errors (returns event even on failure to avoid breaking auth flow)

## API Endpoints

### User-Facing Endpoints

**`POST /auth/request-deletion`**
- Route: `/auth/request-deletion`
- Initiates deletion request
- Requires: `{ email: string, confirmationPhrase: string }`
- Confirmation phrase must be exactly `"Potwierdzam"` (validated server-side)
- Returns: `{ deletionScheduledAt: string, status: string }`
- Reads configuration from SSM Parameter Store:
  - `UserDeletionLambdaArn`, `UserDeletionScheduleRoleArn`, `UserDeletionDlqArn`
  - Falls back to environment variables if SSM parameters not found
- Creates EventBridge schedule for deletion (3 days from now)
- Sends confirmation email with undo link

**`POST /auth/cancel-deletion`**
- Route: `/auth/cancel-deletion`
- Cancels pending deletion
- Requires: Authenticated user
- Returns: `{ message: string }`
- Cancels EventBridge schedule
- Restores user status to `active`
- Clears deletion fields: `deletionScheduledAt`, `deletionReason`, `deletionRequestedAt`, `undoToken`
- Sends cancellation email
- **Note**: Does NOT log user out (documentation was incorrect)

**`GET /auth/deletion-status`**
- Route: `/auth/deletion-status`
- Returns current deletion status
- Requires: Authenticated user
- Returns: `{ status: string, deletionScheduledAt?: string, deletionReason?: string }`
- Status values: `'active'`, `'pendingDeletion'`, `'deleted'`

**`GET /auth/undo-deletion/:token`**
- Route: `/auth/undo-deletion/:token`
- Public endpoint (no authentication required) for email undo links
- Validates token by scanning Users table for matching `undoToken`
- Checks if deletion time has elapsed (returns error if already processed)
- Cancels EventBridge schedule
- Restores user status to `active`
- Clears deletion fields
- Sends cancellation email
- Returns HTML confirmation page with link to login

### Development Endpoints (Dev/Staging Only)

**`POST /auth/dev/set-last-login/:userId`**
- Sets user's `lastLoginAt` for testing
- Body: `{ lastLoginAt: number | string }` (months ago or ISO date)

**`POST /auth/dev/trigger-deletion/:userId`**
- Triggers deletion immediately or schedules it
- Body: `{ immediate?: boolean, minutesFromNow?: number }`

**`POST /auth/dev/trigger-inactivity-scanner`**
- Route: `/auth/dev/trigger-inactivity-scanner` (via dev routes)
- Manually triggers inactivity scanner Lambda
- Only available in dev/staging (production check)
- Invokes InactivityScanner Lambda synchronously
- Returns scanner results: `{ message: string, result: { usersProcessed, remindersSent, warningsSent, deletionsScheduled } }`

## Frontend Components

### Settings Page Integration

**Delete Account Section**:
- Shows "Delete Account" button (hidden when pending deletion)
- Shows `DeletionPendingBanner` when `status === "pendingDeletion"`
- Banner displays:
  - Deletion date and days remaining
  - Consequences reminder
  - Undo button

**DeleteAccountModal**:
- Confirmation modal with:
  - Warning message and consequences
  - Checkbox: "I understand this is permanent"
  - Input requiring "Potwierdzam"
  - Email input (pre-filled)

### Dev Tools Page

**`/dev/test-user-deletion`**:
- Set Last Login: Simulate inactivity (months ago or specific date)
- Trigger Deletion: Immediate (1 min) or scheduled (3 days)
- Trigger Scanner: Manually run inactivity scanner
- Status Display: Shows current deletion status

## Data Retention Details

### What Gets Deleted

1. **Cognito User**
   - Complete removal allows re-registration

2. **Personal Information**
   - `businessName` → `null`
   - `contactEmail` → `deleted_user_{userId}@deleted.example.com`
   - `phone` → `null`
   - `address` → `null`
   - `nip` → `null`

3. **Galleries Without Delivered Orders**
   - Entire gallery deleted (record, orders, images, S3 objects)
   - Reason: Clients can't submit proofs after photographer account deletion

4. **S3 Objects (for preserved galleries)**
   - `galleries/{galleryId}/originals/` → Deleted
   - `galleries/{galleryId}/previews/` → Deleted
   - `galleries/{galleryId}/thumbs/` → Deleted
   - `galleries/{galleryId}/bigthumbs/` → Deleted
   - `galleries/{galleryId}/final/` → **Preserved** (clients need access)

5. **Packages**
   - All photographer's pricing packages deleted

### What Gets Preserved

1. **User Record**
   - `userId` preserved (for audit trail)
   - `createdAt` preserved
   - Transaction references preserved
   - Status set to `deleted`

2. **Financial Records**
   - Wallet balance (cleared to 0 via transaction)
   - All transactions preserved
   - Wallet ledger entries preserved
   - Payment records preserved

3. **Galleries With Delivered Orders**
   - Gallery record preserved
   - `ownerEmail` denormalized (for expiration emails)
   - Orders preserved
   - Final images preserved (until gallery expires)
   - EventBridge expiry schedules continue

4. **Clients**
   - Clients are separate entities (not photographer accounts)
   - Clients remain accessible
   - Clients can continue accessing their galleries

## Edge Cases

### Undo After Time Elapsed

- If user tries to undo after `deletionScheduledAt` has passed:
  - Check performed server-side in `/auth/undo-deletion/:token` endpoint
  - Compares `deletionScheduledAt` with current time
  - Returns error: "Deletion has already been processed"
  - Returns HTTP 400 with error message and deletion date
  - **Note**: No support contact information currently provided (could be added)

### Undo During Login

- User logs in during deletion period:
  - Sees deletion status banner (if `status === 'pendingDeletion'`)
  - Clicks undo button (calls `/auth/cancel-deletion`)
  - **Note**: System does NOT log user out (documentation was incorrect)
  - Deletion cancelled (EventBridge schedule cancelled, status restored to `active`)
  - User remains logged in with full access

### Undo Via Email Link

- User clicks undo link from email:
  - Token validated
  - Deletion cancelled
  - HTML confirmation page shown
  - Link to login page provided

### Gallery Expiration After User Deletion

- Gallery expiration continues normally:
  - EventBridge Scheduler handles expiration independently
  - Expiration emails sent to `gallery.ownerEmail` (preserved)
  - `deleteGallery` function handles cleanup including finals

### Multiple Undo Attempts

- System handles gracefully:
  - Token validated each time via scan of Users table
  - If user status is not `pendingDeletion`, returns 400 error: "No pending deletion to cancel"
  - If deletion time has elapsed, returns 400 error: "Deletion has already been processed"
  - If token is invalid/expired, returns 404 error: "Invalid or expired token"
  - Cancellation is idempotent (cancelling schedule multiple times is safe)

## Security Considerations

### Undo Token

- Generated using `crypto.randomBytes(32).toString('hex')`
- Stored in user record (expires with deletion time)
- Single-use (deleted after successful undo)
- Validated server-side

### Authorization

- All deletion endpoints require authentication
- User can only delete their own account
- Dev endpoints only available in dev/staging (production check)

### Rate Limiting

- Consider adding rate limiting to prevent abuse
- Current implementation relies on authentication checks

## Audit Logging

All deletion actions are logged with:

- `userId`
- `action`: `'deletion_requested' | 'deletion_cancelled' | 'deletion_completed' | 'inactivity_reminder_sent' | 'inactivity_warning_sent'`
- `trigger`: `'manual' | 'inactivity'`
- `timestamp`
- `deletionScheduledAt`
- `undoToken` (hashed for security)

**Storage**: CloudWatch Logs (via existing logger)

## Testing

### Development Tools

Access dev tools at `/dev/test-user-deletion`:

1. **Simulate Inactivity**
   - Set `lastLoginAt` to 12 months ago
   - Trigger scanner → Should schedule deletion
   - Set `lastLoginAt` to 11 months ago
   - Trigger scanner → Should send reminder

2. **Test Immediate Deletion**
   - Click "Usuń natychmiast" → Deletion runs in ~1 minute
   - Check settings → Should show deletion status

3. **Test Undo Flow**
   - Trigger deletion
   - Use undo link/button → Should cancel and restore

### Manual Testing Checklist

- [ ] Request deletion → Verify schedule created
- [ ] Undo before 3 days → Verify schedule cancelled
- [ ] Wait 3 days → Verify deletion executed
- [ ] Verify galleries without delivered orders deleted
- [ ] Verify galleries with delivered orders preserved
- [ ] Verify Cognito user deleted
- [ ] Verify soft delete (PII nullified, status = deleted)
- [ ] Verify forced payout transaction created
- [ ] Test inactivity flow (11/12 months)
- [ ] Test undo after time elapsed (graceful error)
- [ ] Test login cancels inactivity deletion

## Email Templates

### Deletion Request Confirmation
- Subject: "Potwierdzenie prośby o usunięcie konta"
- Includes: Deletion date, consequences, undo link

### Deletion Cancelled
- Subject: "Usunięcie konta zostało anulowane"
- Sent when user cancels deletion

### Deletion Completed
- Subject: "Twoje konto zostało usunięte"
- Sent after successful deletion

### Inactivity Reminder (11 months)
- Subject: "Twoje konto jest nieaktywne"
- Includes: Days until deletion warning

### Inactivity Final Warning (12 months)
- Subject: "🚨 OSTATNIE OSTRZEŻENIE: Twoje konto zostanie usunięte"
- Includes: Deletion date (30 days from now)

## Infrastructure

### Lambda Functions

**⚠️ IMPORTANT: These Lambda functions are NOT currently defined in the CDK stack (`infra/lib/app-stack.ts`). They need to be added to complete the user deletion system.**

**Note**: There are **multiple Lambda functions** involved in the user deletion system, but only **ONE Lambda performs the actual deletion** (`PerformUserDeletion`). The others are supporting functions.

1. **PerformUserDeletion** (Main Deletion Lambda)
   - Entry: `backend/functions/users/performUserDeletion.ts`
   - Memory: 1024 MB (recommended, not currently configured)
   - Timeout: 15 minutes (recommended, not currently configured)
   - Triggered by: EventBridge Scheduler (one-time schedules)
   - Required Permissions:
     - DynamoDB: Read/Write access to Users, Galleries, Orders, Packages, Images, Wallets, WalletLedger, Transactions tables
     - S3: Read/Write access to galleries bucket
     - Cognito: `AdminDeleteUser` permission
     - SES: `SendEmail` permission
     - EventBridge Scheduler: `scheduler:DeleteSchedule` permission
     - SSM: Read access to `/PhotoHub/{stage}/*` parameters
   - Environment Variables:
     - `USERS_TABLE`, `GALLERIES_TABLE`, `ORDERS_TABLE`, `PACKAGES_TABLE`, `IMAGES_TABLE`
     - `WALLETS_TABLE`, `WALLET_LEDGER_TABLE`, `TRANSACTIONS_TABLE`
     - `BUCKET_NAME`, `COGNITO_USER_POOL_ID`, `SENDER_EMAIL`
     - `STAGE` (for SSM parameter reading)

2. **InactivityScanner** (Supporting Lambda - Scans and Schedules)
   - Entry: `backend/functions/users/inactivityScanner.ts`
   - Memory: 256 MB (recommended, not currently configured)
   - Timeout: 5 minutes (recommended, not currently configured)
   - Scheduled: Daily at 2 AM UTC (EventBridge Rule, not currently configured)
   - **Purpose**: Scans for inactive users and schedules deletions (does NOT perform deletion)
   - Required Permissions:
     - DynamoDB: Read/Write access to Users table
     - SES: `SendEmail` permission
     - EventBridge Scheduler: `scheduler:CreateSchedule`, `scheduler:DeleteSchedule`, `scheduler:GetSchedule`, `scheduler:UpdateSchedule` permissions
     - IAM: `iam:PassRole` permission for EventBridge Scheduler role
     - SSM: Read access to `/PhotoHub/{stage}/*` parameters
   - Environment Variables:
     - `USERS_TABLE`, `SENDER_EMAIL`, `STAGE`
     - `USER_DELETION_LAMBDA_ARN` (ARN of PerformUserDeletion Lambda)
     - `USER_DELETION_SCHEDULE_ROLE_ARN` (IAM role ARN for EventBridge Scheduler)
     - `USER_DELETION_DLQ_ARN` (Dead Letter Queue ARN)

3. **PostAuthentication** (Supporting Lambda - Tracks Logins)
   - Entry: `backend/functions/auth/postAuthentication.ts`
   - Memory: 256 MB
   - Timeout: 10 seconds
   - Triggered by: Cognito Post Authentication event (configured manually after deployment - see [Post-Deployment Configuration](#post-deployment-configuration))
   - **Purpose**: Updates `lastLoginAt` and cancels inactivity-based deletions on login (does NOT perform deletion)
   - Required Permissions:
     - DynamoDB: Read/Write access to Users table
     - EventBridge Scheduler: `scheduler:DeleteSchedule` permission
     - Cognito: Permission to be invoked by Cognito (`AllowCognitoInvoke` with `userpool/*` pattern)
     - SSM: Read access to `/PhotoHub/{stage}/*` parameters (if needed)
   - Environment Variables:
     - `USERS_TABLE`, `STAGE`
   - **CDK Output**: `PostAuthenticationLambdaArn` - Use this ARN to configure the Cognito trigger

**Summary**: 
- **1 Lambda performs deletion**: `PerformUserDeletion` (the only one that actually deletes user data)
- **2 Supporting Lambdas**: `InactivityScanner` (schedules deletions) and `PostAuthentication` (tracks logins, cancels inactivity deletions)

### EventBridge Schedules

**⚠️ IMPORTANT: These schedules are NOT currently configured in the CDK stack.**

- **User Deletion**: One-time schedules per user
  - Schedule Name Format: `user-deletion-{userId}`
  - Created dynamically via `createUserDeletionSchedule()` function
  - Schedule Expression: `at(yyyy-mm-ddThh:mm:ss)` (UTC)
  - Target: PerformUserDeletion Lambda
  - Flexible Time Window: `OFF` (exact timing)
  - Dead Letter Queue: UserDeletionDLQ (if configured)

- **Inactivity Scanner**: Daily cron schedule
  - Schedule Expression: `cron(0 2 * * ? *)` (2 AM UTC daily)
  - Target: InactivityScanner Lambda
  - **NOT CURRENTLY CONFIGURED** - needs EventBridge Rule in CDK stack

### Dead Letter Queues

**⚠️ IMPORTANT: This DLQ is NOT currently defined in the CDK stack.**

- **UserDeletionDLQ**: Failed user deletion schedule executions
  - Queue Name: `PhotoHub-{stage}-UserDeletionDLQ`
  - Encryption: SQS Managed
  - Retention: 14 days
  - Visibility Timeout: Should be longer than Lambda timeout (15+ minutes)

### IAM Roles

**⚠️ IMPORTANT: This role is NOT currently defined in the CDK stack.**

- **UserDeletionScheduleRole**: IAM role for EventBridge Scheduler to invoke PerformUserDeletion Lambda
  - Trust Policy: `scheduler.amazonaws.com`
  - Permissions: `lambda:InvokeFunction` on PerformUserDeletion Lambda
  - ARN stored in SSM: `/PhotoHub/{stage}/UserDeletionScheduleRoleArn`

### SSM Parameters

**⚠️ IMPORTANT: These SSM parameters are NOT currently created in the CDK stack. They need to be added.**

The following SSM parameters are read at runtime by the Lambda functions:

- `/PhotoHub/{stage}/UserDeletionLambdaArn` - ARN of PerformUserDeletion Lambda
- `/PhotoHub/{stage}/UserDeletionScheduleRoleArn` - ARN of IAM role for EventBridge Scheduler
- `/PhotoHub/{stage}/UserDeletionDlqArn` - ARN of Dead Letter Queue
- `/PhotoHub/{stage}/SenderEmail` - SES sender email (already exists)
- `/PhotoHub/{stage}/PublicDashboardUrl` - Dashboard URL for undo links (already exists)

### Cognito Configuration

**⚠️ IMPORTANT: The Post Authentication trigger is NOT automatically configured in the CDK stack to avoid circular dependencies.**

- Post Authentication Lambda trigger must be configured **manually after deployment** (see [Post-Deployment Configuration](#post-deployment-configuration) section)
- Lambda function: PostAuthentication Lambda ARN (available in stack outputs as `PostAuthenticationLambdaArn`)
- This trigger updates `lastLoginAt` and cancels inactivity-based deletions on login
- **CDK Output**: `PostAuthenticationLambdaArn` - Use this ARN to configure the trigger

## Related Documentation

- [Authentication Architecture](./authentication-architecture.md)
- [Payment Integration](./stripe-payment-integration.md)
- [Gallery Expiration](./three-tier-image-optimization-strategy.md)

## Notes

- **Gallery Finals**: No TTL needed - existing gallery expiration (EventBridge Scheduler) handles deletion of finals when gallery expires
- **Confirmation Phrase**: Hardcoded "Potwierdzam" (Polish) as per user preference, validated server-side
- **Undo Token**: Stored in DynamoDB user record, generated via `crypto.randomBytes(32).toString('hex')`, single-use
- **User Status**: Three states: `active`, `pendingDeletion`, `deleted`
- **Last Login Tracking**: Implemented via Cognito Post Authentication trigger (configured manually after deployment - see [Post-Deployment Configuration](#post-deployment-configuration))
- **Gallery Preservation**: Galleries with delivered orders are NOT deleted to ensure:
  - Clients can continue accessing their galleries
  - Gallery expiration continues automatically via EventBridge Scheduler
  - Gallery expiration emails work via preserved `ownerEmail` in gallery records
- **SSM Parameter Store**: Configuration values are read from SSM at runtime (allows changes without redeployment)
- **Error Handling**: All deletion steps continue even if individual steps fail (e.g., Cognito deletion, email sending)
- **S3 Deletion**: Uses batch deletion with timeout protection (stops at 14 minutes to avoid Lambda timeout)

## Infrastructure Status

**✅ COMPLETED**: The following infrastructure components are now defined in the CDK stack (`infra/lib/app-stack.ts`):

1. **Lambda Functions**:
   - ✅ PerformUserDeletion Lambda
   - ✅ InactivityScanner Lambda  
   - ✅ PostAuthentication Lambda

2. **EventBridge Rule**:
   - ✅ Daily schedule for InactivityScanner (2 AM UTC)

3. **Dead Letter Queue**:
   - ✅ UserDeletionDLQ for failed deletion schedule executions

4. **IAM Role**:
   - ✅ UserDeletionScheduleRole for EventBridge Scheduler to invoke PerformUserDeletion Lambda

5. **SSM Parameters**:
   - ✅ `/PhotoHub/{stage}/UserDeletionLambdaArn`
   - ✅ `/PhotoHub/{stage}/UserDeletionScheduleRoleArn`
   - ✅ `/PhotoHub/{stage}/UserDeletionDlqArn`

6. **Cognito Configuration**:
   - ⚠️ Post Authentication Lambda trigger on User Pool (configured manually after deployment to avoid circular dependencies)
   - See [Post-Deployment Configuration](#post-deployment-configuration) for setup instructions

**Post-Deployment Steps Required:**
- Configure Cognito Post Authentication trigger (see [Post-Deployment Configuration](#post-deployment-configuration))

## Post-Deployment Configuration

### Cognito Post Authentication Trigger

**⚠️ IMPORTANT**: The Post Authentication Lambda trigger must be configured manually after stack deployment. This is done to avoid circular dependency issues in CDK when modifying the User Pool after it has been created and referenced by other resources.

#### Why Manual Configuration?

CDK creates a circular dependency when trying to modify the User Pool (to add the Lambda trigger) after it has already been:
- Referenced in environment variables
- Used by the API Gateway authorizer
- Referenced by other Lambda functions

To avoid this, the Lambda function is created without the Cognito invoke permission (which would cause circular dependencies). When you configure the trigger via AWS Console or CLI, AWS automatically grants Cognito permission to invoke the Lambda function.

#### Configuration Methods

**Method 1: AWS Console**

**Based on current AWS Console UI structure:**

1. Navigate to AWS Cognito Console: https://console.aws.amazon.com/cognito/
2. Click **User pools** in the left sidebar
3. Click on your User Pool (e.g., `PhotographersUserPool8CFAD7E2-ZEWHODIIODLN`)
4. In the left sidebar, look under **Authentication** section
5. Click on **Extensions** (Lambda triggers are typically under Extensions)
6. You should see a list of Lambda triggers including:
   - Post authentication
7. Find **Post authentication** in the list
8. Click **Edit** or select the dropdown next to it
9. Choose your Lambda function: `PhotoHub-dev-PostAuthenticationFn` (or paste the ARN from stack outputs)
10. Click **Save changes**

**If Extensions doesn't show Lambda triggers:**
- Try looking under **Settings** → Some console versions have Lambda triggers there
- Or use **Method 2 (AWS CLI)** below - it's more reliable and works regardless of UI changes

**⚠️ Recommended: Use AWS CLI Instead**
The AWS Console UI changes frequently and Lambda triggers can be hard to find. **Method 2 (AWS CLI)** below is more reliable and faster.

**Method 2: AWS CLI (Recommended if Console UI is unclear)**

```bash
# Get the Lambda ARN from stack outputs
LAMBDA_ARN=$(aws cloudformation describe-stacks \
  --stack-name PhotoHub-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`PostAuthenticationLambdaArn`].OutputValue' \
  --output text)

# Get the User Pool ID from stack outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name PhotoHub-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Configure the trigger
# ⚠️ IMPORTANT: Always include --auto-verified-attributes to prevent resetting email verification!
# Without this, ResendConfirmationCode will fail with "Auto verification not turned on"
aws cognito-idp update-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --lambda-config "PostAuthentication=$LAMBDA_ARN" \
  --auto-verified-attributes email
```

**Quick One-Liner (Easiest - Copies values automatically):**

```bash
# Configure Post Authentication trigger in one command (automatically gets values from stack)
# ⚠️ IMPORTANT: Always include --auto-verified-attributes to prevent resetting email verification!
aws cognito-idp update-user-pool \
  --user-pool-id $(aws cloudformation describe-stacks --stack-name PhotoHub-dev --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text) \
  --lambda-config "PostAuthentication=$(aws cloudformation describe-stacks --stack-name PhotoHub-dev --query 'Stacks[0].Outputs[?OutputKey==`PostAuthenticationLambdaArn`].OutputValue' --output text)" \
  --auto-verified-attributes email
```

This one-liner automatically:
1. Gets the User Pool ID from your stack outputs
2. Gets the Lambda ARN from your stack outputs  
3. Configures the Post Authentication trigger

**Method 3: Using CDK Outputs**

After deploying the stack, CDK outputs include `PostAuthenticationLambdaArn`:

```bash
# View all outputs
cdk outputs

# Or get specific output
aws cloudformation describe-stacks \
  --stack-name PhotoHub-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`PostAuthenticationLambdaArn`]'
```

#### Verification

Verify the trigger is configured correctly:

```bash
# Check User Pool Lambda configuration
aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --query 'UserPool.LambdaConfig.PostAuthentication'
```

Expected output should show the Lambda ARN:
```
arn:aws:lambda:REGION:ACCOUNT:function:PhotoHub-dev-PostAuthenticationFn
```

#### Testing

After configuration, test the trigger:

1. Log in to the application with a test user
2. Check CloudWatch Logs for the PostAuthentication Lambda function
3. Verify logs show:
   - `lastLoginAt` being updated
   - If user was pending inactivity deletion, it should be cancelled

#### Troubleshooting

**Can't find Lambda triggers in Console:**
- AWS Console UI changes frequently - try different tabs: **Sign-in experience**, **App integration**, or look for **Lambda triggers** in the left sidebar
- Use AWS CLI method instead (Method 2) - it's more reliable and works regardless of UI changes
- You can also use AWS CloudShell in the console to run CLI commands directly

**Trigger not working:**
- Verify Lambda ARN is correct in User Pool configuration
- AWS automatically grants Cognito permission to invoke the Lambda when you configure the trigger
- Verify Lambda function is in the same region as User Pool
- Check CloudWatch Logs for Lambda errors
- If permission errors occur, verify the trigger was configured correctly (AWS should have granted permission automatically)

**Permission errors:**
- AWS Cognito automatically grants the Lambda invoke permission when you configure the trigger via Console or CLI
- If you see permission errors, reconfigure the trigger via AWS CLI (Method 2) - this will re-grant the permission
- Verify the Lambda function exists and is in the same region as the User Pool
- Check Lambda function's resource policy: `aws lambda get-policy --function-name PhotoHub-dev-PostAuthenticationFn`

**Circular dependency during deployment:**
- If you see circular dependency errors, ensure you're NOT modifying the User Pool in CDK after it's been created
- Use manual configuration instead (as documented above)

**Quick CLI Setup (Recommended):**

If you can't find the Lambda triggers in the console, use this one-liner:

```bash
# Configure Post Authentication trigger in one command
# ⚠️ IMPORTANT: Always include --auto-verified-attributes to prevent resetting email verification!
aws cognito-idp update-user-pool \
  --user-pool-id $(aws cloudformation describe-stacks --stack-name PhotoHub-dev --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text) \
  --lambda-config "PostAuthentication=$(aws cloudformation describe-stacks --stack-name PhotoHub-dev --query 'Stacks[0].Outputs[?OutputKey==`PostAuthenticationLambdaArn`].OutputValue' --output text)" \
  --auto-verified-attributes email
```

