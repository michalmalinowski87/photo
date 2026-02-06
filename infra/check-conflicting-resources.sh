#!/bin/bash
# Script to check for resources that might conflict with CDK deployment
# Run this before deploying to identify any resources that need to be deleted

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_ARG="${1:-dev}"

# Map short stage names to .env file names (dev -> development, prod -> production)
case "$STAGE_ARG" in
  dev)      ENV_BASENAME=".env.development.local" ;;
  staging)  ENV_BASENAME=".env.staging.local" ;;
  prod)     ENV_BASENAME=".env.production.local" ;;
  *)        ENV_BASENAME=".env.${STAGE_ARG}.local" ;;
esac

STAGE="$STAGE_ARG"

# Load environment variables
if [ -f "$SCRIPT_DIR/$ENV_BASENAME" ]; then
  set -a
  source "$SCRIPT_DIR/$ENV_BASENAME"
  set +a
elif [ -f "$SCRIPT_DIR/.env.${STAGE}.local" ]; then
  set -a
  source "$SCRIPT_DIR/.env.${STAGE}.local"
  set +a
elif [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

AWS_PROFILE="${AWS_PROFILE:-}"
REGION="${CDK_DEFAULT_REGION:-eu-west-1}"

_aws() {
  if [ -n "$AWS_PROFILE" ]; then
    AWS_PROFILE="$AWS_PROFILE" aws "$@"
  else
    aws "$@"
  fi
}

echo "Checking for conflicting resources in account ${CDK_DEFAULT_ACCOUNT:-unknown} (region: $REGION)"
echo "Stage: $STAGE"
echo "---"

# Check DynamoDB tables
echo "📊 DynamoDB Tables:"
TABLES=$(_aws dynamodb list-tables --region "$REGION" --query "TableNames[?starts_with(@, \`${STAGE}-\`)]" --output json 2>/dev/null || echo "[]")
TABLE_COUNT=0
if [ "$TABLES" != "[]" ] && [ -n "$TABLES" ]; then
  TABLE_COUNT=$(echo "$TABLES" | jq 'length')
  echo "$TABLES" | jq -r '.[]' | while read -r table; do
    echo "  ⚠️  $table"
  done
else
  echo "  ✓ No conflicting tables found"
fi
echo ""

# Check S3 buckets
echo "🪣 S3 Buckets:"
BUCKETS=$(_aws s3 ls 2>/dev/null | grep "${STAGE}-" || true)
BUCKET_COUNT=0
if [ -n "$BUCKETS" ]; then
  BUCKET_COUNT=$(echo "$BUCKETS" | wc -l | tr -d ' ')
  echo "$BUCKETS" | while read -r line; do
    bucket=$(echo "$line" | awk '{print $3}')
    echo "  ⚠️  $bucket"
  done
else
  echo "  ✓ No conflicting buckets found"
fi
echo ""

# Check Cognito User Pools
echo "👤 Cognito User Pools:"
POOLS=$(_aws cognito-idp list-user-pools --max-results 60 --region "$REGION" --query "UserPools[?contains(Name, \`${STAGE}\`) || contains(Name, \`photographers\`)].{Id:Id,Name:Name}" --output json 2>/dev/null || echo "[]")
POOL_COUNT=0
if [ "$POOLS" != "[]" ] && [ -n "$POOLS" ]; then
  POOL_COUNT=$(echo "$POOLS" | jq 'length')
  echo "$POOLS" | jq -r '.[] | "  ⚠️  \(.Name) (ID: \(.Id))"'
else
  echo "  ✓ No conflicting user pools found"
fi
echo ""

# Check Cognito domains (these are global, not region-specific)
echo "🌐 Cognito Domains:"
DOMAIN_PREFIX="pixiproof-${STAGE}"
DOMAIN_CHECK=$(_aws cognito-idp describe-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>/dev/null || echo "")
if [ -n "$DOMAIN_CHECK" ]; then
  # Check if domain is actually attached to a pool or just orphaned
  DOMAIN_POOL_ID=$(echo "$DOMAIN_CHECK" | jq -r '.DomainDescription.UserPoolId // empty' 2>/dev/null || echo "")
  if [ -n "$DOMAIN_POOL_ID" ] && [ "$DOMAIN_POOL_ID" != "null" ]; then
    echo "  ⚠️  Domain prefix '$DOMAIN_PREFIX' is attached to User Pool: $DOMAIN_POOL_ID"
    echo "     This will conflict with the new deployment"
  else
    echo "  ⚠️  Domain prefix '$DOMAIN_PREFIX' exists but appears orphaned (no User Pool)"
    echo "     CDK may be able to reuse it, or you may need to wait for AWS cleanup"
    echo "     You can try deploying - CDK will handle the domain creation"
  fi
else
  echo "  ✓ Domain prefix '$DOMAIN_PREFIX' is available"
fi
echo ""

# Summary
echo "---"
CONFLICT_COUNT=$((TABLE_COUNT + BUCKET_COUNT + POOL_COUNT))
# Only count domain as conflict if it's attached to a pool
if [ -n "$DOMAIN_CHECK" ]; then
  DOMAIN_POOL_ID=$(echo "$DOMAIN_CHECK" | jq -r '.DomainDescription.UserPoolId // empty' 2>/dev/null || echo "")
  if [ -n "$DOMAIN_POOL_ID" ] && [ "$DOMAIN_POOL_ID" != "null" ]; then
    CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
  fi
fi

if [ "$CONFLICT_COUNT" -gt 0 ]; then
  echo "❌ Found $CONFLICT_COUNT conflicting resource(s)"
  echo ""
  echo "These resources will cause 'Resource name conflict' errors during deployment."
  echo ""
  echo "Options:"
  echo "1. Delete conflicting resources (if not needed):"
  echo "   ./scripts/delete-conflicting-resources.sh $STAGE --confirm"
  echo ""
  echo "2. Or manually delete via AWS CLI:"
  if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "   DynamoDB tables:"
    echo "$TABLES" | jq -r ".[] | \"     aws dynamodb delete-table --table-name \(.) --region $REGION\""
  fi
  if [ "$BUCKET_COUNT" -gt 0 ]; then
    echo "   S3 buckets (empty first, then delete):"
    echo "$BUCKETS" | awk '{print "     aws s3 rb s3://" $3 " --region '"$REGION"' --force"}'
  fi
  echo ""
  echo "3. Or import existing resources into CDK (advanced, see CDK docs)"
  exit 1
else
  echo "✅ No conflicting resources found - safe to deploy!"
  exit 0
fi
