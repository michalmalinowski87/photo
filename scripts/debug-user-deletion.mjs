#!/usr/bin/env node
/**
 * Debug script for user deletion issues
 * 
 * Usage:
 *   node scripts/debug-user-deletion.mjs <userId> [stage]
 * 
 * Example:
 *   node scripts/debug-user-deletion.mjs abc123 dev
 */

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, GetFunctionCommand, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { SchedulerClient, GetScheduleCommand, ListSchedulesCommand } from '@aws-sdk/client-scheduler';
import { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const stage = process.argv[3] || 'dev';
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/debug-user-deletion.mjs <userId> [stage]');
  process.exit(1);
}

// Detect region from environment or default to eu-west-1
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1';

const ddbClient = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const lambda = new LambdaClient({ region });
const scheduler = new SchedulerClient({ region });
const logs = new CloudWatchLogsClient({ region });
const sts = new STSClient({ region });

const scheduleName = `user-deletion-${userId}`;

// Helper function to format dates with timezone info
function formatDateWithTimezone(date) {
  const utc = date.toISOString();
  const local = date.toLocaleString('en-US', { 
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeZoneName: 'short'
  });
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    utc,
    local,
    localTz,
    display: `${utc} (UTC) / ${local}`
  };
}

console.log('🔍 Debugging User Deletion');
console.log('==========================');
console.log(`User ID: ${userId}`);
console.log(`Stage: ${stage}`);
console.log(`Region: ${region}`);
console.log(`Schedule Name: ${scheduleName}`);
console.log(`Local Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log(`Current Time: ${formatDateWithTimezone(new Date()).display}`);
console.log('');

async function findUsersTable() {
  console.log('🔍 Finding Users table...');
  try {
    const result = await ddbClient.send(new ListTablesCommand({}));
    const tablePattern = `${stage}-users`;
    const matchingTables = result.TableNames?.filter(name => 
      name.startsWith(tablePattern)
    ) || [];
    
    if (matchingTables.length === 0) {
      console.log(`   ⚠️  No table found matching pattern: ${tablePattern}*`);
      console.log('   Available tables:');
      result.TableNames?.slice(0, 10).forEach(name => {
        if (name.includes(stage)) {
          console.log(`     - ${name}`);
        }
      });
      return null;
    }
    
    if (matchingTables.length > 1) {
      console.log(`   ⚠️  Found ${matchingTables.length} matching tables:`);
      matchingTables.forEach(name => console.log(`     - ${name}`));
      console.log(`   Using: ${matchingTables[0]}`);
    } else {
      console.log(`   ✅ Found table: ${matchingTables[0]}`);
    }
    
    return matchingTables[0];
  } catch (error) {
    console.log(`   ❌ Error finding table: ${error.message}`);
    return null;
  }
}

async function checkUserStatus(usersTable) {
  console.log('\n1️⃣ Checking user status in DynamoDB...');
  if (!usersTable) {
    console.log('   ⚠️  Users table not found - skipping user check');
    return null;
  }
  
  try {
    const result = await ddb.send(new GetCommand({
      TableName: usersTable,
      Key: { userId }
    }));

    if (!result.Item) {
      console.log('   ❌ User not found in DynamoDB');
      console.log(`   Table: ${usersTable}`);
      console.log(`   Region: ${region}`);
      console.log('   Possible reasons:');
      console.log('     - User was already deleted');
      console.log('     - Wrong userId');
      console.log('     - Wrong table name or region');
      console.log('     - Table does not exist');
      return null;
    }

    const user = result.Item;
    console.log('   ✅ User found');
    console.log(`   Status: ${user.status || '(not set)'}`);
    console.log(`   Deletion Scheduled At: ${user.deletionScheduledAt || '(not set)'}`);
    console.log(`   Deletion Reason: ${user.deletionReason || '(not set)'}`);
    console.log(`   Deletion Requested At: ${user.deletionRequestedAt || '(not set)'}`);
    
    if (user.deletionScheduledAt) {
      const scheduledTime = new Date(user.deletionScheduledAt);
      const now = new Date();
      const diffMs = scheduledTime.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      
      const scheduledFmt = formatDateWithTimezone(scheduledTime);
      const nowFmt = formatDateWithTimezone(now);
      
      console.log(`   Scheduled Time: ${scheduledFmt.display}`);
      console.log(`   Current Time: ${nowFmt.display}`);
      
      if (diffMs < 0) {
        console.log(`   ⚠️  Deletion time has passed (${Math.abs(diffHours)}h ${Math.abs(diffMins % 60)}m ago)`);
        console.log(`   Note: AWS EventBridge uses UTC time. Schedule executes at: ${scheduledFmt.utc}`);
      } else {
        console.log(`   ⏰ Deletion scheduled in ${diffHours}h ${diffMins % 60}m`);
        console.log(`   Note: AWS EventBridge uses UTC time. Schedule will execute at: ${scheduledFmt.utc}`);
      }
    }
    
    return user;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.name === 'ResourceNotFoundException') {
      console.log(`   Table "${usersTable}" not found in region ${region}`);
      console.log('   Check:');
      console.log('     - Table name is correct');
      console.log('     - Region is correct');
      console.log('     - AWS credentials have access');
    } else if (error.name === 'UnknownEndpoint') {
      console.log(`   Invalid region: ${region}`);
    }
    return null;
  }
}

async function checkEventBridgeSchedule() {
  console.log('\n2️⃣ Checking EventBridge Schedule...');
  try {
    const result = await scheduler.send(new GetScheduleCommand({
      Name: scheduleName
    }));
    
    console.log('   ✅ Schedule exists');
    console.log(`   State: ${result.State}`);
    console.log(`   Schedule Expression: ${result.ScheduleExpression}`);
    console.log(`   Target ARN: ${result.Target?.Arn}`);
    
    if (result.LastModificationDate) {
      const lastModifiedFmt = formatDateWithTimezone(new Date(result.LastModificationDate));
      console.log(`   Last Modified: ${lastModifiedFmt.display}`);
    }
    
    // Check if schedule time has passed
    if (result.ScheduleExpression) {
      const match = result.ScheduleExpression.match(/at\((.+)\)/);
      if (match) {
        const scheduledTime = new Date(match[1]);
        const now = new Date();
        const scheduledFmt = formatDateWithTimezone(scheduledTime);
        const nowFmt = formatDateWithTimezone(now);
        
        console.log(`   Scheduled Execution Time: ${scheduledFmt.display}`);
        console.log(`   Current Time: ${nowFmt.display}`);
        console.log(`   ⚠️  IMPORTANT: EventBridge schedules use UTC time`);
        
        if (scheduledTime <= now) {
          const diffMs = now.getTime() - scheduledTime.getTime();
          const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
          const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / 60000);
          console.log(`   ⚠️  Schedule time has passed (${diffHours}h ${diffMins}m ago)`);
          console.log(`   UTC Scheduled: ${scheduledFmt.utc}`);
          console.log(`   UTC Current: ${nowFmt.utc}`);
          console.log(`   Local Scheduled: ${scheduledFmt.local}`);
          console.log(`   Local Current: ${nowFmt.local}`);
        } else {
          const diffMs = scheduledTime.getTime() - now.getTime();
          const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
          const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / 60000);
          console.log(`   ⏰ Schedule will execute in ${diffHours}h ${diffMins}m`);
        }
      }
    }
    
    return result;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('   ⚠️  Schedule not found (may have been deleted or never created)');
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return null;
  }
}

async function findDeletionLambda(scheduleTargetArn = null) {
  console.log('\n3️⃣ Finding User Deletion Lambda...');
  try {
    // Try to find Lambda by naming convention
    const listResult = await lambda.send(new ListFunctionsCommand({}));
    
    // First, try to match by schedule target ARN if provided
    if (scheduleTargetArn) {
      const targetLambda = listResult.Functions?.find(fn => 
        fn.FunctionArn === scheduleTargetArn
      );
      if (targetLambda) {
        console.log(`   ✅ Found Lambda from schedule target ARN:`);
        
        // Get detailed Lambda configuration
        try {
          const lambdaDetails = await lambda.send(new GetFunctionCommand({
            FunctionName: targetLambda.FunctionName
          }));
          
          console.log(`     - ${targetLambda.FunctionName}`);
          console.log(`       ARN: ${targetLambda.FunctionArn}`);
          console.log(`       Last Modified: ${targetLambda.LastModified}`);
          console.log(`       Runtime: ${lambdaDetails.Configuration?.Runtime}`);
          console.log(`       Memory: ${lambdaDetails.Configuration?.MemorySize} MB`);
          console.log(`       Timeout: ${lambdaDetails.Configuration?.Timeout} seconds`);
          
          // Check environment variables
          const envVars = lambdaDetails.Configuration?.Environment?.Variables || {};
          console.log(`       Environment Variables:`);
          const requiredVars = ['USERS_TABLE', 'GALLERIES_BUCKET', 'BUCKET_NAME', 'GALLERIES_TABLE', 'ORDERS_TABLE', 'COGNITO_USER_POOL_ID'];
          requiredVars.forEach(varName => {
            const value = envVars[varName];
            if (value) {
              console.log(`         ✅ ${varName}: ${value}`);
            } else {
              console.log(`         ❌ ${varName}: MISSING`);
            }
          });
          
          // Check if BUCKET_NAME or GALLERIES_BUCKET is missing
          if (!envVars.GALLERIES_BUCKET && !envVars.BUCKET_NAME) {
            console.log(`       ⚠️  WARNING: Neither GALLERIES_BUCKET nor BUCKET_NAME is set!`);
            console.log(`       This will cause the Lambda to fail with "Missing required configuration"`);
          }
          
        } catch (error) {
          console.log(`     - ${targetLambda.FunctionName}`);
          console.log(`       ARN: ${targetLambda.FunctionArn}`);
          console.log(`       Last Modified: ${targetLambda.LastModified}`);
          console.log(`       ⚠️  Could not get detailed configuration: ${error.message}`);
        }
        
        return targetLambda;
      }
    }
    
    // Search by naming patterns (case-insensitive)
    const deletionLambdas = listResult.Functions?.filter(fn => {
      const name = fn.FunctionName?.toLowerCase() || '';
      return name.includes('userdeletion') || 
             name.includes('performuserdeletion') ||
             (name.includes('user') && name.includes('deletion'));
    }) || [];
    
    // Filter to stage-specific Lambdas
    const stageDeletionLambdas = deletionLambdas.filter(fn => 
      fn.FunctionName?.includes(stage)
    );
    
    if (stageDeletionLambdas.length === 0) {
      console.log('   ⚠️  No deletion Lambda found by name pattern');
      console.log('   Searching all Lambdas...');
      
      // List all Lambdas for this stage
      const stageLambdas = listResult.Functions?.filter(fn => 
        fn.FunctionName?.includes(stage)
      ) || [];
      
      console.log(`   Found ${stageLambdas.length} Lambdas for stage "${stage}"`);
      console.log('   Relevant Lambdas:');
      stageLambdas.forEach(fn => {
        if (fn.FunctionName?.toLowerCase().includes('user') || 
            fn.FunctionName?.toLowerCase().includes('deletion')) {
          console.log(`     - ${fn.FunctionName} (${fn.FunctionArn})`);
        }
      });
      
      return null;
    }
    
    console.log(`   ✅ Found ${stageDeletionLambdas.length} deletion Lambda(s):`);
    const selectedLambda = stageDeletionLambdas[0];
    
    // Get detailed Lambda configuration
    if (selectedLambda) {
      try {
        const lambdaDetails = await lambda.send(new GetFunctionCommand({
          FunctionName: selectedLambda.FunctionName
        }));
        
        console.log(`     - ${selectedLambda.FunctionName}`);
        console.log(`       ARN: ${selectedLambda.FunctionArn}`);
        console.log(`       Last Modified: ${selectedLambda.LastModified}`);
        console.log(`       Runtime: ${lambdaDetails.Configuration?.Runtime}`);
        console.log(`       Memory: ${lambdaDetails.Configuration?.MemorySize} MB`);
        console.log(`       Timeout: ${lambdaDetails.Configuration?.Timeout} seconds`);
        
        // Check environment variables
        const envVars = lambdaDetails.Configuration?.Environment?.Variables || {};
        console.log(`       Environment Variables:`);
        const requiredVars = ['USERS_TABLE', 'GALLERIES_BUCKET', 'BUCKET_NAME', 'GALLERIES_TABLE', 'ORDERS_TABLE', 'COGNITO_USER_POOL_ID'];
        requiredVars.forEach(varName => {
          const value = envVars[varName];
          if (value) {
            console.log(`         ✅ ${varName}: ${value}`);
          } else {
            console.log(`         ❌ ${varName}: MISSING`);
          }
        });
        
        // Check for other important vars
        const otherVars = Object.keys(envVars).filter(k => !requiredVars.includes(k));
        if (otherVars.length > 0) {
          console.log(`       Other Environment Variables (${otherVars.length}):`);
          otherVars.slice(0, 10).forEach(varName => {
            console.log(`         - ${varName}: ${envVars[varName]}`);
          });
          if (otherVars.length > 10) {
            console.log(`         ... and ${otherVars.length - 10} more`);
          }
        }
        
        // Check if BUCKET_NAME or GALLERIES_BUCKET is missing
        if (!envVars.GALLERIES_BUCKET && !envVars.BUCKET_NAME) {
          console.log(`       ⚠️  WARNING: Neither GALLERIES_BUCKET nor BUCKET_NAME is set!`);
          console.log(`       This will cause the Lambda to fail with "Missing required configuration"`);
        }
        
      } catch (error) {
        console.log(`     - ${selectedLambda.FunctionName}`);
        console.log(`       ARN: ${selectedLambda.FunctionArn}`);
        console.log(`       Last Modified: ${selectedLambda.LastModified}`);
        console.log(`       ⚠️  Could not get detailed configuration: ${error.message}`);
      }
    }
    
    // If schedule target ARN was provided, verify it matches
    if (scheduleTargetArn && selectedLambda) {
      if (selectedLambda.FunctionArn !== scheduleTargetArn) {
        console.log(`   ⚠️  WARNING: Schedule target ARN doesn't match found Lambda`);
        console.log(`   Schedule Target: ${scheduleTargetArn}`);
        console.log(`   Found Lambda ARN: ${selectedLambda.FunctionArn}`);
      } else {
        console.log(`   ✅ Schedule target ARN matches Lambda ARN`);
      }
    }
    
    return selectedLambda;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function checkLambdaLogs(lambdaFunctionName, scheduleTime) {
  if (!lambdaFunctionName) {
    console.log('\n4️⃣ Skipping Lambda logs (Lambda not found)');
    return;
  }
  
  console.log(`\n4️⃣ Checking Lambda logs for: ${lambdaFunctionName}...`);
  
  const logGroupName = `/aws/lambda/${lambdaFunctionName}`;
  
  // Expand time window: check from 24 hours before schedule time to now
  // This covers cases where schedule executed but logs are delayed
  const startTime = scheduleTime 
    ? new Date(scheduleTime).getTime() - (24 * 60 * 60 * 1000)
    : Date.now() - (24 * 60 * 60 * 1000);
  
  try {
    // First check if log group exists
    try {
      await logs.send(new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName
      }));
    } catch (err) {
      // Continue anyway
    }
    
    const result = await logs.send(new FilterLogEventsCommand({
      logGroupName,
      filterPattern: `"${userId}"`,
      startTime
    }));
    
    if (!result.events || result.events.length === 0) {
      console.log('   ⚠️  No logs found for this user');
      console.log(`   Log Group: ${logGroupName}`);
      console.log(`   Time Window: Last 24 hours (or since schedule time)`);
      console.log('   This could mean:');
      console.log('     - Lambda was not invoked');
      console.log('     - Lambda invocation failed before logging');
      console.log('     - User ID not in logs (check all logs)');
      
      // Try checking all logs without filter
      console.log('\n   Checking all recent logs (without user filter)...');
      const allLogsResult = await logs.send(new FilterLogEventsCommand({
        logGroupName,
        startTime
      }));
      
      if (allLogsResult.events && allLogsResult.events.length > 0) {
        console.log(`   Found ${allLogsResult.events.length} total log events`);
        console.log('   Most recent logs:');
        allLogsResult.events.slice(-3).forEach(event => {
          const timestamp = new Date(event.timestamp).toISOString();
          const message = event.message?.substring(0, 150);
          console.log(`     [${timestamp}] ${message}`);
        });
      } else {
        console.log('   No logs found at all - Lambda may never have been invoked');
      }
    } else {
      console.log(`   ✅ Found ${result.events.length} log events`);
      console.log('   Recent log entries:');
      result.events.slice(-10).forEach(event => {
        const timestamp = new Date(event.timestamp).toISOString();
        const message = event.message?.substring(0, 200);
        console.log(`     [${timestamp}] ${message}`);
      });
    }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`   ⚠️  Log group not found: ${logGroupName}`);
      console.log('   This could mean the Lambda has never been invoked');
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

async function findApiLambda() {
  console.log('\n5️⃣ Finding API Lambda function...');
  try {
    const listResult = await lambda.send(new ListFunctionsCommand({}));
    const apiLambdas = listResult.Functions?.filter(fn => 
      fn.FunctionName?.includes('ApiFunction') && 
      fn.FunctionName?.includes(stage)
    ) || [];
    
    if (apiLambdas.length === 0) {
      console.log('   ⚠️  No API Lambda found by name pattern');
      console.log('   Searching for alternatives...');
      
      const stageLambdas = listResult.Functions?.filter(fn => 
        fn.FunctionName?.includes(stage) &&
        (fn.FunctionName?.toLowerCase().includes('api') || 
         fn.FunctionName?.toLowerCase().includes('function'))
      ) || [];
      
      if (stageLambdas.length > 0) {
        console.log(`   Found ${stageLambdas.length} potential API Lambda(s):`);
        stageLambdas.forEach(fn => {
          console.log(`     - ${fn.FunctionName}`);
        });
        return stageLambdas[0];
      }
      
      return null;
    }
    
    console.log(`   ✅ Found API Lambda: ${apiLambdas[0].FunctionName}`);
    return apiLambdas[0];
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function checkTriggerLambdaLogs(apiLambda, scheduleTime) {
  console.log('\n6️⃣ Checking API Lambda logs...');
  
  if (!apiLambda) {
    console.log('   ⚠️  API Lambda not found - skipping logs');
    return;
  }
  
  const logGroupName = `/aws/lambda/${apiLambda.FunctionName}`;
  const startTime = scheduleTime 
    ? new Date(scheduleTime).getTime() - (7 * 24 * 60 * 60 * 1000) // 7 days before schedule
    : Date.now() - (7 * 24 * 60 * 60 * 1000); // Last 7 days
  
  try {
    // Check for user deletion related logs
    const patterns = [
      `"request-deletion" "${userId}"`,
      `"cancel-deletion" "${userId}"`,
      `"deletion" "${userId}"`,
      `"${userId}"`
    ];
    
    let foundLogs = false;
    for (const pattern of patterns) {
      const result = await logs.send(new FilterLogEventsCommand({
        logGroupName,
        filterPattern: pattern,
        startTime
      }));
      
      if (result.events && result.events.length > 0) {
        foundLogs = true;
        console.log(`   ✅ Found ${result.events.length} log events (pattern: ${pattern})`);
        console.log('   Recent logs:');
        result.events.slice(-5).forEach(event => {
          const timestamp = new Date(event.timestamp).toISOString();
          const message = event.message?.substring(0, 300);
          console.log(`     [${timestamp}] ${message}`);
        });
        break;
      }
    }
    
    if (!foundLogs) {
      console.log('   ⚠️  No logs found for user deletion requests');
      console.log(`   Log Group: ${logGroupName}`);
      console.log('   Checked patterns: request-deletion, cancel-deletion, deletion');
    }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`   ⚠️  Log group not found: ${logGroupName}`);
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

async function main() {
  // Get AWS account info
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log(`AWS Account: ${identity.Account}`);
    console.log(`AWS Region: ${region}`);
    console.log('');
  } catch (error) {
    console.log(`⚠️  Could not get AWS account info: ${error.message}`);
    console.log('');
  }
  
  // Find the Users table dynamically
  const usersTable = await findUsersTable();
  if (usersTable) {
    console.log('');
  }
  
  const user = await checkUserStatus(usersTable);
  const schedule = await checkEventBridgeSchedule();
  const deletionLambda = await findDeletionLambda(schedule?.Target?.Arn);
  const apiLambda = await findApiLambda();
  
  // Extract schedule time for log searches
  let scheduleTime = null;
  if (schedule?.ScheduleExpression) {
    const match = schedule.ScheduleExpression.match(/at\((.+)\)/);
    if (match) {
      scheduleTime = match[1];
    }
  } else if (user?.deletionScheduledAt) {
    scheduleTime = user.deletionScheduledAt;
  }
  
  await checkLambdaLogs(deletionLambda?.FunctionName, scheduleTime);
  await checkTriggerLambdaLogs(apiLambda, scheduleTime);
  
  console.log('\n📋 Summary & Recommendations');
  console.log('============================');
  
  if (!user) {
    console.log('❌ User not found in DynamoDB');
    console.log('');
    if (schedule) {
      console.log('⚠️  BUT: EventBridge schedule exists!');
      console.log('   This suggests:');
      console.log('     - User was deleted but schedule was not cleaned up');
      console.log('     - User exists in a different region/table');
      console.log('     - User ID mismatch');
      console.log('');
      console.log('   Action: Check if deletion Lambda executed successfully');
      console.log('   Action: Verify user ID is correct');
    }
    return;
  }
  
  if (user.status !== 'pendingDeletion') {
    console.log(`⚠️  User status is "${user.status}", not "pendingDeletion"`);
    if (user.status === 'active') {
      console.log('   User is active - deletion may have been cancelled');
    } else if (!user.status) {
      console.log('   User has no status set');
    }
  }
  
  if (user.deletionScheduledAt) {
    const scheduledTime = new Date(user.deletionScheduledAt);
    const now = new Date();
    
    if (scheduledTime <= now) {
      const scheduledFmt = formatDateWithTimezone(scheduledTime);
      const nowFmt = formatDateWithTimezone(now);
      
      console.log('⚠️  Deletion time has passed but user still exists');
      console.log(`   Scheduled (UTC): ${scheduledFmt.utc}`);
      console.log(`   Scheduled (Local): ${scheduledFmt.local}`);
      console.log(`   Current (UTC): ${nowFmt.utc}`);
      console.log(`   Current (Local): ${nowFmt.local}`);
      console.log(`   ⚠️  Note: EventBridge uses UTC time`);
      console.log('   Possible issues:');
      console.log('     - Lambda execution failed');
      console.log('     - Lambda was not invoked by EventBridge');
      console.log('     - Lambda permissions issue');
      console.log('     - Check Lambda logs for errors');
      
      if (schedule && schedule.State === 'ENABLED') {
        console.log('   ⚠️  Schedule is still ENABLED - it should be disabled after execution');
        console.log('   This suggests the Lambda was not invoked or failed');
      }
    }
  }
  
  if (!schedule && user.status === 'pendingDeletion') {
    console.log('⚠️  No EventBridge schedule found but user is pending deletion');
    console.log('   Possible reasons:');
    console.log('     - Schedule was deleted manually');
    console.log('     - Schedule creation failed');
    console.log('     - Schedule name mismatch');
  }
  
  if (schedule && schedule.State !== 'ENABLED') {
    console.log(`⚠️  Schedule exists but state is "${schedule.State}"`);
    if (schedule.State === 'DISABLED') {
      console.log('   Schedule is disabled - Lambda will not be invoked');
    }
  }
  
  console.log('\n💡 Next Steps:');
  console.log('1. Check CloudWatch Logs for the deletion Lambda (section 4)');
  console.log('2. Check CloudWatch Logs for the API Lambda (section 6)');
  console.log('3. Verify EventBridge schedule executed (check EventBridge metrics)');
  console.log('4. Check Lambda execution role permissions');
  console.log('5. Verify Lambda function ARN matches schedule target');
  console.log('6. Check if Lambda has dead letter queue configured');
  console.log('7. Review CloudWatch alarms for Lambda errors');
}

main().catch(console.error);

