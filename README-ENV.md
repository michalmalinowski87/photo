# Environment Variables Setup

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in all required values (see below)

3. Deploy with environment variables automatically loaded:
   ```bash
   cd infra
   yarn build && yarn deploy:auto
   ```

Or use the deploy script directly:
```bash
cd infra
./deploy.sh
```

## Required Environment Variables

### Stripe (REQUIRED for payments)
- `STRIPE_SECRET_KEY` - Your Stripe secret key from https://dashboard.stripe.com/apikeys
- `STRIPE_WEBHOOK_SECRET` - Webhook secret from Stripe dashboard

### Public URLs (REQUIRED)
- `PUBLIC_API_URL` - Your API Gateway URL (get after first deploy)
- `PUBLIC_DASHBOARD_URL` - Frontend dashboard URL
- `PUBLIC_GALLERY_URL` - Client gallery frontend URL
- `PUBLIC_LANDING_URL` - Landing (website) URL

### Email (REQUIRED for notifications)
- `SENDER_EMAIL` - SES verified sender email

### AWS Configuration
- `CDK_DEFAULT_REGION` - AWS region (e.g., eu-west-1)
- `CDK_DEFAULT_ACCOUNT` - AWS account ID

## Optional Variables

- `STAGE` - Deployment stage (dev/staging/prod), defaults to 'dev'
- `JWT_SECRET` - JWT secret for client gallery auth (auto-generated for dev)
- `GALLERY_PASSWORD_ENCRYPTION_SECRET` - Secret used to encrypt/decrypt client gallery passwords stored in DynamoDB (required for production; set a long random value)
- `CORS_ORIGINS` - Comma-separated allowed origins
- `COGNITO_CALLBACK_URLS` - Comma-separated callback URLs
- `COGNITO_LOGOUT_URLS` - Comma-separated sign-out URLs (Cognito App Client setting)
- `COST_ALERT_EMAIL` - Email for CloudWatch cost alerts

## Notes

- The `.env` file is gitignored and will not be committed
- After first deployment, update `PUBLIC_API_URL` in `.env` with the actual API Gateway URL
- All Lambda functions receive these environment variables automatically
