# Stripe Setup Guide

This guide explains how to configure Stripe for PhotoHub payments.

## Overview

PhotoHub uses **Stripe Checkout** (hosted payment page) for processing payments. This means:
- ✅ No Stripe Publishable Key needed in frontend
- ✅ Only Secret Key needed server-side
- ✅ Webhook Secret needed for security verification

## Step-by-Step Setup

### 1. Get Your Stripe Secret Key

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Make sure you're in **Test mode** (toggle in top right)
3. Go to **Developers** → **API keys**
4. Copy your **Secret key** (starts with `sk_test_...` for test mode)
5. This is your `STRIPE_SECRET_KEY`

**Important:** 
- Use `sk_test_...` for development/testing
- Use `sk_live_...` for production (only after thorough testing)

### 2. Deploy Your API First

Before setting up webhooks, you need your API Gateway URL:

```bash
cd infra
yarn deploy --context stage=dev
```

Note the `HttpApiUrl` from the output (e.g., `https://abc123.execute-api.eu-west-1.amazonaws.com`)

### 3. Configure Stripe Webhook Endpoint

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter your webhook URL:
   ```
   https://<your-api-id>.execute-api.<region>.amazonaws.com/payments/webhook
   ```
   Example:
   ```
   https://abc123.execute-api.eu-west-1.amazonaws.com/payments/webhook
   ```
4. Select events to listen for:
   - ✅ `checkout.session.completed` (required)
   - Optionally add: `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
5. Click **"Add endpoint"**

### 4. Get Your Webhook Secret

1. After creating the endpoint, click on it in the webhooks list
2. In the **"Signing secret"** section, click **"Reveal"**
3. Copy the secret (starts with `whsec_...`)
4. This is your `STRIPE_WEBHOOK_SECRET`

**Important:**
- Each webhook endpoint has its own unique secret
- Test mode and live mode have different secrets
- Keep this secret secure - never commit it to version control

### 5. Set Environment Variables

Add to your deployment environment or `.env` file:

```bash
export STRIPE_SECRET_KEY=sk_test_51AbC123...
export STRIPE_WEBHOOK_SECRET=whsec_AbC123...
```

Then redeploy if needed:
```bash
cd infra
yarn deploy --context stage=dev
```

### 6. Test the Webhook

1. Make a test payment through your app
2. Check webhook delivery in Stripe Dashboard:
   - Go to **Developers** → **Webhooks** → [Your Endpoint]
   - Click on **"Recent deliveries"**
   - You should see successful deliveries (green checkmark)
3. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/PaymentsWebhookFn --follow
   ```
4. Verify wallet balance updated in your app

## Local Development

For local testing, use Stripe CLI to forward webhooks:

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux/Windows
# See: https://stripe.com/docs/stripe-cli
```

### Login and Forward Webhooks

```bash
# Login to Stripe
stripe login

# Forward webhooks to local server (if running locally)
stripe listen --forward-to http://localhost:3000/api/webhook

# This will output a webhook secret like:
# > Ready! Your webhook signing secret is whsec_... (^C to quit)
# Use this secret for local testing
```

### Test Webhook Locally

```bash
# Trigger a test event
stripe trigger checkout.session.completed
```

## Webhook Security

The webhook secret is used to verify that requests are actually coming from Stripe:

```typescript
// In webhook.ts
const stripeEvent = stripe.webhooks.constructEvent(
  body, 
  sig, 
  stripeWebhookSecret
);
```

This prevents:
- ❌ Fake webhook requests
- ❌ Replay attacks
- ❌ Unauthorized payment confirmations

## Troubleshooting

### Webhook Not Receiving Events

1. **Check endpoint URL:**
   - Must be publicly accessible (not localhost)
   - Must match exactly (including `/payments/webhook`)
   - Must use HTTPS

2. **Check API Gateway:**
   - Verify route exists: `/payments/webhook`
   - Verify method is POST
   - Check Lambda function is attached

3. **Check Stripe Dashboard:**
   - Go to Webhooks → [Your Endpoint] → Recent deliveries
   - Look for failed deliveries (red X)
   - Click on failed delivery to see error details

### Webhook Signature Verification Fails

- Verify `STRIPE_WEBHOOK_SECRET` matches the one from Stripe Dashboard
- Ensure you're using the correct secret for test vs live mode
- Check that the webhook body is not modified (e.g., by API Gateway)

### Payment Succeeds But Wallet Not Credited

1. Check webhook was delivered successfully
2. Check Lambda logs for errors:
   ```bash
   aws logs tail /aws/lambda/PaymentsWebhookFn --follow
   ```
3. Verify DynamoDB tables exist:
   - `WALLETS_TABLE`
   - `WALLET_LEDGER_TABLE`
4. Check Lambda has permissions to write to DynamoDB

## Production Checklist

Before going live:

- [ ] Switch Stripe Dashboard to **Live mode**
- [ ] Create new webhook endpoint with production API URL
- [ ] Get new webhook secret for live mode
- [ ] Update environment variables with live keys:
  - `STRIPE_SECRET_KEY=sk_live_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_...` (live mode secret)
- [ ] Test with real card (use small amount first)
- [ ] Monitor webhook deliveries
- [ ] Set up webhook retry alerts in Stripe Dashboard

## Test Cards

Use these test card numbers in Stripe Checkout:

- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **3D Secure:** `4000 0025 0000 3155`

Use any future expiry date, any CVC, and any ZIP code.

## Additional Resources

- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)

