#!/bin/bash
# Deploy script that loads .env file before deploying
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try to load .env file from multiple locations (infra dir first, then project root)
ENV_FILE=""
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

echo "Environment variables loaded and exported."

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

require_env "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET" "This is required to populate SSM /PhotoHub/<stage>/StripeWebhookSecret."
require_env "SENDER_EMAIL" "$SENDER_EMAIL" "This is required to populate SSM /PhotoHub/<stage>/SenderEmail (used for notification emails)."

require_env "PUBLIC_DASHBOARD_URL" "$PUBLIC_DASHBOARD_URL" "This is required to populate SSM /PhotoHub/<stage>/PublicDashboardUrl (used for redirects, trusted origins, and emails)."
require_env "PUBLIC_GALLERY_URL" "$PUBLIC_GALLERY_URL" "This is required to populate SSM /PhotoHub/<stage>/PublicGalleryUrl (used for redirects and links)."
require_env "PUBLIC_LANDING_URL" "$PUBLIC_LANDING_URL" "This is required to populate SSM /PhotoHub/<stage>/PublicLandingUrl (used for website links, redirects, and emails)."

require_env "PUBLIC_API_URL" "$PUBLIC_API_URL" "Set this to the API Gateway URL. For the very first deploy you can temporarily set a placeholder and update it after the stack outputs the real URL."
if [ "$PUBLIC_API_URL" = "https://your-api-id.execute-api.region.amazonaws.com" ]; then
  echo "WARNING: PUBLIC_API_URL is still a placeholder value"
  echo "Update it after deployment with the actual API Gateway URL"
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

# Build and deploy
echo "Building infrastructure..."
yarn build

echo "Deploying infrastructure..."
yarn deploy --require-approval never

echo "Deployment complete!"

