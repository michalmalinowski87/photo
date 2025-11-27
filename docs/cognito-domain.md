# How to Get Cognito Domain for Frontend

The Cognito domain is needed for the frontend to authenticate users via Cognito Hosted UI.

## Format

The domain format is: `{prefix}.auth.{region}.amazoncognito.com`

For PhotoCloud, the prefix is: `photocloud-{stage}`

So for `dev` stage: `photocloud-dev.auth.eu-west-1.amazonaws.com`

## Method 1: From CDK Output (Easiest)

After deploying, CDK outputs the domain:

```bash
cd infra
yarn deploy --context stage=dev
```

Look for this output:
```
Outputs:
AppStack.UserPoolDomain = photocloud-dev.auth.eu-west-1.amazonaws.com
```

**Copy this value** - this is your `NEXT_PUBLIC_COGNITO_DOMAIN`

## Method 2: From AWS Console

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Navigate to **Amazon Cognito** → **User pools**
3. Click on your user pool (name will include your stack name)
4. Go to **App integration** tab
5. Scroll to **Domain** section
6. You'll see the domain listed (e.g., `photocloud-dev.auth.eu-west-1.amazonaws.com`)

## Method 3: From AWS CLI

```bash
# Get User Pool ID first (from CDK output or AWS Console)
USER_POOL_ID=eu-west-1_XXXXXXXXX

# Get domain information
aws cognito-idp describe-user-pool-domain \
  --domain photocloud-dev \
  --region eu-west-1

# Or list all domains for your account
aws cognito-idp list-user-pool-domains \
  --region eu-west-1
```

## Method 4: Construct It Manually

If you know your stage and region:

```bash
# For dev stage in eu-west-1
NEXT_PUBLIC_COGNITO_DOMAIN=photocloud-dev.auth.eu-west-1.amazonaws.com

# For prod stage in eu-west-1
NEXT_PUBLIC_COGNITO_DOMAIN=photocloud-prod.auth.eu-west-1.amazonaws.com
```

**Formula:** `photocloud-{stage}.auth.{region}.amazonaws.com`

## Set in Frontend

Add to `frontend/dashboard/.env.local`:

```bash
NEXT_PUBLIC_COGNITO_DOMAIN=photocloud-dev.auth.eu-west-1.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id-here
NEXT_PUBLIC_AWS_REGION=eu-west-1
```

## Verify It Works

1. Check the domain is accessible:
   ```bash
   curl https://photocloud-dev.auth.eu-west-1.amazonaws.com/.well-known/openid-configuration
   ```

2. Test login URL:
   ```
   https://photocloud-dev.auth.eu-west-1.amazonaws.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=YOUR_REDIRECT_URI
   ```

## Troubleshooting

### Domain Not Found

- Make sure you've deployed the stack (`yarn deploy`)
- Check the stage matches (`dev` vs `prod`)
- Verify region matches your deployment region

### Domain Already Exists Error

If you see "Domain already exists" error during deployment:
- The domain prefix `photocloud-{stage}` might be taken
- Try a different stage name
- Or manually delete the domain in Cognito Console and redeploy

### Frontend Can't Connect

- Verify the domain is exactly: `photocloud-{stage}.auth.{region}.amazonaws.com`
- Check `NEXT_PUBLIC_AWS_REGION` matches your deployment region
- Ensure callback URLs are configured in Cognito User Pool Client

