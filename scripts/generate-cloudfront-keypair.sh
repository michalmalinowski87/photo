#!/bin/bash

# CloudFront Key Pair Generator
# This script generates an RSA key pair for CloudFront signed URLs
# Use this if AWS CloudFront requires you to paste a public key manually
#
# Usage:
#   ./scripts/generate-cloudfront-keypair.sh [output-directory]
#
# Example:
#   ./scripts/generate-cloudfront-keypair.sh ~/cloudfront-keys

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set output directory (default to current directory)
OUTPUT_DIR="${1:-$(pwd)}"

# Validate output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo -e "${RED}Error: Output directory does not exist: $OUTPUT_DIR${NC}"
    exit 1
fi

# Generate filenames with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PRIVATE_KEY_FILE="$OUTPUT_DIR/cloudfront-private-key-$TIMESTAMP.pem"
PUBLIC_KEY_FILE="$OUTPUT_DIR/cloudfront-public-key-$TIMESTAMP.pem"

echo -e "${BLUE}CloudFront Key Pair Generator${NC}"
echo "===================================="
echo "Output directory: $OUTPUT_DIR"
echo ""

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}Error: openssl is not installed${NC}"
    echo "Install it with:"
    echo "  macOS: brew install openssl"
    echo "  Ubuntu/Debian: sudo apt-get install openssl"
    echo "  RHEL/CentOS: sudo yum install openssl"
    exit 1
fi

# Generate private key
echo -e "${YELLOW}Generating 2048-bit RSA private key...${NC}"
if openssl genrsa -out "$PRIVATE_KEY_FILE" 2048 2>/dev/null; then
    # Set secure permissions on private key
    chmod 600 "$PRIVATE_KEY_FILE"
    
    # Verify file was created
    if [ -f "$PRIVATE_KEY_FILE" ]; then
        FILE_SIZE=$(wc -c < "$PRIVATE_KEY_FILE")
        echo -e "${GREEN}✓ Private key generated successfully${NC}"
        echo -e "  File: $PRIVATE_KEY_FILE"
        echo -e "  Size: $FILE_SIZE bytes"
    else
        echo -e "${RED}✗ Private key file was not created${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Failed to generate private key${NC}"
    exit 1
fi

# Extract public key
echo -e "${YELLOW}Extracting public key...${NC}"
if openssl rsa -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE" 2>/dev/null; then
    chmod 644 "$PUBLIC_KEY_FILE"
    
    # Verify file was created
    if [ -f "$PUBLIC_KEY_FILE" ]; then
        FILE_SIZE=$(wc -c < "$PUBLIC_KEY_FILE")
        echo -e "${GREEN}✓ Public key extracted successfully${NC}"
        echo -e "  File: $PUBLIC_KEY_FILE"
        echo -e "  Size: $FILE_SIZE bytes"
    else
        echo -e "${RED}✗ Public key file was not created${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Failed to extract public key${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Key pair generation complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. Open AWS CloudFront Console:"
echo "   https://console.aws.amazon.com/cloudfront/v3/home#/public-key"
echo ""
echo "2. Click 'Create public key'"
echo ""
echo "3. Copy the public key content:"
echo "   ${YELLOW}cat $PUBLIC_KEY_FILE${NC}"
echo ""
echo "4. Paste the entire output (including BEGIN/END lines) into the CloudFront console"
echo ""
echo "5. After creating the public key, create a key pair and note the Key Pair ID"
echo ""
echo "6. Use the private key file with the setup script:"
echo "   ${YELLOW}./scripts/setup-cloudfront-keys.sh <stage> <KEY_PAIR_ID> $PRIVATE_KEY_FILE${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Keep the private key file secure!${NC}"
echo "   - Never commit it to git"
echo "   - Store it securely or delete it after uploading to SSM"
echo ""
