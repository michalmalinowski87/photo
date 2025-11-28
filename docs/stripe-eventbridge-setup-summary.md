# Stripe EventBridge Integration - Setup Summary

## ✅ Completed Setup

### 1. Stripe Event Destination
- **Status:** Active
- **Destination ID:** `ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ`
- **Name:** `photocloud-stripe`
- **AWS Account:** `8229-6110-0030`
- **Region:** `eu-west-1`
- **Events:** 7 events configured

### 2. AWS Partner Event Source
- **Status:** Active ✅
- **Event Source ARN:** `arn:aws:events:eu-west-1::event-source/aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ`
- **Event Bus:** `aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ`
- **Associated:** Yes (Nov 27, 2025)

### 3. Infrastructure Changes

#### CDK Updates (`infra/lib/app-stack.ts`)
- ✅ Added EventBridge rule for Stripe events
- ✅ Configured event pattern for 7 Stripe events
- ✅ Added Lambda as target for EventBridge rule
- ✅ Granted EventBridge permission to invoke Lambda
- ✅ Removed HTTP webhook route (EventBridge only)

#### Lambda Handler Updates (`backend/functions/payments/webhook.ts`)
- ✅ EventBridge-only event processing
- ✅ EventBridge-to-Stripe event format conversion
- ✅ Unified event processing logic
- ✅ Enhanced logging for EventBridge events

## Events Configured

1. `checkout.session.completed` - CRITICAL (wallet top-ups, gallery payments, plan upgrades)
2. `checkout.session.expired` - IMPORTANT (expired sessions)
3. `payment_intent.payment_failed` - IMPORTANT (failed payments)
4. `payment_intent.canceled` - IMPORTANT (canceled payments)
5. `charge.succeeded` - Optional
6. `charge.updated` - Optional
7. `payment_intent.succeeded` - Optional

## How It Works

### Payment Processing Flow

**Async Processing (EventBridge):**
```
Stripe → EventBridge Partner Event Source → EventBridge Rule → Lambda Function
```

1. User completes payment in Stripe Checkout
2. Stripe redirects to `/payments/success?session_id=...`
3. Success endpoint shows processing page with status messages
4. Success page polls `/payments/check-status` every 2 seconds
5. Stripe sends event to EventBridge (asynchronously)
6. EventBridge routes event to Lambda via rule
7. Lambda validates EventBridge format (`event.source` must start with `aws.partner/stripe.com`)
8. Lambda converts EventBridge format to Stripe event format
9. Lambda processes payment (credits wallet, updates transaction, activates gallery)
10. Status check endpoint detects processed payment
11. Success page redirects to dashboard when processing completes
12. On failure, Lambda throws error (EventBridge retries automatically)

**Benefits:**
- **Reliability:** EventBridge provides automatic retries
- **User Experience:** Real-time status updates via polling
- **Scalability:** Async processing doesn't block user requests
- **Idempotency:** Duplicate check ensures no double processing

## Next Steps

### 1. Deploy Infrastructure
```bash
cd infra
yarn deploy --context stage=dev
```

This will:
- Create the EventBridge rule
- Configure Lambda permissions
- Enable event routing

### 2. Test EventBridge Integration

Make a test payment and verify:
- Events are received via EventBridge (check CloudWatch logs)
- Wallet is credited correctly
- Transactions are marked as PAID
- No signature verification errors (EventBridge doesn't need it)

### 3. Monitor

Check CloudWatch logs:
```bash
aws logs tail /aws/lambda/PhotoHub-dev-PaymentsWebhookFn --follow
```

Look for:
- `eventSource: "EventBridge"` in logs
- Successful event processing
- Any errors or warnings

### 4. Verify EventBridge Only

- HTTP webhook route has been removed
- Only EventBridge events are supported
- No webhook secret needed

## Benefits Achieved

✅ **No webhook secret management** - EventBridge handles authentication  
✅ **Built-in retry** - EventBridge automatically retries failed events  
✅ **Better observability** - Events visible in CloudWatch  
✅ **Native AWS integration** - Direct Lambda invocation  
✅ **Simplified code** - No HTTP webhook handling needed  

## Troubleshooting

### Events Not Received
1. Check EventBridge rule is enabled in AWS Console
2. Verify event pattern matches Stripe events
3. Check Lambda target is configured correctly

### Events Received But Not Processed
1. Check CloudWatch logs for errors
2. Verify event format conversion is working
3. Check Lambda has proper permissions

### See Full Documentation
See `docs/stripe-eventbridge-integration.md` for complete details.

