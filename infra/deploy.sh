#!/bin/bash
# Deploy script that loads .env file before deploying
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STAGE_ARG="${1:-}"

# Map short stage names to .env file names (dev -> development, prod -> production)
case "$STAGE_ARG" in
  dev)      ENV_BASENAME=".env.development.local" ;;
  staging)  ENV_BASENAME=".env.staging.local" ;;
  prod)     ENV_BASENAME=".env.production.local" ;;
  *)        ENV_BASENAME="" ;;
esac
if [ -z "$STAGE_ARG" ]; then
  echo "ERROR: Stage argument is required (dev|staging|prod)"
  exit 1
fi

# Helper: load infra/.env.<stage>.local (for AWS_PROFILE, STAGE, and any local-only vars)
load_stage_env_file() {
  local env_path="$SCRIPT_DIR/$ENV_BASENAME"
  if [ ! -f "$env_path" ]; then
    echo "ERROR: $ENV_BASENAME not found in infra/. Create it from infra/env.example and fill required values."
    exit 1
  fi

  echo "Loading environment variables from $ENV_BASENAME..."
  set -a
  # shellcheck disable=SC1090
  source "$env_path"
  set +a
}

# Always load the stage env file so we at least get AWS_PROFILE, STAGE, account/region
load_stage_env_file

# Ensure STAGE is set and matches the argument
export STAGE="${STAGE:-$STAGE_ARG}"
if [ "$STAGE" != "$STAGE_ARG" ]; then
  echo "WARNING: STAGE in .env ($STAGE) does not match argument ($STAGE_ARG). Using argument."
  STAGE="$STAGE_ARG"
fi

# Set AWS profile if defined
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
  echo "Using AWS profile: $AWS_PROFILE"
else
  echo "WARNING: AWS_PROFILE not set in infra/$ENV_BASENAME. Using default AWS credentials."
fi

# Helper: hard-require non-empty env var (used for dev-only checks)
require_env() {
  local name="$1"
  local value="$2"
  local hint="$3"

  if [ -z "$value" ]; then
    echo "ERROR: $name is not set"
    if [ -n "$hint" ]; then
      echo "$hint"
    fi
    exit 1
  fi
}

# For staging/prod, read all config (including secrets) from SSM as much as possible
if [ "$STAGE" != "dev" ]; then
  echo "Staging/Production deployment: reading configuration from SSM Parameter Store (including secrets)..."

  REGION="${CDK_DEFAULT_REGION:-$AWS_REGION}"
  if [ -z "$REGION" ]; then
    REGION="eu-west-1"
  fi

  SSM_PREFIX="/PixiProof/${STAGE}"

  _aws() {
    if [ -n "$AWS_PROFILE" ]; then
      AWS_PROFILE="$AWS_PROFILE" aws "$@"
    else
      aws "$@"
    fi
  }

  # Non-secret config (String or SecureString)
  export SENDER_EMAIL=$(_aws ssm get-parameter --name "${SSM_PREFIX}/SenderEmail" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export PUBLIC_API_URL=$(_aws ssm get-parameter --name "${SSM_PREFIX}/PublicApiUrl" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export PUBLIC_DASHBOARD_URL=$(_aws ssm get-parameter --name "${SSM_PREFIX}/PublicDashboardUrl" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export PUBLIC_GALLERY_URL=$(_aws ssm get-parameter --name "${SSM_PREFIX}/PublicGalleryUrl" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export PUBLIC_LANDING_URL=$(_aws ssm get-parameter --name "${SSM_PREFIX}/PublicLandingUrl" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")

  # Stripe & gallery secrets (now SecureString)
  export STRIPE_SECRET_KEY=$(_aws ssm get-parameter --name "${SSM_PREFIX}/StripeSecretKey" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export STRIPE_WEBHOOK_SECRET=$(_aws ssm get-parameter --name "${SSM_PREFIX}/StripeWebhookSecret" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  export GALLERY_PASSWORD_ENCRYPTION_SECRET=$(_aws ssm get-parameter --name "${SSM_PREFIX}/GalleryPasswordEncryptionSecret" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")

  # Optional/advanced config
  export STRIPE_EVENTBRIDGE_SOURCE_NAME=$(_aws ssm get-parameter --name "${SSM_PREFIX}/StripeEventBridgeSourceName" --region "$REGION" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")

  # Validate required parameters
  if [ -z "$SENDER_EMAIL" ]; then
    echo "ERROR: SSM parameter ${SSM_PREFIX}/SenderEmail not found or empty"
    exit 1
  fi
  if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo "ERROR: SSM parameter ${SSM_PREFIX}/StripeSecretKey not found or empty"
    exit 1
  fi
  if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    echo "ERROR: SSM parameter ${SSM_PREFIX}/StripeWebhookSecret not found or empty"
    exit 1
  fi
  if [ -z "$GALLERY_PASSWORD_ENCRYPTION_SECRET" ]; then
    echo "ERROR: SSM parameter ${SSM_PREFIX}/GalleryPasswordEncryptionSecret not found or empty"
    exit 1
  fi

  # Allow PUBLIC_API_URL to be empty on first deploy; CDK uses placeholder
  if [ -z "$PUBLIC_API_URL" ]; then
    REGION_FOR_PLACEHOLDER="${REGION}"
    export PUBLIC_API_URL="https://placeholder-first-deploy.execute-api.${REGION_FOR_PLACEHOLDER}.amazonaws.com"
    echo "PUBLIC_API_URL not set in SSM; using placeholder for first deploy."
  fi

  export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-$REGION}"

  echo "✓ SSM parameters loaded and exported for CDK synthesis (stage: $STAGE)"
else
  # Dev: use local .env.development.local for everything (fastest DX)
  echo "Development deployment: using infra/$ENV_BASENAME for configuration (including secrets)."

  # Validate critical secrets in dev
  if [ -z "$STRIPE_SECRET_KEY" ] || [ "$STRIPE_SECRET_KEY" = "sk_test_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_live_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_test_" ] || [ "$STRIPE_SECRET_KEY" = "sk_live_" ]; then
    echo "ERROR: STRIPE_SECRET_KEY is not set or has placeholder value in $ENV_BASENAME"
    echo "Current value: '${STRIPE_SECRET_KEY:0:20}...' (first 20 chars)"
    echo "Please set STRIPE_SECRET_KEY to your actual Stripe secret key"
    exit 1
  fi

  require_env "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET" "This is required for local webhook testing."
  require_env "SENDER_EMAIL" "$SENDER_EMAIL" "This is required for sending emails."
  require_env "PUBLIC_DASHBOARD_URL" "$PUBLIC_DASHBOARD_URL" "Required for redirects and trusted origins."
  require_env "PUBLIC_GALLERY_URL" "$PUBLIC_GALLERY_URL" "Required for redirects and links."
  require_env "PUBLIC_LANDING_URL" "$PUBLIC_LANDING_URL" "Required for website links, redirects, and emails."

  # Allow first deploy without PUBLIC_API_URL in dev: use placeholder (stack will output the real URL)
  if [ -z "$PUBLIC_API_URL" ] || [ "$PUBLIC_API_URL" = "" ]; then
    REGION_FOR_PLACEHOLDER="${CDK_DEFAULT_REGION:-$AWS_REGION:-eu-west-1}"
    export PUBLIC_API_URL="https://placeholder-first-deploy.execute-api.${REGION_FOR_PLACEHOLDER}.amazonaws.com"
    echo "PUBLIC_API_URL not set; using placeholder for first dev deploy."
  fi

  export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-$AWS_REGION:-eu-west-1}"
fi

echo "Environment variables prepared for stage: $STAGE"

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

# Check for conflicting resources before first deploy only
# If the CloudFormation stack already exists in a stable state, we skip this check
STACK_NAME="PixiProof-${STAGE}"
REGION_FOR_CHECK="${CDK_DEFAULT_REGION:-eu-west-1}"

_aws_conflict_check() {
  if [ -n "$AWS_PROFILE" ]; then
    AWS_PROFILE="$AWS_PROFILE" aws "$@"
  else
    aws "$@"
  fi
}

EXISTING_STACK_STATUS=$(_aws_conflict_check cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION_FOR_CHECK" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_STACK_STATUS" ] && \
   [[ "$EXISTING_STACK_STATUS" =~ ^(CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE|IMPORT_COMPLETE|IMPORT_ROLLBACK_COMPLETE)$ ]]; then
  echo "Existing CloudFormation stack '$STACK_NAME' found with status '$EXISTING_STACK_STATUS'."
  echo "Skipping conflicting-resources check (DynamoDB/S3/Cognito are managed by CDK)."
else
  echo "No stable existing stack '$STACK_NAME' found (status: '${EXISTING_STACK_STATUS:-<none>}' )."
  echo "Running conflicting-resources check to avoid first-deploy name collisions..."
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

