#!/bin/bash

# Script to clean up PhotoCloud-dev resources
# This script identifies and optionally deletes resources from the old PhotoCloud-dev stack

set -e

REGION="${AWS_REGION:-eu-west-1}"
DRY_RUN="${DRY_RUN:-true}"  # Set to "false" to actually delete resources

echo "🔍 Searching for PhotoCloud-dev resources in region: $REGION"
echo "DRY_RUN mode: $DRY_RUN"
echo ""

# Function to delete if not dry run
delete_if_not_dry_run() {
    local resource_type=$1
    local resource_name=$2
    local delete_cmd=$3
    
    echo "  Found: $resource_type - $resource_name"
    if [ "$DRY_RUN" = "false" ]; then
        echo "  🗑️  Deleting..."
        eval "$delete_cmd" || echo "  ⚠️  Failed to delete (may not exist or may have dependencies)"
    else
        echo "  [DRY RUN] Would delete with: $delete_cmd"
    fi
}

echo "📋 CloudWatch Log Groups:"
aws logs describe-log-groups --region "$REGION" --query "logGroups[?contains(logGroupName, 'PhotoCloud-dev')].logGroupName" --output text | while read -r log_group; do
    if [ -n "$log_group" ]; then
        delete_if_not_dry_run "Log Group" "$log_group" "aws logs delete-log-group --log-group-name '$log_group' --region $REGION"
    fi
done

echo ""
echo "📋 Lambda Functions:"
aws lambda list-functions --region "$REGION" --query "Functions[?contains(FunctionName, 'PhotoCloud-dev')].FunctionName" --output text | while read -r func_name; do
    if [ -n "$func_name" ]; then
        delete_if_not_dry_run "Lambda Function" "$func_name" "aws lambda delete-function --function-name '$func_name' --region $REGION"
    fi
done

echo ""
echo "📋 DynamoDB Tables:"
aws dynamodb list-tables --region "$REGION" --output text | tr '\t' '\n' | grep "PhotoCloud-dev" | while read -r table_name; do
    if [ -n "$table_name" ]; then
        delete_if_not_dry_run "DynamoDB Table" "$table_name" "aws dynamodb delete-table --table-name '$table_name' --region $REGION"
    fi
done

echo ""
echo "📋 S3 Buckets:"
aws s3api list-buckets --query "Buckets[?contains(Name, 'photocloud-dev')].Name" --output text | while read -r bucket_name; do
    if [ -n "$bucket_name" ]; then
        echo "  Found: S3 Bucket - $bucket_name"
        if [ "$DRY_RUN" = "false" ]; then
            echo "  🗑️  Deleting bucket contents and bucket..."
            aws s3 rm "s3://$bucket_name" --recursive --region "$REGION" || true
            aws s3api delete-bucket --bucket "$bucket_name" --region "$REGION" || echo "  ⚠️  Failed to delete bucket (may not be empty or may have dependencies)"
        else
            echo "  [DRY RUN] Would delete bucket: $bucket_name"
        fi
    fi
done

echo ""
echo "📋 API Gateway APIs:"
aws apigatewayv2 get-apis --region "$REGION" --query "Items[?contains(Name, 'PhotoCloud-dev')].ApiId" --output text | while read -r api_id; do
    if [ -n "$api_id" ]; then
        delete_if_not_dry_run "API Gateway" "$api_id" "aws apigatewayv2 delete-api --api-id '$api_id' --region $REGION"
    fi
done

echo ""
echo "📋 CloudWatch Alarms:"
aws cloudwatch describe-alarms --region "$REGION" --output text | grep "PhotoCloud-dev" | awk '{print $2}' | while read -r alarm_name; do
    if [ -n "$alarm_name" ]; then
        delete_if_not_dry_run "CloudWatch Alarm" "$alarm_name" "aws cloudwatch delete-alarms --alarm-names '$alarm_name' --region $REGION"
    fi
done

echo ""
echo "📋 SNS Topics:"
aws sns list-topics --region "$REGION" --query "Topics[?contains(TopicArn, 'PhotoCloud-dev')].TopicArn" --output text | while read -r topic_arn; do
    if [ -n "$topic_arn" ]; then
        delete_if_not_dry_run "SNS Topic" "$topic_arn" "aws sns delete-topic --topic-arn '$topic_arn' --region $REGION"
    fi
done

echo ""
echo "📋 CloudFront Distributions:"
aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'PhotoCloud-dev')].Id" --output text | while read -r dist_id; do
    if [ -n "$dist_id" ]; then
        echo "  Found: CloudFront Distribution - $dist_id"
        echo "  ⚠️  CloudFront distributions must be disabled before deletion"
        if [ "$DRY_RUN" = "false" ]; then
            echo "  🗑️  Disabling distribution..."
            aws cloudfront get-distribution-config --id "$dist_id" --output json > /tmp/dist-config.json
            ETAG=$(jq -r '.ETag' /tmp/dist-config.json)
            jq '.DistributionConfig.Enabled = false' /tmp/dist-config.json > /tmp/dist-config-updated.json
            aws cloudfront update-distribution --id "$dist_id" --if-match "$ETAG" --distribution-config file:///tmp/dist-config-updated.json --region "$REGION" || echo "  ⚠️  Failed to disable"
            echo "  ⚠️  Note: CloudFront deletions take time. You may need to wait and delete manually."
        else
            echo "  [DRY RUN] Would disable and delete distribution: $dist_id"
        fi
    fi
done

echo ""
echo "📋 Cognito User Pools:"
aws cognito-idp list-user-pools --max-results 60 --region "$REGION" --query "UserPools[?contains(Name, 'PhotoCloud-dev')].Id" --output text | while read -r pool_id; do
    if [ -n "$pool_id" ]; then
        delete_if_not_dry_run "Cognito User Pool" "$pool_id" "aws cognito-idp delete-user-pool --user-pool-id '$pool_id' --region $REGION"
    fi
done

echo ""
echo "📋 CloudFormation Stacks:"
aws cloudformation list-stacks --region "$REGION" --query "StackSummaries[?contains(StackName, 'PhotoCloud-dev') && StackStatus != 'DELETE_COMPLETE'].StackName" --output text | while read -r stack_name; do
    if [ -n "$stack_name" ]; then
        echo "  Found: CloudFormation Stack - $stack_name"
        if [ "$DRY_RUN" = "false" ]; then
            echo "  🗑️  Deleting stack..."
            aws cloudformation delete-stack --stack-name "$stack_name" --region "$REGION"
            echo "  ⏳  Stack deletion initiated. Check status with: aws cloudformation describe-stacks --stack-name $stack_name --region $REGION"
        else
            echo "  [DRY RUN] Would delete stack: $stack_name"
        fi
    fi
done

echo ""
echo "✅ Cleanup scan complete!"
if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "To actually delete resources, run:"
    echo "  DRY_RUN=false ./scripts/cleanup-photocloud-dev.sh"
    echo ""
    echo "⚠️  WARNING: This will permanently delete resources. Make sure you have backups if needed!"
fi

