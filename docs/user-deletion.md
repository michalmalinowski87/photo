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

2. **11 Months Inactive**
   - Sends reminder email
   - No action taken (user can still log in)

3. **12 Months Inactive**
   - Sends final warning email
   - Sets `status = "pendingDeletion"`
   - Sets `deletionScheduledAt = now + 30 days`
   - Creates EventBridge schedule for deletion

4. **30-Day Grace Period**
   - User can log in to cancel deletion
   - PostAuthentication trigger cancels deletion on login
   - User status restored to `active`

5. **After 30 Days**
   - `PerformUserDeletion` Lambda executes
   - Account deleted automatically

## Technical Implementation

### Data Model

**User Table Fields**:
```typescript
{
  userId: string;                    // Preserved for audit
  status: 'active' | 'pendingDeletion' | 'deleted';
  deletionScheduledAt?: string;      // ISO timestamp
  deletionReason?: 'manual' | 'inactivity';
  deletionRequestedAt?: string;       // ISO timestamp
  lastLoginAt?: string;               // ISO timestamp (for inactivity tracking)
  undoToken?: string;                 // Secure token for undo link
  // PII fields nullified on deletion:
  businessName: null;
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

2. **Process Galleries**
   - **Galleries WITHOUT delivered orders**: Fully deleted (using `deleteGallery` function)
   - **Galleries WITH delivered orders**: 
     - Preserved (gallery record remains)
     - `ownerEmail` denormalized (for expiration emails)
     - Only originals/previews/thumbs deleted from S3
     - Finals remain until gallery expires naturally

3. **Delete S3 Objects**
   - For preserved galleries: Delete `originals/`, `previews/`, `thumbs/`, `bigthumbs/`
   - **DO NOT DELETE**: `final/` (clients need access)

4. **Delete Packages**
   - All photographer's pricing packages deleted

5. **Preserve Clients**
   - Clients are NOT deleted (separate entities)
   - Clients can continue accessing their galleries

6. **Create Forced Payout Transaction**
   - Transaction type: `FORCED_PAYOUT_UPON_DELETION`
   - Clears wallet balance to 0
   - Creates ledger entry
   - Allows claiming unused funds per T&C

7. **Soft Delete User**
   - Nullify all PII fields
   - Set email to `deleted_user_{userId}@deleted.example.com`
   - Set `status = "deleted"`
   - Preserve `userId`, `createdAt`, transaction references

8. **Delete Cognito User**
   - `AdminDeleteUser` command
   - Allows user to re-register with same email

9. **Cancel EventBridge Schedule**
   - Cancels user deletion schedule (not gallery schedules)

10. **Send Final Email**
    - Confirmation email sent to preserved email address

11. **Audit Logging**
    - Full audit trail logged to CloudWatch

### EventBridge Scheduler

**User Deletion Schedules**:
- Format: `user-deletion-{userId}`
- One-time schedule at `deletionScheduledAt`
- Invokes `PerformUserDeletion` Lambda
- Payload: `{ userId }`

**Inactivity Scanner Schedule**:
- Daily cron: `0 2 * * ? *` (2 AM UTC)
- Invokes `InactivityScanner` Lambda

### Cognito Post-Authentication Trigger

**PostAuthentication Lambda**:
- Updates `lastLoginAt` on every successful login
- Auto-cancels inactivity deletions on login
- Restores user status to `active`

## API Endpoints

### User-Facing Endpoints

**`POST /auth/request-deletion`**
- Initiates deletion request
- Requires: `{ email: string }` (confirmation phrase validated server-side)
- Returns: `{ deletionScheduledAt: string, status: string }`

**`POST /auth/cancel-deletion`**
- Cancels pending deletion
- Requires: Authenticated user
- Returns: `{ message: string }`
- Logs user out after cancellation

**`GET /auth/deletion-status`**
- Returns current deletion status
- Returns: `{ status: string, deletionScheduledAt?: string, deletionReason?: string }`

**`GET /auth/undo-deletion/:token`**
- Public endpoint for email undo links
- Validates token and cancels deletion
- Returns HTML confirmation page

### Development Endpoints (Dev/Staging Only)

**`POST /auth/dev/set-last-login/:userId`**
- Sets user's `lastLoginAt` for testing
- Body: `{ lastLoginAt: number | string }` (months ago or ISO date)

**`POST /auth/dev/trigger-deletion/:userId`**
- Triggers deletion immediately or schedules it
- Body: `{ immediate?: boolean, minutesFromNow?: number }`

**`POST /auth/dev/trigger-inactivity-scanner`**
- Manually triggers inactivity scanner
- Returns scanner results

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
  - Check performed server-side
  - Returns error: "Deletion has already been processed"
  - Provides support contact information

### Undo During Login

- User logs in during deletion period:
  - Sees deletion status banner
  - Clicks undo button
  - System logs user out
  - Deletion cancelled
  - User can log in again with full access

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
  - Token validated each time
  - If already cancelled, returns success (idempotent)
  - No errors thrown

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

1. **PerformUserDeletion**
   - Memory: 1024 MB
   - Timeout: 15 minutes
   - Triggered by: EventBridge Scheduler

2. **InactivityScanner**
   - Memory: 256 MB
   - Timeout: 5 minutes
   - Scheduled: Daily at 2 AM UTC

3. **PostAuthentication**
   - Memory: 256 MB
   - Timeout: 10 seconds
   - Triggered by: Cognito Post Authentication event

### EventBridge Schedules

- **User Deletion**: One-time schedules per user (`user-deletion-{userId}`)
- **Inactivity Scanner**: Daily cron (`0 2 * * ? *`)

### Dead Letter Queues

- **UserDeletionDLQ**: Failed user deletion schedule executions
- Retention: 14 days

## Related Documentation

- [Authentication Architecture](./authentication-architecture.md)
- [Payment Integration](./stripe-payment-integration.md)
- [Gallery Expiration](./three-tier-image-optimization-strategy.md)

## Notes

- **Gallery Finals**: No TTL needed - existing gallery expiration (EventBridge Scheduler) handles deletion of finals when gallery expires
- **Confirmation Phrase**: Hardcoded "Potwierdzam" (Polish) as per user preference
- **Undo Token**: Stored in DynamoDB user record with expiration matching deletion time
- **User Status**: Three states: `active`, `pendingDeletion`, `deleted`
- **Last Login Tracking**: Implemented via Cognito Post Authentication trigger
- **Gallery Preservation**: Galleries with delivered orders are NOT deleted to ensure:
  - Clients can continue accessing their galleries
  - Gallery expiration continues automatically via EventBridge Scheduler
  - Gallery expiration emails work via preserved `ownerEmail` in gallery records

