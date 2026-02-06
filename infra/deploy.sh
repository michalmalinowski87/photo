#!/bin/bash
# Deploy script that loads .env file before deploying
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try to load .env file from multiple locations (infra dir first, then project root)
# If STAGE is provided as argument (dev|staging|prod), load the matching .env file
ENV_FILE=""
STAGE_ARG="${1:-}"

# Map short stage names to .env file names (dev -> development, prod -> production)
case "$STAGE_ARG" in
  dev)      ENV_BASENAME=".env.development.local" ;;
  staging)  ENV_BASENAME=".env.staging.local" ;;
  prod)     ENV_BASENAME=".env.production.local" ;;
  *)        ENV_BASENAME="" ;;
esac

if [ -n "$ENV_BASENAME" ] && [ -f "$SCRIPT_DIR/$ENV_BASENAME" ]; then
  ENV_FILE="$SCRIPT_DIR/$ENV_BASENAME"
  echo "Found stage-specific .env file: $ENV_BASENAME"
fi

# Fallback to default .env files if stage-specific not found
if [ -z "$ENV_FILE" ]; then
  if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_FILE="$SCRIPT_DIR/.env"
    echo "Found .env file in infra directory"
  elif [ -f "$PROJECT_ROOT/.env" ]; then
    ENV_FILE="$PROJECT_ROOT/.env"
    echo "Found .env file in project root"
  else
    echo "ERROR: .env file not found in infra/ or project root"
    echo "Create .env file from an example template and fill in the values:"
    echo "  # Preferred (infra-scoped):"
    echo "  cp infra/env.example infra/.env"
    echo "  # Or project root:"
    echo "  cp infra/env.example .env"
    echo "  # Then edit .env and fill in all required values"
    exit 1
  fi
fi

# Load .env file
echo "Loading environment variables from $ENV_FILE..."
# Export variables from .env file, handling values with spaces and special characters
# set -a automatically exports all variables
set -a
source "$ENV_FILE"
set +a

# Explicitly export critical variables to ensure they're available to child processes
export STRIPE_SECRET_KEY
export STRIPE_WEBHOOK_SECRET
export PUBLIC_API_URL
export PUBLIC_DASHBOARD_URL
export PUBLIC_GALLERY_URL
export PUBLIC_LANDING_URL
export SENDER_EMAIL
export AWS_PROFILE
export CDK_DEFAULT_ACCOUNT
export CDK_DEFAULT_REGION
export STAGE

echo "Environment variables loaded and exported."

# Set AWS_PROFILE if it's defined in .env file
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
  echo "Using AWS profile: $AWS_PROFILE"
  # Verify profile exists
  if ! aws configure list-profiles 2>/dev/null | grep -q "^${AWS_PROFILE}$"; then
    echo "WARNING: AWS profile '$AWS_PROFILE' not found in AWS config"
    echo "Available profiles:"
    aws configure list-profiles 2>/dev/null || echo "  (none found)"
  fi
else
  echo "WARNING: AWS_PROFILE not set in .env file. Using default AWS credentials."
fi

# Helper: hard-require non-empty env var
require_env() {
  local name="$1"
  local value="$2"
  local hint="$3"

  if [ -z "$value" ]; then
    echo "ERROR: $name is not set in .env file"
    if [ -n "$hint" ]; then
      echo "$hint"
    fi
    exit 1
  fi
}

# Validate critical environment variables
if [ -z "$STRIPE_SECRET_KEY" ] || [ "$STRIPE_SECRET_KEY" = "sk_test_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_live_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_test_" ] || [ "$STRIPE_SECRET_KEY" = "sk_live_" ]; then
  echo "ERROR: STRIPE_SECRET_KEY is not set or has placeholder value in .env file"
  echo "Current value: '${STRIPE_SECRET_KEY:0:20}...' (first 20 chars)"
  echo "Please set STRIPE_SECRET_KEY to your actual Stripe secret key"
  exit 1
fi

require_env "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET" "This is required to populate SSM /PixiProof/<stage>/StripeWebhookSecret."
require_env "SENDER_EMAIL" "$SENDER_EMAIL" "This is required to populate SSM /PixiProof/<stage>/SenderEmail (used for notification emails)."

require_env "PUBLIC_DASHBOARD_URL" "$PUBLIC_DASHBOARD_URL" "This is required to populate SSM /PixiProof/<stage>/PublicDashboardUrl (used for redirects, trusted origins, and emails)."
require_env "PUBLIC_GALLERY_URL" "$PUBLIC_GALLERY_URL" "This is required to populate SSM /PixiProof/<stage>/PublicGalleryUrl (used for redirects and links)."
require_env "PUBLIC_LANDING_URL" "$PUBLIC_LANDING_URL" "This is required to populate SSM /PixiProof/<stage>/PublicLandingUrl (used for website links, redirects, and emails)."

# Allow first deploy without PUBLIC_API_URL: use a placeholder (stack will output the real URL)
if [ -z "$PUBLIC_API_URL" ] || [ "$PUBLIC_API_URL" = "" ]; then
  REGION_FOR_PLACEHOLDER="${CDK_DEFAULT_REGION:-eu-west-1}"
  export PUBLIC_API_URL="https://placeholder-first-deploy.execute-api.${REGION_FOR_PLACEHOLDER}.amazonaws.com"
  echo "PUBLIC_API_URL not set; using placeholder for first deploy."
  echo "After deploy, copy the 'API (Lambda) URL' from the outputs below into infra/.env.development.local and redeploy if needed."
fi
if [ "$PUBLIC_API_URL" = "https://your-api-id.execute-api.region.amazonaws.com" ] || [ "$PUBLIC_API_URL" = "https://placeholder-first-deploy.execute-api."* ]; then
  echo "WARNING: PUBLIC_API_URL is a placeholder; update .env after deployment with the real API Gateway URL from stack outputs."
fi

echo "✓ Critical environment variables validated"
echo "✓ STRIPE_SECRET_KEY is set (length: ${#STRIPE_SECRET_KEY} chars, prefix: ${STRIPE_SECRET_KEY:0:10}...)"

# Verify environment variables are exported (for debugging)
echo ""
echo "Verifying environment variables are exported:"
echo "  STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:+SET} (${#STRIPE_SECRET_KEY} chars)"
echo "  PUBLIC_API_URL: ${PUBLIC_API_URL:+SET}"
echo "  PUBLIC_DASHBOARD_URL: ${PUBLIC_DASHBOARD_URL:+SET}"
echo "  PUBLIC_GALLERY_URL: ${PUBLIC_GALLERY_URL:+SET}"
echo "  PUBLIC_LANDING_URL: ${PUBLIC_LANDING_URL:+SET}"
echo "  SENDER_EMAIL: ${SENDER_EMAIL:+SET}"
echo "  STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:+SET}"
echo ""

# Change to infra directory
cd "$SCRIPT_DIR"

# Build Lambda layer (always rebuild to ensure dependencies are up to date)
LAYER_DIR="$SCRIPT_DIR/layers/aws-sdk"
echo "Building Lambda layer (AWS SDK v3 + Express)..."
rm -rf "$LAYER_DIR/nodejs"
mkdir -p "$LAYER_DIR/nodejs"
cp "$LAYER_DIR/package.json" "$LAYER_DIR/nodejs/"
cd "$LAYER_DIR/nodejs"
npm install --production
# Verify critical dependencies are installed
if [ ! -d "node_modules/debug" ] || [ ! -d "node_modules/express" ]; then
  echo "ERROR: Critical dependencies missing from layer!"
  exit 1
fi
cd "$SCRIPT_DIR"
echo "✓ Lambda layer built successfully ($(du -sh "$LAYER_DIR/nodejs/node_modules" | cut -f1))"

# Migrate secrets to SecureString (if needed)
# This ensures GalleryPasswordEncryptionSecret, StripeSecretKey, and StripeWebhookSecret
# are stored as SecureString (encrypted at rest) rather than plain String
echo "Migrating secrets to SecureString..."
if [ -f "$SCRIPT_DIR/../scripts/migrate-secrets-to-secure-string.sh" ]; then
  # Source env vars if .env file exists
  if [ -f "$SCRIPT_DIR/.env.$STAGE.local" ]; then
    set -a
    source "$SCRIPT_DIR/.env.$STAGE.local"
    set +a
  fi
  # Run migration script in non-interactive mode (will use existing SSM values if env vars not set)
  "$SCRIPT_DIR/../scripts/migrate-secrets-to-secure-string.sh" --yes "$STAGE" || {
    echo "Warning: Secret migration had issues. Continuing deployment..."
    echo "You may need to run: ./scripts/migrate-secrets-to-secure-string.sh $STAGE"
  }
else
  echo "Warning: Migration script not found. Secrets may not be SecureString."
  echo "Run manually: ./scripts/migrate-secrets-to-secure-string.sh $STAGE"
fi

# Check for conflicting resources before deploying
echo "Checking for conflicting resources..."
if ! "$SCRIPT_DIR/check-conflicting-resources.sh" "$STAGE"; then
  echo ""
  echo "❌ Conflicting resources detected!"
  echo ""
  echo "To delete conflicting resources, run:"
  echo "  ./scripts/delete-conflicting-resources.sh $STAGE --confirm"
  echo ""
  echo "Or manually delete them via AWS Console/CLI"
  echo ""
  echo "Deployment aborted to prevent resource conflicts."
  exit 1
fi

# Build and deploy
echo "Building infrastructure..."
yarn build

echo "Deploying infrastructure..."
echo "Deploying to account: ${CDK_DEFAULT_ACCOUNT:-unknown}"
echo "Deploying to region: ${CDK_DEFAULT_REGION:-unknown}"
echo "Stage: ${STAGE:-unknown}"

# Use AWS_PROFILE if set, otherwise rely on default credentials
if [ -n "$AWS_PROFILE" ]; then
  AWS_PROFILE="$AWS_PROFILE" yarn deploy --require-approval never
else
  yarn deploy --require-approval never
fi

echo "Deployment complete!"

# Print key outputs (API URL, Cognito domain, CloudFront domain) for easy copy-paste
STACK_NAME="PixiProof-${STAGE}"
REGION="${CDK_DEFAULT_REGION:-eu-west-1}"
echo ""
echo "--- Key outputs for $STAGE ---"
_aws() {
  if [ -n "$AWS_PROFILE" ]; then
    AWS_PROFILE="$AWS_PROFILE" aws "$@"
  else
    aws "$@"
  fi
}
_get_output() {
  _aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey==\`$1\`].OutputValue" --output text 2>/dev/null
}
if _aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].StackId' --output text >/dev/null 2>&1; then
  api_url=$(_get_output HttpApiUrl)
  cognito_domain=$(_get_output UserPoolDomain)
  cognito_hosted_ui=$(_get_output CognitoHostedUiBaseUrl)
  cloudfront_domain=$(_get_output PreviewsDomainName)
  cloudfront_id=$(_get_output PreviewsDistributionId)
  user_pool_id=$(_get_output UserPoolId)
  client_id=$(_get_output UserPoolClientId)
  [ -n "$api_url" ] && echo "API (Lambda) URL:    $api_url"
  [ -n "$cognito_domain" ] && echo "Cognito domain:     $cognito_domain"
  [ -n "$cognito_hosted_ui" ] && echo "Cognito Hosted UI:  $cognito_hosted_ui"
  [ -n "$cloudfront_domain" ] && echo "CloudFront domain:  $cloudfront_domain"
  [ -n "$cloudfront_id" ] && echo "CloudFront dist ID: $cloudfront_id"
  [ -n "$user_pool_id" ] && echo "User Pool ID:       $user_pool_id"
  [ -n "$client_id" ] && echo "User Pool Client:   $client_id"
else
  echo "(Could not fetch stack outputs; stack name: $STACK_NAME)"
fi
echo "---"

