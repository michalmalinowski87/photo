#!/bin/bash
# Script to delete conflicting resources before CDK deployment
# WARNING: This will DELETE resources. Make sure you have backups if needed.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_ARG="${1:-dev}"

if [ -z "$1" ]; then
  echo "Usage: $0 <stage> [--confirm]"
  echo "Example: $0 dev --confirm"
  echo ""
  echo "This script will delete all conflicting resources for stage '$STAGE_ARG'"
  echo "Add --confirm flag to actually delete (without it, only shows what would be deleted)"
  exit 1
fi

CONFIRM=false
if [ "$2" == "--confirm" ]; then
  CONFIRM=true
fi

# Map short stage names to .env file names (dev -> development, prod -> production)
case "$STAGE_ARG" in
  dev)      ENV_BASENAME=".env.development.local" ;;
  staging)  ENV_BASENAME=".env.staging.local" ;;
  prod)     ENV_BASENAME=".env.production.local" ;;
  *)        ENV_BASENAME=".env.${STAGE_ARG}.local" ;;
esac

STAGE="$STAGE_ARG"

# Load environment variables
if [ -f "$INFRA_DIR/$ENV_BASENAME" ]; then
  set -a
  source "$INFRA_DIR/$ENV_BASENAME"
  set +a
elif [ -f "$INFRA_DIR/.env.${STAGE}.local" ]; then
  set -a
  source "$INFRA_DIR/.env.${STAGE}.local"
  set +a
elif [ -f "$INFRA_DIR/.env" ]; then
  set -a
  source "$INFRA_DIR/.env"
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

echo "🗑️  Deleting conflicting resources for stage: $STAGE"
echo "Region: $REGION"
echo "Account: ${CDK_DEFAULT_ACCOUNT:-unknown}"
if [ -n "$AWS_PROFILE" ]; then
  echo "AWS Profile: $AWS_PROFILE"
fi
echo ""

if [ "$CONFIRM" != "true" ]; then
  echo "⚠️  DRY RUN MODE - No resources will be deleted"
  echo "Add --confirm flag to actually delete resources"
  echo ""
fi

# Delete DynamoDB tables
echo "📊 DynamoDB Tables:"
TABLES=$(_aws dynamodb list-tables --region "$REGION" --query "TableNames[?starts_with(@, \`${STAGE}-\`)]" --output json 2>/dev/null || echo "[]")
if [ "$CONFIRM" != "true" ]; then
  echo "Debug: Found tables: $TABLES"
fi
if [ "$TABLES" != "[]" ] && [ -n "$TABLES" ]; then
  echo "$TABLES" | jq -r '.[]' | while read -r table; do
    if [ "$CONFIRM" == "true" ]; then
      echo "  Deleting $table..."
      _aws dynamodb delete-table --table-name "$table" --region "$REGION" >/dev/null 2>&1 || echo "    ⚠️  Failed to delete $table (may already be deleted or in use)"
    else
      echo "  Would delete: $table"
    fi
  done
  
  if [ "$CONFIRM" == "true" ]; then
    echo "  Waiting for tables to be deleted..."
    echo "$TABLES" | jq -r '.[]' | while read -r table; do
      _aws dynamodb wait table-not-exists --table-name "$table" --region "$REGION" 2>/dev/null || true
    done
    echo "  ✓ Tables deleted"
  fi
else
  echo "  ✓ No tables to delete"
fi
echo ""

# Delete S3 buckets
echo "🪣 S3 Buckets:"
BUCKETS=$(_aws s3 ls 2>/dev/null | grep "${STAGE}-" | awk '{print $3}' || true)
if [ -n "$BUCKETS" ]; then
  echo "$BUCKETS" | while read -r bucket; do
    if [ "$CONFIRM" == "true" ]; then
      echo "  Emptying and deleting $bucket..."
      # Empty bucket first
      _aws s3 rm "s3://$bucket" --recursive --region "$REGION" >/dev/null 2>&1 || true
      # Delete bucket
      _aws s3 rb "s3://$bucket" --region "$REGION" >/dev/null 2>&1 || echo "    ⚠️  Failed to delete $bucket (may not be empty or in use)"
    else
      echo "  Would delete: $bucket"
    fi
  done
  if [ "$CONFIRM" == "true" ]; then
    echo "  ✓ Buckets deleted"
  fi
else
  echo "  ✓ No buckets to delete"
fi
echo ""

# Delete Cognito domains and user pools
echo "👤 Cognito User Pools & Domains:"
POOLS=$(_aws cognito-idp list-user-pools --max-results 60 --region "$REGION" --query "UserPools[?contains(Name, \`${STAGE}\`) || contains(Name, \`photographers\`)].{Id:Id,Name:Name}" --output json 2>/dev/null || echo "[]")
DOMAIN_PREFIX="pixiproof-${STAGE}"

# Validate JSON and handle empty/malformed responses
POOLS_VALIDATED="$POOLS"
if ! echo "$POOLS_VALIDATED" | jq empty 2>/dev/null; then
  echo "  ⚠️  Failed to parse Cognito pools JSON, treating as empty"
  POOLS_VALIDATED="[]"
fi

POOL_COUNT=$(echo "$POOLS_VALIDATED" | jq 'length' 2>/dev/null || echo "0")

if [ "$POOL_COUNT" -gt 0 ]; then
  # Parse JSON array properly - jq -c outputs compact JSON (one object per line)
  echo "$POOLS_VALIDATED" | jq -c '.[]' | while IFS= read -r pool_json; do
    POOL_ID=$(echo "$pool_json" | jq -r '.Id // empty' 2>/dev/null || echo "")
    POOL_NAME=$(echo "$pool_json" | jq -r '.Name // empty' 2>/dev/null || echo "")
    
    # Skip if pool_json is empty or invalid
    if [ -z "$POOL_ID" ] || [ "$POOL_ID" == "null" ] || [ "$POOL_ID" == "" ]; then
      continue
    fi
    
    # Check if domain exists for this pool
    DOMAIN_INFO=$(_aws cognito-idp describe-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>/dev/null || echo "")
    
    if [ -n "$DOMAIN_INFO" ]; then
      DOMAIN_POOL_ID=$(echo "$DOMAIN_INFO" | jq -r '.DomainDescription.UserPoolId // empty' 2>/dev/null || echo "")
      
      # Only delete domain if it belongs to this pool
      if [ "$DOMAIN_POOL_ID" == "$POOL_ID" ] || [ -z "$DOMAIN_POOL_ID" ]; then
        if [ "$CONFIRM" == "true" ]; then
          echo "  Deleting Cognito domain: $DOMAIN_PREFIX..."
          DELETE_OUTPUT=$(_aws cognito-idp delete-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>&1)
          DELETE_EXIT_CODE=$?
          if [ $DELETE_EXIT_CODE -eq 0 ]; then
            echo "  ✓ Domain deleted successfully"
          else
            echo "  ⚠️  Failed to delete domain"
            echo "     Error: $DELETE_OUTPUT"
            echo "     Note: Domain may be attached to User Pool. Delete the pool first:"
            echo "     aws cognito-idp delete-user-pool --user-pool-id $POOL_ID --region $REGION"
          fi
        else
          echo "  Would delete domain: $DOMAIN_PREFIX (for pool: $POOL_NAME)"
        fi
      fi
    fi
    
    # Delete user pool (this will automatically delete the domain if deletion failed above)
    if [ "$CONFIRM" == "true" ]; then
      echo "  Deleting User Pool: $POOL_NAME (ID: $POOL_ID)..."
      if _aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID" --region "$REGION" 2>&1; then
        echo "  ✓ User pool deleted (domain will be automatically deleted)"
      else
        echo "  ⚠️  Failed to delete pool"
        echo "     Error details shown above. Common issues:"
        echo "     - Pool has active users/app clients"
        echo "     - Pool is referenced by other resources"
        echo "     Delete manually via AWS Console: Cognito > User Pools > $POOL_NAME"
      fi
    else
      echo "  Would delete User Pool: $POOL_NAME (ID: $POOL_ID)"
    fi
  done
else
  # Check if domain exists even without pool
  DOMAIN_CHECK=$(_aws cognito-idp describe-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>/dev/null || echo "")
  if [ -n "$DOMAIN_CHECK" ]; then
    DOMAIN_POOL_ID=$(echo "$DOMAIN_CHECK" | jq -r '.DomainDescription.UserPoolId // empty' 2>/dev/null || echo "")
    if [ "$CONFIRM" == "true" ]; then
      echo "  Deleting orphaned Cognito domain: $DOMAIN_PREFIX..."
      if [ -n "$DOMAIN_POOL_ID" ]; then
        echo "    ⚠️  Domain is attached to User Pool: $DOMAIN_POOL_ID"
        echo "    You need to delete the User Pool first, or delete the domain manually"
      fi
      DELETE_OUTPUT=$(_aws cognito-idp delete-user-pool-domain --domain "$DOMAIN_PREFIX" --region "$REGION" 2>&1)
      DELETE_EXIT_CODE=$?
      if [ $DELETE_EXIT_CODE -eq 0 ]; then
        echo "  ✓ Domain deleted successfully"
      else
        echo "  ⚠️  Failed to delete domain"
        echo "     Error: $DELETE_OUTPUT"
        if [ -n "$DOMAIN_POOL_ID" ]; then
          echo ""
          echo "     The domain is attached to User Pool: $DOMAIN_POOL_ID"
          echo "     Delete the User Pool first (this will automatically delete the domain):"
          echo "     aws cognito-idp delete-user-pool --user-pool-id $DOMAIN_POOL_ID --region $REGION"
        fi
      fi
    else
      echo "  Would delete orphaned domain: $DOMAIN_PREFIX"
      if [ -n "$DOMAIN_POOL_ID" ]; then
        echo "    (attached to User Pool: $DOMAIN_POOL_ID)"
      fi
    fi
  else
    echo "  ✓ No user pools or domains to delete"
  fi
fi
echo ""

if [ "$CONFIRM" == "true" ]; then
  echo "✅ Deletion complete!"
  echo ""
  echo "You can now run the deployment:"
  echo "  cd infra && ./deploy.sh $STAGE"
else
  echo "ℹ️  This was a dry run. To actually delete, run:"
  echo "  $0 $STAGE --confirm"
fi
