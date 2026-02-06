#!/bin/bash

# Migration script to convert SSM String parameters to SecureString
# This script migrates:
#   - GalleryPasswordEncryptionSecret
#   - StripeSecretKey
#   - StripeWebhookSecret
#
# Usage:
#   ./scripts/migrate-secrets-to-secure-string.sh <stage>
#
# Example:
#   ./scripts/migrate-secrets-to-secure-string.sh dev

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
NON_INTERACTIVE=false
if [ "$1" = "--yes" ] || [ "$1" = "-y" ]; then
    NON_INTERACTIVE=true
    shift
fi

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Missing required argument${NC}"
    echo ""
    echo "Usage: $0 [--yes] <stage>"
    echo ""
    echo "Arguments:"
    echo "  --yes, -y  - Non-interactive mode (skip confirmation prompts)"
    echo "  stage      - Deployment stage (e.g., dev, prod, staging)"
    echo ""
    echo "Example:"
    echo "  $0 dev"
    echo "  $0 --yes dev"
    exit 1
fi

STAGE=$1
SSM_PREFIX="/PixiProof/$STAGE"

# Parameters to migrate
PARAMS=(
    "GalleryPasswordEncryptionSecret"
    "StripeSecretKey"
    "StripeWebhookSecret"
)

echo -e "${GREEN}SSM SecureString Migration${NC}"
echo "================================"
echo "Stage: $STAGE"
echo "SSM Prefix: $SSM_PREFIX"
echo ""

# Function to migrate a parameter from String to SecureString
migrate_param() {
    local param_name=$1
    local param_path="${SSM_PREFIX}/${param_name}"
    local env_var_name=""
    
    # Map parameter names to environment variable names
    case $param_name in
        "GalleryPasswordEncryptionSecret")
            env_var_name="GALLERY_PASSWORD_ENCRYPTION_SECRET"
            ;;
        "StripeSecretKey")
            env_var_name="STRIPE_SECRET_KEY"
            ;;
        "StripeWebhookSecret")
            env_var_name="STRIPE_WEBHOOK_SECRET"
            ;;
        *)
            echo -e "${RED}Error: Unknown parameter name: $param_name${NC}"
            return 1
            ;;
    esac
    
    echo -e "${YELLOW}Processing: $param_name${NC}"
    
    # Check if parameter exists
    if aws ssm describe-parameters --parameter-filters "Key=Name,Values=$param_path" --query 'Parameters[0]' --output json 2>/dev/null | grep -q "Name"; then
        # Get parameter details
        local param_type=$(aws ssm describe-parameters --parameter-filters "Key=Name,Values=$param_path" --query 'Parameters[0].Type' --output text 2>/dev/null || echo "")
        
        if [ "$param_type" = "SecureString" ]; then
            echo -e "  ${GREEN}✓ Already SecureString, updating value...${NC}"
            # Parameter is already SecureString, just update the value
            if [ -z "${!env_var_name}" ]; then
                echo -e "  ${RED}✗ Error: $env_var_name is not set in environment${NC}"
                return 1
            fi
            aws ssm put-parameter \
                --name "$param_path" \
                --type "SecureString" \
                --value "${!env_var_name}" \
                --overwrite \
                --description "Migrated to SecureString - $param_name for $STAGE" \
                > /dev/null
            echo -e "  ${GREEN}✓ Updated successfully${NC}"
        elif [ "$param_type" = "String" ]; then
            echo -e "  ${YELLOW}⚠ Found as String type, migrating to SecureString...${NC}"
            # Read current value
            local current_value=$(aws ssm get-parameter --name "$param_path" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
            
            if [ -z "$current_value" ]; then
                echo -e "  ${RED}✗ Error: Could not read current value from SSM${NC}"
                return 1
            fi
            
            # Use env var if available, otherwise use current SSM value
            local new_value="${!env_var_name:-$current_value}"
            
            if [ -z "$new_value" ]; then
                echo -e "  ${RED}✗ Error: No value available (neither from env var $env_var_name nor SSM)${NC}"
                return 1
            fi
            
            # Delete old String parameter
            echo -e "  ${YELLOW}  Deleting old String parameter...${NC}"
            aws ssm delete-parameter --name "$param_path" 2>/dev/null || true
            
            # Create new SecureString parameter
            echo -e "  ${YELLOW}  Creating new SecureString parameter...${NC}"
            aws ssm put-parameter \
                --name "$param_path" \
                --type "SecureString" \
                --value "$new_value" \
                --description "Migrated from String to SecureString - $param_name for $STAGE" \
                > /dev/null
            
            echo -e "  ${GREEN}✓ Migrated successfully${NC}"
        else
            echo -e "  ${YELLOW}⚠ Unknown type ($param_type), creating/updating as SecureString...${NC}"
            # Unknown type, create/update as SecureString
            local value="${!env_var_name}"
            if [ -z "$value" ]; then
                # Try to read from SSM if env var not set
                value=$(aws ssm get-parameter --name "$param_path" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
            fi
            
            if [ -z "$value" ]; then
                echo -e "  ${RED}✗ Error: No value available (neither from env var $env_var_name nor SSM)${NC}"
                return 1
            fi
            
            aws ssm put-parameter \
                --name "$param_path" \
                --type "SecureString" \
                --value "$value" \
                --overwrite \
                --description "Migrated to SecureString - $param_name for $STAGE" \
                > /dev/null
            
            echo -e "  ${GREEN}✓ Created/updated successfully${NC}"
        fi
    else
        # Parameter doesn't exist, create it as SecureString
        echo -e "  ${YELLOW}⚠ Parameter not found, creating as SecureString...${NC}"
        
        if [ -z "${!env_var_name}" ]; then
            echo -e "  ${RED}✗ Error: $env_var_name is not set in environment${NC}"
            echo -e "  ${YELLOW}  Hint: Set this environment variable before running migration${NC}"
            return 1
        fi
        
        aws ssm put-parameter \
            --name "$param_path" \
            --type "SecureString" \
            --value "${!env_var_name}" \
            --description "Created as SecureString - $param_name for $STAGE" \
            > /dev/null
        
        echo -e "  ${GREEN}✓ Created successfully${NC}"
    fi
    
    echo ""
}

# Check required environment variables
MISSING_ENV_VARS=()
for param in "${PARAMS[@]}"; do
    case $param in
        "GalleryPasswordEncryptionSecret")
            if [ -z "${GALLERY_PASSWORD_ENCRYPTION_SECRET:-}" ]; then
                MISSING_ENV_VARS+=("GALLERY_PASSWORD_ENCRYPTION_SECRET")
            fi
            ;;
        "StripeSecretKey")
            if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
                MISSING_ENV_VARS+=("STRIPE_SECRET_KEY")
            fi
            ;;
        "StripeWebhookSecret")
            if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
                MISSING_ENV_VARS+=("STRIPE_WEBHOOK_SECRET")
            fi
            ;;
    esac
done

if [ ${#MISSING_ENV_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Warning: Some environment variables are not set:${NC}"
    for var in "${MISSING_ENV_VARS[@]}"; do
        echo -e "  - $var"
    done
    echo ""
    echo -e "${YELLOW}The script will attempt to use existing SSM values if available.${NC}"
    echo ""
fi

# Confirm before proceeding (unless non-interactive)
if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Proceed with migration? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# Migrate each parameter
FAILED_PARAMS=()
for param in "${PARAMS[@]}"; do
    if ! migrate_param "$param"; then
        FAILED_PARAMS+=("$param")
    fi
done

echo ""
echo "================================"

if [ ${#FAILED_PARAMS[@]} -eq 0 ]; then
    echo -e "${GREEN}Migration complete! All parameters are now SecureString.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Remove the StringParameter definitions from infra/lib/app-stack.ts"
    echo "  2. Deploy your CDK stack (it will no longer try to manage these parameters)"
    echo "  3. Verify parameters are SecureString:"
    echo "     aws ssm describe-parameters --parameter-filters \"Key=Name,Values=$SSM_PREFIX/GalleryPasswordEncryptionSecret,$SSM_PREFIX/StripeSecretKey,$SSM_PREFIX/StripeWebhookSecret\" --query 'Parameters[*].[Name,Type]' --output table"
    exit 0
else
    echo -e "${RED}Migration failed for the following parameters:${NC}"
    for param in "${FAILED_PARAMS[@]}"; do
        echo -e "  - $param"
    done
    echo ""
    echo "Please fix the errors above and try again."
    exit 1
fi
