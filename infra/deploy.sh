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
  echo "Create .env file from .env.example and fill in the values:"
  echo "  cp .env.example .env"
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
export SENDER_EMAIL

echo "Environment variables loaded and exported."

# Validate critical environment variables
if [ -z "$STRIPE_SECRET_KEY" ] || [ "$STRIPE_SECRET_KEY" = "sk_test_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_live_..." ] || [ "$STRIPE_SECRET_KEY" = "sk_test_" ] || [ "$STRIPE_SECRET_KEY" = "sk_live_" ]; then
  echo "ERROR: STRIPE_SECRET_KEY is not set or has placeholder value in .env file"
  echo "Current value: '${STRIPE_SECRET_KEY:0:20}...' (first 20 chars)"
  echo "Please set STRIPE_SECRET_KEY to your actual Stripe secret key"
  exit 1
fi

if [ -z "$PUBLIC_API_URL" ] || [ "$PUBLIC_API_URL" = "https://your-api-id.execute-api.region.amazonaws.com" ]; then
  echo "WARNING: PUBLIC_API_URL is not set or has placeholder value"
  echo "This may cause issues. Update it after first deployment with the actual API Gateway URL"
fi

echo "✓ Critical environment variables validated"
echo "✓ STRIPE_SECRET_KEY is set (length: ${#STRIPE_SECRET_KEY} chars, prefix: ${STRIPE_SECRET_KEY:0:10}...)"

# Verify environment variables are exported (for debugging)
echo ""
echo "Verifying environment variables are exported:"
echo "  STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:+SET} (${#STRIPE_SECRET_KEY} chars)"
echo "  PUBLIC_API_URL: ${PUBLIC_API_URL:+SET}"
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

