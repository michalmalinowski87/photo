# Stripe Payment Integration Guide

Complete guide to Stripe payment processing via AWS EventBridge in PhotoCloud.

## Overview

PhotoCloud uses **Amazon EventBridge** as the exclusive method for receiving Stripe events. This provides:
- ✅ Better reliability with built-in retry mechanisms
- ✅ Native AWS integration (no API Gateway needed for webhooks)
- ✅ No webhook secret management required
- ✅ Automatic retries on failure
- ✅ Better observability via CloudWatch

**Architecture:**
```
Stripe Checkout → Success Endpoint (shows processing UI, polls status)
                ↓
         EventBridge (Partner Event Source) → EventBridge Rule → Lambda Function (processes payment)
                ↓
         Status Check Endpoint (returns processing status)
                ↓
         Success Page (redirects when processing completes)
```

## Setup

### 1. Stripe Event Destination Configuration

**Destination Details:**
- **Destination ID:** `ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ`
- **Name:** `photocloud-stripe`
- **API Version:** `2025-10-29.clover`
- **AWS Account ID:** `8229-6110-0030`
- **Region:** `eu-west-1`

**Event Source ARN:**
```
arn:aws:events:eu-west-1::event-source/aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ
```

**Event Bus Name:**
```
aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ
```

### 2. AWS EventBridge Configuration

The partner event source must be associated with an event bus in AWS Console:

1. Go to **Amazon EventBridge → Partner event sources**
2. Find the event source: `aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ`
3. Click **"Associate with event bus"**
4. Select the default event bus (or custom event bus)
5. Click **"Associate"**

**Status:** ✅ Active (as of Nov 27, 2025)

### 3. Infrastructure (CDK)

The EventBridge rule is automatically created in `infra/lib/app-stack.ts`:

```typescript
const stripeEventSourceName = 'aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ';
const stripeEventRule = new Rule(this, 'StripeEventRule', {
  eventPattern: {
    source: [stripeEventSourceName],
    'detail-type': [
      'checkout.session.completed',
      'checkout.session.expired',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.succeeded',
      'charge.updated',
      'payment_intent.succeeded'
    ]
  },
  description: 'Route Stripe events from EventBridge to webhook Lambda',
  enabled: true
});

stripeEventRule.addTarget(new LambdaFunction(paymentsWebhookFn));
```

### 4. Environment Variables

Set the following environment variables:

```bash
export STRIPE_SECRET_KEY=sk_test_51AbC123...  # or sk_live_... for production
export STRIPE_WEBHOOK_SECRET=  # Not needed for EventBridge (leave empty)
```

**Note:** `STRIPE_WEBHOOK_SECRET` is not needed for EventBridge integration. AWS handles authentication automatically.

## Payment Processing Flow

### User Experience Flow

#### 1. User Initiates Payment
- User clicks "Publish Gallery", "Top Up Wallet", or "Pay for Gallery"
- Frontend calls `/pay` endpoint to calculate payment method
- If Stripe is needed, frontend shows `StripeRedirectOverlay` immediately
- User is redirected to Stripe Checkout

#### 2. User Completes Payment in Stripe
- User enters payment details and completes payment
- Stripe processes the payment
- Stripe sends event to AWS EventBridge (asynchronously)
- Stripe redirects user back to our success endpoint

#### 3. Success Page - Processing Status
- Success endpoint shows processing page with status messages
- Page polls `/payments/check-status` endpoint every 2 seconds
- Once EventBridge processes the payment, status check returns `isProcessed: true`
- Page shows success and redirects to dashboard

**Status Messages by Payment Type:**
- **Wallet Top-up**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Doładowywanie portfela", "Aktualizacja salda"
- **Gallery Payment**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Aktywacja galerii", "Aktualizacja statusu"
- **Plan Upgrade**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Aktywacja planu", "Aktualizacja limitów"

**Polling Behavior:**
- Polls every 2 seconds
- Maximum 60 polls (2 minutes total)
- Shows "Oczekiwanie na przetworzenie płatności..." while waiting
- Redirects 2 seconds after processing completes

### Technical Flow

#### 1. EventBridge Routes to Lambda

```
Stripe → EventBridge (Partner Event Source) → EventBridge Rule → Lambda Function
```

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

#### 2. Lambda Processes Payment

The Lambda handler (`backend/functions/payments/webhook.ts`):

1. **Validates event source:**
   - Verifies `event.source` starts with `aws.partner/stripe.com`
   - Throws error if invalid (only EventBridge events supported)

2. **Converts EventBridge events:**
   - Transforms EventBridge format to Stripe event format
   - Extracts event type from `detail-type`
   - Uses `detail` as the Stripe event object

3. **Checks for duplicates** (idempotency):
   - Reads `paymentsTable` with `paymentId = pay_{sessionId}`
   - If exists, skips processing (already done)

4. **Updates transaction status:**
   - Reads `transactionsTable` with `userId` + `transactionId`
   - Updates status from `UNPAID` → `PAID`
   - Stores `stripeSessionId` and `stripePaymentIntentId`

5. **Processes payment based on type:**

   **For `wallet_topup`:**
   - Credits wallet: Updates `walletsTable` (increments `balanceCents`)
   - Creates ledger entry: Writes to `walletLedgerTable`

   **For `gallery_payment`:**
   - Activates gallery: Updates `galleriesTable`
     - Sets `state = 'PAID_ACTIVE'`
     - Sets `expiresAt` to full plan duration
     - Updates storage limits
   - Creates order (if needed): Writes to `ordersTable`

   **For `gallery_plan_upgrade`:**
   - Updates gallery plan: Updates `galleriesTable`
     - Sets new `plan`
     - Updates `priceCents`
     - Updates storage limits

6. **Records payment** (final step):
   - Writes to `paymentsTable` with status `COMPLETED`

**Important:** The Lambda does **NOT** emit new events. It only writes to DynamoDB.

#### 3. Status Check Endpoint

The success page polls `/payments/check-status` endpoint:

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

## Events Handled

### Critical Events

1. **`checkout.session.completed`** - CRITICAL
   - **Purpose:** Successful payments
   - **Handles:** Wallet top-ups, gallery payments, plan upgrades
   - **Actions:** Credits wallet, marks transactions as PAID, activates galleries

2. **`checkout.session.expired`** - IMPORTANT
   - **Purpose:** Expired checkout sessions
   - **Actions:** Marks transactions as CANCELED, clears `paymentLocked` flag

3. **`payment_intent.payment_failed`** - IMPORTANT
   - **Purpose:** Failed payment attempts
   - **Actions:** Marks transactions as FAILED, clears `paymentLocked` flag

4. **`payment_intent.canceled`** - IMPORTANT
   - **Purpose:** Canceled payments
   - **Actions:** Marks transactions as CANCELED, clears `paymentLocked` flag

### Optional Events

5. **`charge.succeeded`** - Optional (redundant with `checkout.session.completed`)
6. **`charge.updated`** - Optional (for charge updates)
7. **`payment_intent.succeeded`** - Optional (redundant with `checkout.session.completed`)

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

## Benefits of EventBridge

1. **No Webhook Secret Management** - EventBridge events don't require signature verification
2. **Built-in Retry** - EventBridge automatically retries failed events
3. **Dead Letter Queue (DLQ)** - Can configure DLQ for events that fail after all retries
4. **Better Observability** - Events visible in CloudWatch
5. **Native AWS Integration** - Direct integration with Lambda, no API Gateway needed
6. **Immediate User Feedback** - Success endpoint shows processing UI immediately

## Monitoring

### CloudWatch Logs

Check Lambda logs for event processing:
```bash
aws logs tail /aws/lambda/dev-paymentsWebhook --follow
```

Look for:
- `eventSource: "EventBridge"` in logs
- Event type and ID
- Processing success/failure
- Error details

### EventBridge Metrics

Monitor in CloudWatch:
- **Invocations:** Number of events received
- **FailedInvocations:** Number of failed event processing
- **Throttles:** Lambda throttling events

### Stripe Dashboard

Check event delivery in Stripe Dashboard:
- **Developers → Webhooks → Event destinations**
- View event delivery status
- Check for failed deliveries

## Troubleshooting

### Events Not Received

1. **Check EventBridge Rule:**
   - Verify rule is enabled
   - Check event pattern matches Stripe events
   - Verify Lambda target is configured

2. **Check Partner Event Source:**
   - Verify status is "Active" in AWS Console
   - Ensure event bus is associated

3. **Check Stripe Configuration:**
   - Verify destination is active in Stripe Dashboard
   - Check which events are configured
   - Verify AWS account ID and region match

### Events Received But Not Processed

1. **Check Lambda Logs:**
   - Look for error messages
   - Check if event format is correct
   - Verify event source detection

2. **Check Event Format:**
   - EventBridge events should have `source` starting with `aws.partner/stripe.com`
   - `detail-type` should match Stripe event type
   - `detail` should contain the Stripe event object

3. **Check Lambda Permissions:**
   - Verify EventBridge can invoke Lambda
   - Check IAM role permissions

## Production Checklist

- [x] Partner event source associated with event bus
- [x] EventBridge rule created and enabled
- [x] Lambda handler supports EventBridge events
- [x] All required events configured in Stripe
- [ ] CloudWatch alarms configured for failed events
- [ ] Dead Letter Queue configured (optional but recommended)
- [ ] Monitoring dashboard created
- [ ] Test with real card (use small amount first)

## Security

See `payment-page-security.md` for detailed security measures implemented for payment success and cancel pages.

## References

- [Stripe Event Destinations Documentation](https://stripe.com/docs/stripe-cli/event-destinations)
- [AWS EventBridge Partner Event Sources](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-saas.html)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)

