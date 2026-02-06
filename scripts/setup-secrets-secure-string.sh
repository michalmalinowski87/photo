#!/bin/bash

# Setup script to create SecureString parameters for secrets
# Similar to setup-cloudfront-keys.sh, but for application secrets
#
# Usage:
#   ./scripts/setup-secrets-secure-string.sh <stage>
#
# Example:
#   ./scripts/setup-secrets-secure-string.sh dev
#
# Note: This script reads values from environment variables:
#   - GALLERY_PASSWORD_ENCRYPTION_SECRET
#   - STRIPE_SECRET_KEY
#   - STRIPE_WEBHOOK_SECRET

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Missing required argument${NC}"
    echo ""
    echo "Usage: $0 <stage>"
    echo ""
    echo "Arguments:"
    echo "  stage - Deployment stage (e.g., dev, prod, staging)"
    echo ""
    echo "Example:"
    echo "  $0 dev"
    echo ""
    echo "Required environment variables:"
    echo "  GALLERY_PASSWORD_ENCRYPTION_SECRET"
    echo "  STRIPE_SECRET_KEY"
    echo "  STRIPE_WEBHOOK_SECRET"
    exit 1
fi

STAGE=$1
SSM_PREFIX="/PixiProof/$STAGE"

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|prod|staging)$ ]]; then
    echo -e "${YELLOW}Warning: Stage '$STAGE' is not a standard value (dev/prod/staging)${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check required environment variables
MISSING_VARS=()
if [ -z "${GALLERY_PASSWORD_ENCRYPTION_SECRET:-}" ]; then
    MISSING_VARS+=("GALLERY_PASSWORD_ENCRYPTION_SECRET")
fi
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    MISSING_VARS+=("STRIPE_SECRET_KEY")
fi
if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
    MISSING_VARS+=("STRIPE_WEBHOOK_SECRET")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  - $var"
    done
    echo ""
    echo "Please set these variables in your environment or .env file"
    echo "Example:"
    echo "  export GALLERY_PASSWORD_ENCRYPTION_SECRET='your-secret'"
    echo "  export STRIPE_SECRET_KEY='sk_test_...'"
    echo "  export STRIPE_WEBHOOK_SECRET='whsec_...'"
    exit 1
fi

echo -e "${GREEN}SSM SecureString Setup${NC}"
echo "================================"
echo "Stage: $STAGE"
echo "SSM Prefix: $SSM_PREFIX"
echo ""

# Confirm before proceeding
read -p "Proceed with storing secrets as SecureString in SSM? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""

# Function to create/update SecureString parameter
create_secure_string() {
    local param_name=$1
    local param_value=$2
    local description=$3
    local param_path="${SSM_PREFIX}/${param_name}"
    
    echo -e "${YELLOW}Storing $param_name in SSM Parameter Store...${NC}"
    
    aws ssm put-parameter \
        --name "$param_path" \
        --type "SecureString" \
        --value "$param_value" \
        --description "$description" \
        --overwrite \
        > /dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $param_name stored successfully${NC}"
    else
        echo -e "${RED}✗ Failed to store $param_name${NC}"
        return 1
    fi
}

# Store GalleryPasswordEncryptionSecret
create_secure_string \
    "GalleryPasswordEncryptionSecret" \
    "$GALLERY_PASSWORD_ENCRYPTION_SECRET" \
    "Secret used to encrypt client gallery passwords stored in DynamoDB (AES-256-GCM, versioned) - $STAGE"

# Store StripeSecretKey
create_secure_string \
    "StripeSecretKey" \
    "$STRIPE_SECRET_KEY" \
    "Stripe secret key for payment processing - $STAGE"

# Store StripeWebhookSecret
create_secure_string \
    "StripeWebhookSecret" \
    "$STRIPE_WEBHOOK_SECRET" \
    "Stripe webhook secret for webhook verification - $STAGE"

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Verification:"
echo "  To verify parameters were created (won't show values for security):"
echo "    aws ssm describe-parameters --parameter-filters \"Key=Name,Values=$SSM_PREFIX/GalleryPasswordEncryptionSecret,$SSM_PREFIX/StripeSecretKey,$SSM_PREFIX/StripeWebhookSecret\" --query 'Parameters[*].[Name,Type]' --output table"
echo ""
echo "  To verify a parameter exists and get its type:"
echo "    aws ssm describe-parameters --parameter-filters \"Key=Name,Values=$SSM_PREFIX/StripeSecretKey\" --query 'Parameters[0].[Name,Type]' --output table"
echo ""
echo "Next steps:"
echo "  1. Deploy your CDK stack (it will no longer try to manage these parameters)"
echo "  2. Your Lambda functions will automatically read these SecureString parameters"
echo "  3. Parameters are encrypted at rest using AWS KMS (alias/aws/ssm)"
