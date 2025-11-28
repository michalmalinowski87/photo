# Stripe EventBridge Integration

This document describes the Stripe EventBridge integration setup and architecture.

## Overview

PhotoCloud uses **Amazon EventBridge** as the exclusive method for receiving Stripe events. EventBridge provides better reliability, built-in retry mechanisms, and native AWS integration. All payment processing happens asynchronously via EventBridge.

## Architecture

```
Stripe Checkout → Success Endpoint (shows processing UI, polls status)
                ↓
         EventBridge (Partner Event Source) → EventBridge Rule → Lambda Function (processes payment)
                ↓
         Status Check Endpoint (returns processing status)
                ↓
         Success Page (redirects when processing completes)
```

**Async Processing Strategy:**
1. **Success Endpoint:** Shows beautiful processing page with status messages. Polls status endpoint to check if payment has been processed.
2. **EventBridge:** Processes payment asynchronously (credits wallet, updates transaction, activates gallery). Provides reliability and automatic retries.
3. **Status Check:** Endpoint checks if payment has been processed by EventBridge. Returns status so frontend knows when to redirect.

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

## Events Handled

### Critical Events

1. **`checkout.session.completed`** - CRITICAL
   - **Purpose:** Successful payments
   - **Handles:**
     - Wallet top-ups (`type: "wallet_topup"`)
     - Gallery payments (`type: "gallery_payment"`)
     - Plan upgrades (`type: "gallery_plan_upgrade"`)
   - **Actions:**
     - Credits wallet balance
     - Marks transactions as PAID
     - Activates galleries (removes TTL, sets expiry)
     - Creates orders for non-selection galleries

2. **`checkout.session.expired`** - IMPORTANT
   - **Purpose:** Expired checkout sessions
   - **Actions:**
     - Marks transactions as CANCELED
     - Clears `paymentLocked` flag on galleries

3. **`payment_intent.payment_failed`** - IMPORTANT
   - **Purpose:** Failed payment attempts
   - **Actions:**
     - Marks transactions as FAILED
     - Clears `paymentLocked` flag on galleries

4. **`payment_intent.canceled`** - IMPORTANT
   - **Purpose:** Canceled payments
   - **Actions:**
     - Marks transactions as CANCELED
     - Clears `paymentLocked` flag on galleries

### Optional Events

5. **`charge.succeeded`** - Optional (redundant with `checkout.session.completed`)
6. **`charge.updated`** - Optional (for charge updates)
7. **`payment_intent.succeeded`** - Optional (redundant with `checkout.session.completed`)

## Lambda Handler

The webhook Lambda handler (`backend/functions/payments/webhook.ts`) supports both EventBridge and HTTP webhook events:

### EventBridge Event Format

```typescript
{
  source: "aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ",
  "detail-type": "checkout.session.completed",
  id: "evt_...",
  detail: {
    // Stripe event object
    id: "cs_test_...",
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    metadata: { ... }
  }
}
```

### Handler Logic

1. **Validates event source:**
   - Verifies `event.source` starts with `aws.partner/stripe.com`
   - Throws error if invalid (only EventBridge events supported)

2. **Converts EventBridge events:**
   - Transforms EventBridge format to Stripe event format
   - Extracts event type from `detail-type`
   - Uses `detail` as the Stripe event object

3. **Processes events:**
   - Handles wallet top-ups, gallery payments, plan upgrades
   - Updates transactions, wallets, galleries, orders

4. **Returns response:**
   - Returns `{ statusCode: 200 }` to mark event as processed
   - Throws error on failure (triggers EventBridge retry)

## Async Processing Strategy

We use **fully asynchronous processing** via EventBridge for maximum reliability:

### 1. Success Endpoint (UI Only)
- **When:** User is redirected back from Stripe Checkout
- **What:** Shows beautiful processing page with status messages
- **Why:** Provides immediate feedback and transparency
- **How:** Polls `/payments/check-status` endpoint every 2 seconds

### 2. EventBridge Processing (Background)
- **When:** Stripe sends event to EventBridge (happens asynchronously)
- **What:** EventBridge routes event to webhook Lambda
- **Why:** Provides reliability, automatic retries, and scalability
- **How:** Processes payment via `processCheckoutSession` function

### 3. Status Check Endpoint
- **When:** Success page polls for status
- **What:** Checks if payment has been processed
- **Why:** Allows frontend to know when processing is complete
- **How:** Checks payments table and transaction status

### Idempotency
Processing function has built-in duplicate detection:
- Checks `paymentsTable` for existing payment record
- If already processed, skips (prevents double processing)
- Ensures data consistency

## Benefits of EventBridge

1. **No Webhook Secret Management**
   - EventBridge events don't require signature verification
   - AWS handles authentication automatically

2. **Built-in Retry**
   - EventBridge automatically retries failed events
   - Configurable retry policies

3. **Dead Letter Queue (DLQ)**
   - Can configure DLQ for events that fail after all retries
   - Better observability and debugging

4. **Better Observability**
   - Events visible in CloudWatch
   - EventBridge metrics and alarms
   - Event replay capabilities

5. **Native AWS Integration**
   - Direct integration with Lambda
   - No API Gateway needed for webhooks
   - Better performance and lower latency

6. **Immediate User Feedback**
   - Success endpoint shows processing UI immediately
   - User sees real-time status updates via polling
   - EventBridge processes payment reliably in background

## EventBridge Only

**Note:** This integration uses EventBridge exclusively. HTTP webhook endpoints are not supported. All Stripe events must be sent via EventBridge.

## Monitoring

### CloudWatch Logs

Check Lambda logs for event processing:
```bash
aws logs tail /aws/lambda/PhotoHub-dev-PaymentsWebhookFn --follow
```

Look for:
- `eventSource: "EventBridge"` or `"HTTP Webhook"`
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

### Invalid Event Source Errors

If you see "Invalid event source" errors:
- Verify events are being sent via EventBridge (not HTTP webhooks)
- Check EventBridge rule is configured correctly
- Ensure partner event source is associated with event bus

## Migration Notes

- **EventBridge only:** All events must be sent via EventBridge
- **HTTP webhooks removed:** No longer supported
- **Simplified code:** No webhook secret management needed
- **Better reliability:** EventBridge provides built-in retry and DLQ

## Production Checklist

- [x] Partner event source associated with event bus
- [x] EventBridge rule created and enabled
- [x] Lambda handler supports both EventBridge and HTTP webhooks
- [x] All required events configured in Stripe
- [ ] CloudWatch alarms configured for failed events
- [ ] Dead Letter Queue configured (optional but recommended)
- [ ] Monitoring dashboard created
- [ ] Documentation updated

## References

- [Stripe Event Destinations Documentation](https://stripe.com/docs/stripe-cli/event-destinations)
- [AWS EventBridge Partner Event Sources](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-saas.html)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)

