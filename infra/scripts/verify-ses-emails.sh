#!/bin/bash
# Script to verify email addresses in AWS SES
# Usage: ./scripts/verify-ses-emails.sh <stage> [email1] [email2] ...
# If no emails provided, verifies SENDER_EMAIL from .env file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_ARG="${1:-dev}"

# Map stage to .env file
case "$STAGE_ARG" in
  dev)      ENV_FILE="$INFRA_DIR/.env.development.local" ;;
  staging)  ENV_FILE="$INFRA_DIR/.env.staging.local" ;;
  prod)     ENV_FILE="$INFRA_DIR/.env.production.local" ;;
  *)        echo "Invalid stage: $STAGE_ARG. Use: dev, staging, or prod"; exit 1 ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found: $ENV_FILE"
  exit 1
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Set AWS_PROFILE if configured
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
fi

REGION="${CDK_DEFAULT_REGION:-eu-west-1}"

# Get emails to verify
if [ $# -gt 1 ]; then
  # Emails provided as arguments
  shift
  EMAILS=("$@")
else
  # Use SENDER_EMAIL from .env file
  if [ -z "$SENDER_EMAIL" ]; then
    echo "ERROR: SENDER_EMAIL not set in $ENV_FILE"
    exit 1
  fi
  EMAILS=("$SENDER_EMAIL")
fi

echo "🔐 Verifying email addresses in AWS SES (region: $REGION)"
echo "Stage: $STAGE_ARG"
echo ""

for email in "${EMAILS[@]}"; do
  echo "📧 Verifying: $email"
  
  # Check if already verified
  STATUS=$(aws sesv2 get-email-identity \
    --email-identity "$email" \
    --region "$REGION" \
    --query 'VerificationStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")
  
  if [ "$STATUS" = "SUCCESS" ]; then
    echo "   ✅ Already verified"
    continue
  elif [ "$STATUS" = "PENDING" ]; then
    echo "   ⏳ Verification pending - check your email for verification link"
    continue
  fi
  
  # Create email identity (sends verification email)
  echo "   📨 Sending verification email..."
  RESULT=$(aws sesv2 create-email-identity \
    --email-identity "$email" \
    --region "$REGION" \
    --output json 2>&1)
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Verification email sent to $email"
    echo "   📬 Check your inbox and click the verification link"
  else
    if echo "$RESULT" | grep -q "already exists"; then
      echo "   ⚠️  Email identity already exists (may be pending verification)"
    else
      echo "   ❌ Failed to send verification email:"
      echo "   $RESULT"
    fi
  fi
  echo ""
done

echo "💡 Note: In SES sandbox mode, you can only send emails:"
echo "   - FROM verified email addresses"
echo "   - TO verified email addresses"
echo ""
echo "To send to any email address, request production access:"
echo "   https://console.aws.amazon.com/ses/home?region=$REGION#/account/dashboard"
