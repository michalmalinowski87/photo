#!/bin/bash

# CloudFront Key Pair Setup Script
# This script helps set up CloudFront key pair for signed URLs (ZIP downloads)
#
# Usage:
#   ./scripts/setup-cloudfront-keys.sh <stage> <key-pair-id> <private-key-file>
#
# Example:
#   ./scripts/setup-cloudfront-keys.sh dev K1234567890ABC ~/Downloads/pk-APKAIOSFODNN7EXAMPLE.pem

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 3 ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo ""
    echo "Usage: $0 <stage> <key-pair-id> <private-key-file>"
    echo ""
echo "Arguments:"
echo "  stage           - Deployment stage (e.g., dev, prod)"
echo "  key-pair-id     - CloudFront Public Key ID from console (e.g., K1234567890ABC)"
echo "  private-key-file - Path to the private key .pem file"
    echo ""
    echo "Example:"
    echo "  $0 dev K1234567890ABC ~/Downloads/pk-APKAIOSFODNN7EXAMPLE.pem"
    exit 1
fi

STAGE=$1
KEY_PAIR_ID=$2
PRIVATE_KEY_FILE=$3

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|prod|staging)$ ]]; then
    echo -e "${YELLOW}Warning: Stage '$STAGE' is not a standard value (dev/prod/staging)${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Validate key pair ID format (CloudFront Public Key IDs can start with K or APK)
if [[ ! "$KEY_PAIR_ID" =~ ^(K|APK)[A-Z0-9]+$ ]]; then
    echo -e "${RED}Error: Public Key ID must start with 'K' or 'APK' and contain only uppercase letters and numbers${NC}"
    echo "Example: K1234567890ABC or APKAIOSFODNN7EXAMPLE"
    exit 1
fi

# Check if private key file exists
if [ ! -f "$PRIVATE_KEY_FILE" ]; then
    echo -e "${RED}Error: Private key file not found: $PRIVATE_KEY_FILE${NC}"
    exit 1
fi

# Validate private key file format
if ! grep -q "BEGIN RSA PRIVATE KEY\|BEGIN PRIVATE KEY" "$PRIVATE_KEY_FILE"; then
    echo -e "${RED}Error: File does not appear to be a valid PEM private key${NC}"
    echo "Expected to find 'BEGIN RSA PRIVATE KEY' or 'BEGIN PRIVATE KEY'"
    exit 1
fi

# Set SSM parameter paths
SSM_PREFIX="/PixiProof/$STAGE"
PRIVATE_KEY_PARAM="$SSM_PREFIX/CloudFrontPrivateKey"
KEY_PAIR_ID_PARAM="$SSM_PREFIX/CloudFrontKeyPairId"

echo -e "${GREEN}CloudFront Key Pair Setup${NC}"
echo "================================"
echo "Stage: $STAGE"
echo "Public Key ID (from CloudFront): $KEY_PAIR_ID"
echo "Private Key File: $PRIVATE_KEY_FILE"
echo "SSM Private Key Parameter: $PRIVATE_KEY_PARAM"
echo "SSM Public Key ID Parameter: $KEY_PAIR_ID_PARAM"
echo ""

# Confirm before proceeding
read -p "Proceed with storing these values in SSM Parameter Store? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Store private key in SSM (SecureString)
echo -e "${YELLOW}Storing private key in SSM Parameter Store...${NC}"
PRIVATE_KEY_CONTENT=$(cat "$PRIVATE_KEY_FILE")
aws ssm put-parameter \
    --name "$PRIVATE_KEY_PARAM" \
    --type "SecureString" \
    --value "$PRIVATE_KEY_CONTENT" \
    --description "CloudFront private key for signed URLs (ZIP downloads) - $STAGE" \
    --overwrite

# Clear the variable from memory
unset PRIVATE_KEY_CONTENT

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Private key stored successfully${NC}"
else
    echo -e "${RED}✗ Failed to store private key${NC}"
    exit 1
fi

# Store public key ID in SSM (String)
echo -e "${YELLOW}Storing public key ID in SSM Parameter Store...${NC}"
aws ssm put-parameter \
    --name "$KEY_PAIR_ID_PARAM" \
    --type "String" \
    --value "$KEY_PAIR_ID" \
    --description "CloudFront public key ID (used as Key-Pair-Id) for signed URLs (ZIP downloads) - $STAGE" \
    --overwrite

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Public key ID stored successfully${NC}"
else
    echo -e "${RED}✗ Failed to store public key ID${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Verification:"
echo "  To verify the public key ID was stored:"
echo "    aws ssm get-parameter --name \"$KEY_PAIR_ID_PARAM\" --query 'Parameter.Value' --output text"
echo ""
echo "  To verify the private key exists (won't show value for security):"
echo "    aws ssm describe-parameters --parameter-filters \"Key=Name,Values=$PRIVATE_KEY_PARAM\""
echo ""
echo "Next steps:"
echo "  1. Ensure your CloudFront distribution has a key group with this public key"
echo "  2. Ensure the cache behavior for ZIP files uses 'Restrict Viewer Access' with the key group"
echo "  3. Deploy your Lambda functions (if not already deployed)"
echo "  4. Test ZIP download functionality"
echo "  5. Monitor CloudWatch logs for any errors"
echo ""
