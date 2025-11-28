# Payment Processing Flow - Technical Details

## Overview

The payment processing system uses **EventBridge → Lambda → DynamoDB** architecture. The Lambda does **NOT** emit new events - it directly updates DynamoDB tables, and the status check endpoint reads from those tables.

## Complete Flow

### 1. User Completes Payment in Stripe

```
User → Stripe Checkout → Payment Completed
```

**What happens:**
- User enters payment details and completes payment
- Stripe processes the payment
- Stripe sends `checkout.session.completed` event to **EventBridge** (asynchronously)

---

### 2. EventBridge Routes to Lambda

```
Stripe → EventBridge (Partner Event Source) → EventBridge Rule → Lambda Function
```

**Infrastructure:**
- EventBridge rule matches `checkout.session.completed` events
- Rule targets `paymentsWebhookFn` Lambda
- EventBridge automatically invokes the Lambda

**Event Format:**
```json
{
  "source": "aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ",
  "detail-type": "checkout.session.completed",
  "detail": {
    "id": "evt_123",
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_abc123",
        "payment_status": "paid",
        "status": "complete",
        "metadata": {
          "userId": "user_123",
          "type": "wallet_topup",
          "transactionId": "txn_456",
          "redirectUrl": "..."
        }
      }
    }
  }
}
```

---

### 3. Lambda Processes Payment (Writes to DynamoDB)

```
EventBridge → paymentsWebhookFn → DynamoDB (writes)
```

**What the Lambda does (in order):**

1. **Checks for duplicates** (idempotency)
   - Reads `paymentsTable` with `paymentId = pay_{sessionId}`
   - If exists, skips processing (already done)

2. **Updates transaction status**
   - Reads `transactionsTable` with `userId` + `transactionId`
   - Updates status from `UNPAID` → `PAID`
   - Stores `stripeSessionId` and `stripePaymentIntentId`

3. **Processes payment based on type:**

   **For `wallet_topup`:**
   - Credits wallet: Updates `walletsTable` (increments `balanceCents`)
   - Creates ledger entry: Writes to `walletLedgerTable`

   **For `gallery_payment`:**
   - Activates gallery: Updates `galleriesTable`
     - Sets `state = 'PAID_ACTIVE'`
     - Sets `expiresAt`
     - Removes `ttl` (TTL attribute)
     - Updates storage limits
   - Creates order (if needed): Writes to `ordersTable`

   **For `gallery_plan_upgrade`:**
   - Updates gallery plan: Updates `galleriesTable`
     - Sets new `plan`
     - Updates `priceCents`
     - Updates storage limits

4. **Records payment** (final step)
   - Writes to `paymentsTable`:
     ```json
     {
       "paymentId": "pay_cs_test_abc123",
       "status": "COMPLETED",
       "amount": 2000,
       "currency": "pln",
       "type": "wallet_topup",
       "userId": "user_123",
       "galleryId": null,
       "stripeSessionId": "cs_test_abc123",
       "createdAt": "2025-01-15T10:00:00Z"
     }
     ```

**Important:** The Lambda does **NOT** emit new events. It only writes to DynamoDB.

---

### 4. Success Page Polls Status

```
Success Page → checkStatus Endpoint → DynamoDB (reads)
```

**What the status check endpoint does:**

1. **Checks payments table**
   - Reads `paymentsTable` with `paymentId = pay_{sessionId}`
   - If found with `status = 'COMPLETED'` → `isProcessed = true`

2. **Checks transaction table** (if payment not found)
   - Retrieves Stripe session to get `transactionId` and `userId`
   - Reads `transactionsTable` with `userId` + `transactionId`
   - If `status = 'PAID'` → `isProcessed = true`

3. **Checks Stripe session** (fallback)
   - If `payment_status = 'paid'` and `status = 'complete'` → `paymentStatus = 'processing'`
   - This means Stripe confirmed payment but EventBridge hasn't processed it yet

**Response:**
```json
{
  "sessionId": "cs_test_abc123",
  "isProcessed": true,
  "paymentStatus": "completed",
  "transactionStatus": "PAID",
  "paymentType": "wallet_topup"
}
```

---

## Status Progression

### DynamoDB State Changes

**Initial State (before EventBridge):**
- `transactionsTable`: `status = 'UNPAID'`
- `paymentsTable`: No record
- `walletsTable`: Old balance

**After EventBridge Processing:**
- `transactionsTable`: `status = 'PAID'` ✅
- `paymentsTable`: `status = 'COMPLETED'` ✅
- `walletsTable`: New balance (if wallet top-up) ✅
- `galleriesTable`: `state = 'PAID_ACTIVE'` (if gallery payment) ✅

### Status Check Endpoint Logic

| DynamoDB State | `isProcessed` | `paymentStatus` | Meaning |
|----------------|---------------|-----------------|---------|
| No payment record, transaction `UNPAID` | `false` | `pending` | Waiting for EventBridge |
| No payment record, transaction `PAID` | `true` | `completed` | EventBridge processed, payment record may be delayed |
| Payment record `COMPLETED` | `true` | `completed` | Fully processed ✅ |
| Transaction `CANCELED` | `false` | `canceled` | Payment canceled |
| Transaction `FAILED` | `false` | `failed` | Payment failed |

---

## Key Points

1. **No Event Emission**: The Lambda does NOT emit new events. It only writes to DynamoDB.

2. **Idempotency**: Duplicate check prevents double processing. If payment record exists, Lambda skips.

3. **Status Tracking**: Success page polls DynamoDB state, not events. It reads:
   - `paymentsTable` (primary check)
   - `transactionsTable` (secondary check)
   - Stripe session (fallback)

4. **Async Processing**: EventBridge processes asynchronously. Success page polls until DynamoDB reflects completion.

5. **Retry Mechanism**: If Lambda fails, EventBridge automatically retries (up to configured retry policy).

---

## Timeline Example

```
T+0s:  User completes payment in Stripe
T+1s:  Stripe sends event to EventBridge
T+2s:  EventBridge invokes Lambda
T+3s:  Lambda updates transaction status → 'PAID'
T+4s:  Lambda credits wallet
T+5s:  Lambda creates payment record → 'COMPLETED'
T+6s:  Success page polls → finds payment record → redirects
```

**Note:** Actual timing varies. Usually 5-10 seconds, can take up to 30 seconds.

---

## Error Handling

### If Lambda Fails

1. EventBridge automatically retries (exponential backoff)
2. If all retries fail, event goes to DLQ (if configured)
3. Success page will timeout after 2 minutes and redirect anyway
4. User can check transaction status in dashboard
5. Support can manually retry if needed

### If Status Check Fails

1. Success page continues polling (might be temporary network issue)
2. After 60 polls (2 minutes), redirects anyway
3. EventBridge will still process payment in background
4. User can refresh dashboard to see updated state

---

## Summary

**Flow:**
```
Stripe → EventBridge → Lambda → DynamoDB (writes)
                                    ↓
Success Page → checkStatus → DynamoDB (reads)
```

**No event emission** - everything is tracked via DynamoDB state changes.

