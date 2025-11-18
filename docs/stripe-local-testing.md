# Testing Stripe Webhooks Locally

This guide shows how to test Stripe webhooks on your local development environment.

## Prerequisites

1. **Stripe CLI** installed
2. **Stripe account** (test mode)
3. **Local server** running (Next.js dev server or API server)

## Step 1: Install Stripe CLI

### macOS
```bash
brew install stripe/stripe-cli/stripe
```

### Linux/Windows
Download from: https://stripe.com/docs/stripe-cli#install

### Verify Installation
```bash
stripe --version
```

## Step 2: Login to Stripe

```bash
stripe login
```

This will open your browser to authenticate with Stripe. After authentication, the CLI will have access to your Stripe account.

## Step 3: Forward Webhooks

### Option A: Forward to Deployed API Gateway (Recommended)

Since PhotoHub's webhook handler is a Lambda function, forward directly to your deployed API:

```bash
# Get your API Gateway URL from CDK output (after deploying)
API_URL=https://651eeav7sc.execute-api.eu-west-1.amazonaws.com

# Forward webhooks to your deployed Lambda
stripe listen --forward-to $API_URL/payments/webhook
```

**Example:**
```bash
stripe listen --forward-to https://abc123.execute-api.eu-west-1.amazonaws.com/payments/webhook
```

### Option B: Forward to Local Server (if you create a local handler)

If you want to test locally without deploying, you can create a local webhook handler. However, PhotoHub's webhook handler uses AWS services (DynamoDB, Lambda), so this requires more setup.

For quick testing, **Option A is recommended** - just forward to your deployed API.

## Step 4: Get Webhook Secret

After running `stripe listen`, you'll see output like:

```
> Ready! Your webhook signing secret is whsec_1234567890abcdef... (^C to quit)
```

**Copy this secret** - this is your `STRIPE_WEBHOOK_SECRET` for local testing.

## Step 5: Configure Your Local Environment

Create or update `.env.local` in your project root:

```bash
# For local testing with Stripe CLI
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef...

# Your Stripe secret key (from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_...
```

## Step 6: Test Webhook Delivery

### Trigger a Test Event

In a new terminal, trigger a test checkout session completion:

```bash
stripe trigger checkout.session.completed
```

### Or Create a Real Test Payment

1. Start your local server:
   ```bash
   cd frontend/dashboard
   yarn dev
   ```

2. Make a test payment through your app
3. Check the `stripe listen` terminal - you should see webhook events being forwarded

## Step 7: View Webhook Details

The `stripe listen` command will show:
- Event type
- Event ID
- Delivery status
- Response from your server

Example output:
```
2024-01-15 10:30:45  --> checkout.session.completed [evt_1234567890]
2024-01-15 10:30:45  <-- [200] POST http://localhost:3000/api/webhooks/stripe [evt_1234567890]
```

## Troubleshooting

### Webhook Not Received

1. **Check your server is running:**
   ```bash
   curl http://localhost:3000/api/webhooks/stripe
   ```

2. **Verify the endpoint URL matches:**
   - The URL in `stripe listen` must exactly match your server endpoint
   - Check for trailing slashes, port numbers, path differences

3. **Check firewall/network:**
   - Stripe CLI needs to reach `localhost`
   - Some VPNs or firewalls may block this

### Webhook Signature Verification Fails

- Make sure you're using the webhook secret from `stripe listen` output
- Don't use the webhook secret from Stripe Dashboard (that's for production)
- The secret changes each time you restart `stripe listen`

### Server Returns 404

- Verify your API route exists
- Check the path matches exactly (case-sensitive)
- For Next.js, ensure the file is in `pages/api/` or `app/api/` directory

## Advanced: Filter Specific Events

To only listen for specific events:

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to localhost:3000/api/webhooks/stripe
```

## Advanced: Replay Events

If you want to replay a webhook event:

```bash
# Get event ID from Stripe Dashboard or stripe listen output
stripe events resend evt_1234567890
```

## Integration with PhotoHub

For PhotoHub specifically, since the webhook handler is a Lambda function:

### Testing Wallet Top-Up Flow (Recommended: Forward to Deployed API)

1. **Deploy your infrastructure first:**
   ```bash
   cd infra
   yarn deploy --context stage=dev
   ```
   Note the `HttpApiUrl` from output

2. **Start Stripe CLI forwarding to deployed API:**
   ```bash
   # Replace with your actual API Gateway URL
   stripe listen --forward-to https://your-api-id.execute-api.region.amazonaws.com/payments/webhook
   ```

3. **Copy the webhook secret from Stripe CLI output:**
   ```
   > Ready! Your webhook signing secret is whsec_1234567890...
   ```

4. **Update Lambda environment variable:**
   - Go to AWS Console → Lambda → PaymentsWebhookFn
   - Update `STRIPE_WEBHOOK_SECRET` environment variable with the secret from step 3
   - Or redeploy with the secret:
     ```bash
     export STRIPE_WEBHOOK_SECRET=whsec_...
     cd infra && yarn deploy
     ```

5. **Start your dashboard:**
   ```bash
   cd frontend/dashboard
   yarn dev
   ```

6. **Make a test top-up payment** through the dashboard

7. **Check webhook delivery:**
   - Stripe CLI terminal will show the webhook being forwarded
   - Check Lambda logs:
     ```bash
     aws logs tail /aws/lambda/PaymentsWebhookFn --follow
     ```

### Alternative: Testing with Stripe Dashboard Webhook

Instead of Stripe CLI, you can also:
1. Set up webhook endpoint in Stripe Dashboard pointing to your deployed API
2. Use the webhook secret from Stripe Dashboard
3. Make payments and check webhook deliveries in Stripe Dashboard

### Testing Gallery Payment Flow

Same process, but trigger a gallery creation with payment instead of wallet top-up.

## Production vs Local

**Important:** The webhook secret from `stripe listen` is different from production webhook secrets.

- **Local testing:** Use `stripe listen` secret (`whsec_...`)
- **Production:** Use webhook secret from Stripe Dashboard

Never use the local webhook secret in production!

## Quick Reference

```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Listen and forward
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed

# View events
stripe events list

# Replay event
stripe events resend evt_1234567890
```

