#!/bin/bash
# Helper script to delete a Cognito domain
# Usage: ./delete-cognito-domain.sh <domain-prefix> [region]

set -e

DOMAIN_PREFIX="${1:-}"
REGION="${2:-eu-west-1}"

if [ -z "$DOMAIN_PREFIX" ]; then
  echo "Usage: $0 <domain-prefix> [region]"
  echo "Example: $0 pixiproof-dev eu-west-1"
  echo ""
  echo "This script deletes a Cognito domain by its prefix."
  exit 1
fi

# Load AWS profile if set
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
fi

echo "Deleting Cognito domain: $DOMAIN_PREFIX"
echo "Region: $REGION"
echo ""

# Check if domain exists
echo "Checking if domain exists..."
DOMAIN_INFO=$(aws cognito-idp describe-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>/dev/null || echo "")

if [ -z "$DOMAIN_INFO" ]; then
  echo "❌ Domain '$DOMAIN_PREFIX' not found"
  exit 1
fi

# Get User Pool ID (if domain is attached to a pool)
POOL_ID=$(echo "$DOMAIN_INFO" | jq -r '.DomainDescription.UserPoolId // empty' 2>/dev/null || echo "")
DOMAIN_NAME=$(echo "$DOMAIN_INFO" | jq -r '.DomainDescription.Domain // empty' 2>/dev/null || echo "")

if [ -n "$POOL_ID" ]; then
  echo "⚠️  Domain is attached to User Pool: $POOL_ID"
  echo "   Domain name: $DOMAIN_NAME"
  echo ""
  echo "Note: You may need to delete the User Pool first, or this domain"
  echo "      will be automatically deleted when the pool is deleted."
  echo ""
  read -p "Continue with domain deletion? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# Delete the domain
echo "Deleting domain..."
if aws cognito-idp delete-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION"; then
  echo "✅ Domain '$DOMAIN_PREFIX' deleted successfully"
else
  echo "❌ Failed to delete domain"
  exit 1
fi
