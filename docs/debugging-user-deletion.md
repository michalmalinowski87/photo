# Debugging User Deletion Issues

## Quick Debugging Steps

### 1. Run the Debug Script

```bash
# Replace <userId> with the actual user ID
node scripts/debug-user-deletion.mjs <userId> dev
```

This script will check:
- User status in DynamoDB
- EventBridge schedule status
- Lambda function configuration
- Recent CloudWatch logs

### 2. Check User Status in DynamoDB

```bash
aws dynamodb get-item \
  --table-name PhotoHub-dev-Users \
  --key '{"userId": {"S": "YOUR_USER_ID"}}' \
  --query 'Item' \
  --output json
```

Look for:
- `status` - Should be `"pendingDeletion"` if deletion was triggered
- `deletionScheduledAt` - ISO timestamp when deletion should execute
- `deletionReason` - Should be `"manual"` for dev-triggered deletions

### 3. Check EventBridge Schedule

```bash
aws scheduler get-schedule \
  --name user-deletion-YOUR_USER_ID \
  --region YOUR_REGION
```

If schedule doesn't exist:
- The trigger may have tried direct Lambda invocation
- Check trigger Lambda logs (see step 4)

### 4. Check Trigger Lambda Logs

```bash
# Get recent logs from the API Lambda (which handles trigger-deletion endpoint)
aws logs filter-log-events \
  --log-group-name /aws/lambda/PhotoHub-dev-ApiFn \
  --filter-pattern "trigger-deletion YOUR_USER_ID" \
  --start-time $(($(date +%s) - 3600))000 \
  --region YOUR_REGION
```

Look for:
- `Invoked user deletion Lambda immediately` - Success message
- `Failed to invoke deletion Lambda` - Error message with details
- `Created backup EventBridge schedule` - Fallback was created

### 5. Check Deletion Lambda Logs

```bash
# Find the deletion Lambda name
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `UserDeletion`) || contains(FunctionName, `PerformUserDeletion`)].FunctionName' \
  --output text \
  --region YOUR_REGION

# Then check logs (replace FUNCTION_NAME)
aws logs filter-log-events \
  --log-group-name /aws/lambda/FUNCTION_NAME \
  --filter-pattern "YOUR_USER_ID" \
  --start-time $(($(date +%s) - 3600))000 \
  --region YOUR_REGION
```

Look for:
- `Starting user deletion` - Lambda was invoked
- `User is not pending deletion` - Status check failed
- `User deletion completed` - Success
- Any error messages

### 6. Check Dead Letter Queue (if configured)

```bash
aws sqs receive-message \
  --queue-url https://sqs.YOUR_REGION.amazonaws.com/YOUR_ACCOUNT/PhotoHub-dev-UserDeletionDLQ \
  --max-number-of-messages 10 \
  --region YOUR_REGION
```

Failed Lambda invocations will appear here.

## Common Issues

### Issue: User status is not "pendingDeletion"

**Symptoms:**
- User status is still "active" after triggering deletion
- No deletion scheduled

**Possible Causes:**
1. Trigger endpoint returned an error
2. DynamoDB write failed
3. Wrong user ID

**Debug:**
```bash
# Check trigger Lambda logs for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/PhotoHub-dev-ApiFn \
  --filter-pattern "trigger-deletion" \
  --start-time $(($(date +%s) - 3600))000
```

### Issue: Deletion time passed but user still exists

**Symptoms:**
- `deletionScheduledAt` is in the past
- User status is still "pendingDeletion"
- User was not deleted

**Possible Causes:**
1. Lambda invocation failed silently (async invocation)
2. Lambda execution failed
3. Lambda was not invoked (no schedule created)
4. Lambda doesn't have proper permissions

**Debug:**
1. Check if EventBridge schedule exists:
   ```bash
   aws scheduler get-schedule --name user-deletion-YOUR_USER_ID
   ```
2. Check deletion Lambda logs for errors
3. Check Dead Letter Queue for failed invocations
4. Verify Lambda function name/ARN in SSM:
   ```bash
   aws ssm get-parameter --name /PhotoHub/dev/UserDeletionLambdaArn
   ```

### Issue: Lambda invocation failed

**Symptoms:**
- Trigger logs show "Failed to invoke deletion Lambda"
- Error message in logs

**Common Errors:**

1. **ResourceNotFoundException**
   - Lambda function name/ARN is incorrect
   - Check SSM parameter: `/PhotoHub/dev/UserDeletionLambdaArn`
   - Verify Lambda exists: `aws lambda list-functions --query 'Functions[?contains(FunctionName, `UserDeletion`)]'`

2. **AccessDeniedException**
   - Trigger Lambda doesn't have `lambda:InvokeFunction` permission
   - Check IAM role for API Lambda

3. **InvalidParameterValueException**
   - Function name format is incorrect
   - Check function name extraction logic

**Fix:**
- Verify Lambda ARN in SSM Parameter Store
- Check IAM permissions
- Ensure `USER_DELETION_FN_NAME` environment variable is set correctly

### Issue: EventBridge schedule not created

**Symptoms:**
- No schedule exists for user
- Trigger tried direct Lambda invocation

**Possible Causes:**
1. `scheduleRoleArn` not configured
2. Schedule creation failed silently
3. Direct Lambda invocation succeeded (no schedule needed)

**Debug:**
```bash
# Check SSM parameters
aws ssm get-parameter --name /PhotoHub/dev/UserDeletionScheduleRoleArn
aws ssm get-parameter --name /PhotoHub/dev/UserDeletionDlqArn

# Check trigger logs for schedule creation errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/PhotoHub-dev-ApiFn \
  --filter-pattern "schedule" \
  --start-time $(($(date +%s) - 3600))000
```

## Manual Testing Steps

### Test Immediate Deletion (1 minute)

1. Trigger deletion via dev endpoint:
   ```bash
   curl -X POST https://YOUR_API/auth/dev/trigger-deletion/YOUR_USER_ID \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"immediate": true, "minutesFromNow": 1}'
   ```

2. Wait 2 minutes

3. Check user status:
   ```bash
   node scripts/debug-user-deletion.mjs YOUR_USER_ID dev
   ```

4. Expected results:
   - User status should be "deleted"
   - Lambda logs should show "User deletion completed"
   - No EventBridge schedule should exist (it's cancelled after deletion)

### Test Scheduled Deletion (3 days)

1. Trigger deletion:
   ```bash
   curl -X POST https://YOUR_API/auth/dev/trigger-deletion/YOUR_USER_ID \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"immediate": false, "minutesFromNow": 4320}'
   ```

2. Check EventBridge schedule:
   ```bash
   aws scheduler get-schedule --name user-deletion-YOUR_USER_ID
   ```

3. Expected results:
   - Schedule should exist and be ENABLED
   - Schedule expression should match `deletionScheduledAt`
   - User status should be "pendingDeletion"

## Verification Checklist

After triggering deletion, verify:

- [ ] User status in DynamoDB is "pendingDeletion"
- [ ] `deletionScheduledAt` is set correctly
- [ ] EventBridge schedule exists (if scheduled) OR Lambda was invoked (if immediate)
- [ ] No errors in trigger Lambda logs
- [ ] No errors in deletion Lambda logs
- [ ] Dead Letter Queue is empty (if configured)
- [ ] After scheduled time: User status is "deleted"
- [ ] After scheduled time: Cognito user is deleted
- [ ] After scheduled time: EventBridge schedule is cancelled

## Getting Help

If deletion still doesn't work after checking all the above:

1. Run the debug script and save output
2. Collect relevant CloudWatch logs
3. Check SSM parameters:
   ```bash
   aws ssm get-parameters-by-path --path /PhotoHub/dev/ --recursive
   ```
4. Verify Lambda function exists and has correct permissions
5. Check IAM roles for both trigger and deletion Lambdas


