# Customer Acquisition Cost (CAC) & Conversion Rate Tracking Analysis

## Executive Summary

This document analyzes what data we currently store for tracking Customer Acquisition Costs (CAC) and conversion rates, identifies gaps, and provides recommendations for improvement.

---

## Current Data Storage

### ✅ What We DO Store

#### 1. User Signups
**Table: `Users`**
- `userId` (partition key)
- `createdAt` - User registration timestamp ✅
- `email` - User email ✅
- `referredByUserId` - Referrer's userId (if referred) ✅
- `referredByReferralCode` - Referral code used at signup ✅
- `referredDiscountPercent` - Discount percentage (10 or 15) ✅
- `lastLoginAt` - Last login timestamp (updated by PostAuthentication trigger) ✅

**Table: `ReferralCodeValidation`**
- Tracks referral code validation attempts by IP (for abuse prevention)

#### 2. Welcome Bonus (CAC = 7 PLN)
**Table: `Transactions`**
- `transactionId`
- `userId`
- `type: 'WELCOME_BONUS'` ✅
- `status: 'PAID'` ✅
- `amountCents: 700` (7 PLN) ✅
- `createdAt` - When bonus was credited ✅
- `paidAt` - Same as createdAt (bonus is auto-credited) ✅

**Table: `WalletLedger`**
- `userId`
- `type: 'WELCOME_BONUS'` ✅
- `creditAmount: 700` ✅
- `createdAt` ✅

#### 3. Gallery Creation
**Table: `Galleries`**
- `galleryId` (partition key)
- `ownerId` - User who created gallery ✅
- `createdAt` - Gallery creation timestamp ✅
- `state` - Gallery state (DRAFT → PAID_ACTIVE) ✅
- `plan` - Plan key (e.g., '1GB-1m') ✅
- `priceCents` - Price paid ✅
- `updatedAt` - Last update timestamp ✅

**GSI: `ownerId-index`**
- Allows querying all galleries by user ✅

#### 4. Payments & Conversions
**Table: `Transactions`**
- `transactionId`
- `userId` ✅
- `galleryId` ✅
- `type: 'GALLERY_PLAN' | 'GALLERY_PLAN_UPGRADE' | 'WALLET_TOPUP'` ✅
- `status: 'UNPAID' | 'PAID' | 'CANCELED'` ✅
- `paymentMethod: 'WALLET' | 'STRIPE' | 'MIXED'` ✅
- `amountCents` - Total amount ✅
- `walletAmountCents` - Amount paid from wallet ✅
- `stripeAmountCents` - Amount paid via Stripe ✅
- `createdAt` - Transaction creation timestamp ✅
- `paidAt` - Payment completion timestamp ✅
- `metadata` - Additional metadata (includes referral info) ✅

**Table: `Payments`**
- `paymentId`
- `userId` ✅
- `galleryId` ✅
- `type` ✅
- `amount` ✅
- `status: 'COMPLETED'` ✅
- `createdAt` ✅
- `stripeSessionId` ✅

#### 5. Referral Program Tracking
**Table: `Users`**
- `referralCode` - User's unique referral code ✅
- `referralSuccessCount` - Number of successful referrals ✅
- `referralGalleryIds` - Array of gallery IDs from referrals ✅
- `referralReferredUserIds` - Array of referred user IDs ✅
- `referralHistory` - Array of reward history entries ✅
- `referralDiscountUsedAt` - Timestamp when user used referral discount ✅
- `topInviterBadge` - Boolean for 10+ referrals ✅

**GSI: `referralCode-index`**
- Allows lookup by referral code ✅

---

## Calculable Metrics (From Existing Data)

### ✅ Can Calculate Now

1. **Total CAC**
   ```sql
   COUNT(Transactions WHERE type='WELCOME_BONUS' AND status='PAID')
   × 700 cents = Total CAC
   ```

2. **User Signups**
   ```sql
   COUNT(Users WHERE createdAt BETWEEN startDate AND endDate)
   ```

3. **Conversion Rate (Signup → First Paid Gallery)**
   ```sql
   Users who have at least one Transaction WHERE type='GALLERY_PLAN' AND status='PAID'
   / Total Users
   ```

4. **Time to Conversion**
   ```sql
   MIN(Transactions.paidAt WHERE type='GALLERY_PLAN' AND status='PAID')
   - Users.createdAt
   = Time to first payment
   ```

5. **Referral Conversion Rate**
   ```sql
   Users WHERE referredByUserId IS NOT NULL
   AND have Transaction WHERE type='GALLERY_PLAN' AND status='PAID'
   / Total referred users
   ```

6. **Organic vs Referral Signups**
   ```sql
   Referral: COUNT(Users WHERE referredByUserId IS NOT NULL)
   Organic: COUNT(Users WHERE referredByUserId IS NULL)
   ```

7. **Payment Method Breakdown**
   ```sql
   COUNT(Transactions WHERE paymentMethod='WALLET')
   COUNT(Transactions WHERE paymentMethod='STRIPE')
   COUNT(Transactions WHERE paymentMethod='MIXED')
   ```

8. **Revenue per User**
   ```sql
   SUM(Transactions.amountCents WHERE status='PAID')
   / COUNT(DISTINCT userId)
   ```

9. **Average Gallery Value**
   ```sql
   AVG(Galleries.priceCents WHERE state='PAID_ACTIVE')
   ```

10. **CAC Payback Period**
    ```sql
    Users.createdAt
    + (SUM(Transactions.amountCents WHERE status='PAID') >= 700)
    = Time until CAC recovered
    ```

---

## ⚠️ Gaps & Missing Data

### 1. Acquisition Source Tracking
**Missing:**
- Organic vs Referral vs Other sources (e.g., Google Ads, social media)
- UTM parameters (utm_source, utm_medium, utm_campaign)
- Landing page tracking

**Impact:** Cannot measure effectiveness of different acquisition channels

**Recommendation:**
- Add `acquisitionSource` field to `Users` table
- Store UTM parameters in `Users.metadata` or separate `UserAcquisition` table
- Track source at signup time (from query params or referrer header)

### 2. First Gallery Creation Timestamp
**Missing:**
- Separate timestamp for first gallery creation (different from user signup)

**Impact:** Cannot calculate "time to first gallery creation" separately from "time to payment"

**Current Workaround:**
- Use `MIN(Galleries.createdAt WHERE ownerId=userId)` - but requires querying Galleries table

**Recommendation:**
- Add `firstGalleryCreatedAt` to `Users` table (denormalized for performance)

### 3. Gallery Count Before Payment
**Missing:**
- Number of draft galleries created before first paid gallery

**Impact:** Cannot measure user engagement/friction before conversion

**Current Workaround:**
- Query `COUNT(Galleries WHERE ownerId=userId AND state='DRAFT' AND createdAt < firstPaidGallery.createdAt)`

**Recommendation:**
- Add `draftGalleryCount` to `Users` table (updated when gallery is created/deleted)

### 4. User Activity Metrics
**Missing:**
- Gallery view counts
- Upload counts (photos uploaded)
- Login frequency
- Time spent in dashboard

**Impact:** Cannot measure user engagement or identify at-risk users

**Recommendation:**
- Consider adding lightweight activity tracking (e.g., `lastGalleryViewAt`, `totalPhotosUploaded`)
- Or use CloudWatch/analytics service for detailed tracking

### 5. Conversion Funnel Stages ✅ **RESOLVED**
**Status:** ✅ **FULLY IMPLEMENTED** (Priority 1)

**Gallery-Level Timestamps:**
- ✅ `createdAt` - When gallery is created (DRAFT state)
- ✅ `paidAt` - Set when gallery state changes to `PAID_ACTIVE` (in payment webhook)
- ✅ `deliveredAt` - Set when first order is marked as `DELIVERED` (in sendFinalLink)

**Order-Level Timestamps (Complete Funnel Tracking):**
- ✅ `createdAt` - When order is created
- ✅ `clientSelectingAt` - When order status is `CLIENT_SELECTING` (initial selection or after change request approval)
- ✅ `clientApprovedAt` - When order status changes to `CLIENT_APPROVED` (selection approved)
- ✅ `preparingDeliveryAt` - When order status changes to `PREPARING_DELIVERY` (final photos uploaded)
- ✅ `changesRequestedAt` - When order status changes to `CHANGES_REQUESTED` (client requests changes)
- ✅ `awaitingFinalPhotosAt` - When order status is `AWAITING_FINAL_PHOTOS` (non-selection galleries)
- ✅ `deliveredAt` - When order status changes to `DELIVERED` (final link sent)
- ✅ `canceledAt` - When order status changes to `CANCELLED` (already existed)

**Calculable Metrics:**
- ✅ Gallery funnel: DRAFT → PAID → DELIVERED
- ✅ Order funnel: CLIENT_SELECTING → CLIENT_APPROVED → PREPARING_DELIVERY → DELIVERED
- ✅ Time spent in each stage (gallery and order level)
- ✅ Bottleneck identification at each stage
- ✅ Change request impact (time in CHANGES_REQUESTED stage)

**Example Queries:**
```typescript
// Gallery-level funnel
const draftToPaidDays = (new Date(gallery.paidAt).getTime() - new Date(gallery.createdAt).getTime()) / (1000 * 60 * 60 * 24);
const paidToDeliveredDays = (new Date(gallery.deliveredAt).getTime() - new Date(gallery.paidAt).getTime()) / (1000 * 60 * 60 * 24);

// Order-level funnel
const selectingToApprovedDays = (new Date(order.clientApprovedAt).getTime() - new Date(order.clientSelectingAt || order.createdAt).getTime()) / (1000 * 60 * 60 * 24);
const approvedToPreparingDays = (new Date(order.preparingDeliveryAt).getTime() - new Date(order.clientApprovedAt).getTime()) / (1000 * 60 * 60 * 24);
const preparingToDeliveredDays = (new Date(order.deliveredAt).getTime() - new Date(order.preparingDeliveryAt).getTime()) / (1000 * 60 * 60 * 24);
```

**Impact:** ✅ Complete funnel tracking at both gallery and order levels - can identify bottlenecks and measure performance at every stage

### 6. Cohort Analysis Data
**Missing:**
- User cohort (signup month/week)
- Retention metrics (DAU, MAU, retention rate)

**Impact:** Cannot perform cohort analysis for retention tracking

**Current Workaround:**
- Can calculate from `Users.createdAt` and `lastLoginAt`

**Recommendation:**
- Add `cohort` field to `Users` table (e.g., '2024-01' for January 2024 signups)

### 7. Revenue Attribution
**Missing:**
- Which acquisition source generated which revenue
- LTV (Lifetime Value) by source

**Impact:** Cannot optimize CAC by source

**Current Workaround:**
- Can link revenue to `referredByUserId` for referrals only

**Recommendation:**
- Store `acquisitionSource` in `Transactions.metadata` for revenue attribution

---

## Recommended Enhancements

### Priority 1: High Impact, Low Effort ✅ **IMPLEMENTED**

1. **✅ Add `acquisitionSource` to Users table**
   ```typescript
   acquisitionSource?: 'organic' | 'referral' | 'google_ads' | 'social' | 'other';
   acquisitionSourceDetails?: {
     utm_source?: string;
     utm_medium?: string;
     utm_campaign?: string;
     referrer?: string;
   };
   ```
   **Implementation:**
   - Captured at signup time (`/confirm-signup` endpoint)
   - Automatically inferred from referral code, UTM parameters, or referrer header
   - Stored in `Users` table when user confirms signup

2. **✅ Add `firstGalleryCreatedAt` to Users table**
   ```typescript
   firstGalleryCreatedAt?: string; // ISO timestamp
   ```
   **Implementation:**
   - Set when first gallery is created (`galleries/create.ts`)
   - Uses conditional update to prevent overwriting (only sets if not already set)
   - Denormalized for performance (avoids querying all galleries)

3. **✅ Add stage timestamps to Galleries table**
   ```typescript
   paidAt?: string; // When gallery was paid (set when state changes to PAID_ACTIVE)
   deliveredAt?: string; // When first order was delivered
   ```
   **Implementation:**
   - `paidAt`: Set in payment webhook when gallery state changes to `PAID_ACTIVE`
   - `deliveredAt`: Set in `sendFinalLink.ts` when first order is marked as `DELIVERED`
   - Uses conditional update to only set on first delivery (prevents overwriting)

### Priority 2: Medium Impact, Medium Effort

4. **Add `draftGalleryCount` to Users table**
   ```typescript
   draftGalleryCount?: number; // Updated when galleries are created/deleted
   ```

5. **Add `cohort` field to Users table**
   ```typescript
   cohort?: string; // Format: 'YYYY-MM' (e.g., '2024-01')
   ```

### Priority 3: High Impact, High Effort

6. **Implement activity tracking**
   - Use CloudWatch Events or custom analytics service
   - Track: gallery views, uploads, login frequency

7. **Create analytics dashboard**
   - Build Lambda function to calculate metrics
   - Store aggregated metrics in separate table or CloudWatch

---

## Example Queries for Current Data

### CAC Calculation
```typescript
// Total CAC spent
const welcomeBonusTransactions = await ddb.send(new QueryCommand({
  TableName: transactionsTable,
  IndexName: 'userId-index', // Assuming GSI exists
  KeyConditionExpression: 'userId = :u',
  FilterExpression: 'type = :type AND status = :status',
  ExpressionAttributeValues: {
    ':u': userId,
    ':type': 'WELCOME_BONUS',
    ':status': 'PAID'
  }
}));
const totalCAC = welcomeBonusTransactions.Items.length * 700; // cents
```

### Conversion Rate
```typescript
// Users who converted (have at least one paid gallery)
const convertedUsers = await ddb.send(new QueryCommand({
  TableName: transactionsTable,
  IndexName: 'userId-index',
  KeyConditionExpression: 'userId = :u',
  FilterExpression: 'type = :type AND status = :status',
  ExpressionAttributeValues: {
    ':u': userId,
    ':type': 'GALLERY_PLAN',
    ':status': 'PAID'
  },
  Limit: 1
}));
const hasConverted = convertedUsers.Items.length > 0;
```

### Time to Conversion
```typescript
// Get user signup date
const user = await ddb.send(new GetCommand({
  TableName: usersTable,
  Key: { userId }
}));
const signupDate = new Date(user.Item.createdAt);

// Get first paid transaction
const firstPaidTransaction = await ddb.send(new QueryCommand({
  TableName: transactionsTable,
  IndexName: 'userId-index',
  KeyConditionExpression: 'userId = :u',
  FilterExpression: 'type = :type AND status = :status',
  ExpressionAttributeValues: {
    ':u': userId,
    ':type': 'GALLERY_PLAN',
    ':status': 'PAID'
  },
  ScanIndexForward: true, // Oldest first
  Limit: 1
}));
const firstPaymentDate = new Date(firstPaidTransaction.Items[0].paidAt);

const timeToConversion = firstPaymentDate.getTime() - signupDate.getTime(); // milliseconds
const daysToConversion = timeToConversion / (1000 * 60 * 60 * 24);
```

---

## Conclusion

**Current State:** ✅ We store **all essential data** needed for CAC and conversion tracking:
- User signups ✅
- Welcome bonus (CAC) ✅
- Gallery creation ✅
- Payments ✅
- Referrals ✅
- **Acquisition source** ✅ **NEW**
- **First gallery timestamp** ✅ **NEW**
- **Gallery stage timestamps (paidAt, deliveredAt)** ✅ **NEW**
- **Order stage timestamps (complete funnel)** ✅ **NEW**
  - `clientSelectingAt`, `clientApprovedAt`, `preparingDeliveryAt`, `changesRequestedAt`, `awaitingFinalPhotosAt`, `deliveredAt`, `canceledAt`
- **Conversion funnel stages** ✅ **FULLY RESOLVED** - Complete tracking at gallery and order levels

**Remaining Gaps:** ⚠️ Advanced metrics (Priority 2/3):
- Activity metrics (gallery views, upload counts)
- Cohort analysis (can be calculated from existing data)
- Revenue attribution by acquisition source (can be calculated by joining Users.acquisitionSource with Transactions)

**Status:** ✅ **Priority 1 enhancements have been implemented!**

All Priority 1 recommendations are now live:
1. ✅ Acquisition source tracking (organic/referral/ads/social) with UTM parameter capture
2. ✅ First gallery creation timestamp on Users table
3. ✅ Payment timestamp (`paidAt`) on Galleries table
4. ✅ Delivery timestamp (`deliveredAt`) on Galleries table
5. ✅ **Complete order stage timestamps** - Every order status transition is now timestamped

**Order Stage Timestamps Implemented:**
- `clientSelectingAt` - When order enters CLIENT_SELECTING stage
- `clientApprovedAt` - When order enters CLIENT_APPROVED stage
- `preparingDeliveryAt` - When order enters PREPARING_DELIVERY stage
- `changesRequestedAt` - When order enters CHANGES_REQUESTED stage
- `awaitingFinalPhotosAt` - When order enters AWAITING_FINAL_PHOTOS stage
- `deliveredAt` - When order enters DELIVERED stage (already existed)
- `canceledAt` - When order enters CANCELLED stage (already existed)

These enhancements enable comprehensive CAC and conversion rate tracking with **complete funnel visibility** at both gallery and order levels, without requiring additional queries or complex calculations.
