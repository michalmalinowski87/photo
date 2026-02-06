#!/usr/bin/env node
/**
 * Cleanup script for orphaned EventBridge gallery expiration schedules
 * 
 * This script finds EventBridge schedules for galleries that no longer exist
 * and optionally deletes them.
 * 
 * Usage:
 *   node scripts/cleanup-orphaned-gallery-schedules.mjs [stage] [--dry-run] [--delete]
 * 
 * Examples:
 *   # Dry run - just list orphaned schedules
 *   node scripts/cleanup-orphaned-gallery-schedules.mjs dev --dry-run
 * 
 *   # Actually delete orphaned schedules
 *   node scripts/cleanup-orphaned-gallery-schedules.mjs dev --delete
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SchedulerClient, ListSchedulesCommand, DeleteScheduleCommand, GetScheduleCommand } from '@aws-sdk/client-scheduler';

const stage = process.argv[2] || 'dev';
const isDryRun = process.argv.includes('--dry-run');
const shouldDelete = process.argv.includes('--delete');

if (!isDryRun && !shouldDelete) {
  console.error('Error: Must specify either --dry-run or --delete');
  console.error('Usage: node scripts/cleanup-orphaned-gallery-schedules.mjs [stage] [--dry-run] [--delete]');
  process.exit(1);
}

// Detect region from environment or default to eu-west-1
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1';

const ddbClient = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const scheduler = new SchedulerClient({ region });

// Table names based on stage
const galleriesTable = `${stage}-galleries`;

// Schedule name prefix for gallery expiration schedules
const GALLERY_SCHEDULE_PREFIX = 'gallery-expiry-';

/**
 * Extract gallery ID from schedule name
 * Format: gallery-expiry-{galleryId}
 */
function extractGalleryId(scheduleName) {
  if (!scheduleName.startsWith(GALLERY_SCHEDULE_PREFIX)) {
    return null;
  }
  return scheduleName.substring(GALLERY_SCHEDULE_PREFIX.length);
}

/**
 * List all gallery expiration schedules
 */
async function listGallerySchedules() {
  console.log('📋 Listing all gallery expiration schedules...');
  const schedules = [];
  let nextToken = undefined;
  
  do {
    const response = await scheduler.send(new ListSchedulesCommand({
      NamePrefix: GALLERY_SCHEDULE_PREFIX,
      MaxResults: 100,
      NextToken: nextToken
    }));
    
    if (response.Schedules) {
      schedules.push(...response.Schedules);
    }
    
    nextToken = response.NextToken;
  } while (nextToken);
  
  console.log(`   Found ${schedules.length} gallery expiration schedules\n`);
  return schedules;
}

/**
 * Check if galleries exist in DynamoDB
 */
async function checkGalleriesExist(galleryIds) {
  if (galleryIds.length === 0) {
    return new Map();
  }
  
  console.log(`🔍 Checking existence of ${galleryIds.length} galleries in DynamoDB...`);
  
  const existingGalleries = new Map();
  
  // Batch get in chunks of 100 (DynamoDB limit)
  for (let i = 0; i < galleryIds.length; i += 100) {
    const chunk = galleryIds.slice(i, i + 100);
    const keys = chunk.map(galleryId => ({ galleryId }));
    
    try {
      const response = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [galleriesTable]: {
            Keys: keys
          }
        }
      }));
      
      if (response.Responses && response.Responses[galleriesTable]) {
        for (const gallery of response.Responses[galleriesTable]) {
          existingGalleries.set(gallery.galleryId, gallery);
        }
      }
    } catch (error) {
      console.error(`   ⚠️  Error checking gallery batch: ${error.message}`);
    }
  }
  
  console.log(`   Found ${existingGalleries.size} existing galleries\n`);
  return existingGalleries;
}

/**
 * Get schedule details
 */
async function getScheduleDetails(scheduleName) {
  try {
    const response = await scheduler.send(new GetScheduleCommand({ Name: scheduleName }));
    return {
      name: scheduleName,
      state: response.State,
      scheduleExpression: response.ScheduleExpression,
      lastModificationDate: response.LastModificationDate,
      targetArn: response.Target?.Arn
    };
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a schedule
 */
async function deleteSchedule(scheduleName) {
  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName }));
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false; // Already deleted
    }
    throw error;
  }
}

/**
 * Main cleanup function
 */
async function cleanupOrphanedSchedules() {
  console.log(`🧹 Cleaning up orphaned gallery expiration schedules (stage: ${stage}, region: ${region})\n`);
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No schedules will be deleted\n');
  } else {
    console.log('⚠️  DELETE MODE - Orphaned schedules will be deleted\n');
  }
  
  // 1. List all gallery schedules
  const schedules = await listGallerySchedules();
  
  if (schedules.length === 0) {
    console.log('✅ No gallery expiration schedules found. Nothing to clean up.');
    return;
  }
  
  // 2. Extract gallery IDs
  const scheduleMap = new Map();
  const galleryIds = [];
  
  for (const schedule of schedules) {
    const galleryId = extractGalleryId(schedule.Name);
    if (galleryId) {
      scheduleMap.set(galleryId, schedule);
      galleryIds.push(galleryId);
    }
  }
  
  console.log(`📊 Extracted ${galleryIds.length} gallery IDs from schedule names\n`);
  
  // 3. Check which galleries exist
  const existingGalleries = await checkGalleriesExist(galleryIds);
  
  // 4. Find orphaned schedules
  const orphanedSchedules = [];
  for (const [galleryId, schedule] of scheduleMap.entries()) {
    if (!existingGalleries.has(galleryId)) {
      orphanedSchedules.push({ galleryId, scheduleName: schedule.Name, schedule });
    }
  }
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total schedules: ${schedules.length}`);
  console.log(`   Existing galleries: ${existingGalleries.size}`);
  console.log(`   Orphaned schedules: ${orphanedSchedules.length}\n`);
  
  if (orphanedSchedules.length === 0) {
    console.log('✅ No orphaned schedules found. All schedules have corresponding galleries.');
    return;
  }
  
  // 5. Display orphaned schedules
  console.log('🔴 Orphaned Schedules (galleries no longer exist):\n');
  for (const { galleryId, scheduleName, schedule } of orphanedSchedules) {
    const details = await getScheduleDetails(scheduleName);
    console.log(`   Schedule: ${scheduleName}`);
    console.log(`   Gallery ID: ${galleryId}`);
    if (details) {
      console.log(`   State: ${details.state}`);
      console.log(`   Schedule Expression: ${details.scheduleExpression}`);
      if (details.lastModificationDate) {
        console.log(`   Last Modified: ${new Date(details.lastModificationDate).toISOString()}`);
      }
    }
    console.log('');
  }
  
  // 6. Delete orphaned schedules if requested
  if (shouldDelete) {
    console.log(`\n🗑️  Deleting ${orphanedSchedules.length} orphaned schedules...\n`);
    
    let deleted = 0;
    let failed = 0;
    let alreadyDeleted = 0;
    
    for (const { scheduleName, galleryId } of orphanedSchedules) {
      try {
        const result = await deleteSchedule(scheduleName);
        if (result) {
          console.log(`   ✅ Deleted: ${scheduleName} (gallery: ${galleryId})`);
          deleted++;
        } else {
          console.log(`   ℹ️  Already deleted: ${scheduleName} (gallery: ${galleryId})`);
          alreadyDeleted++;
        }
      } catch (error) {
        console.error(`   ❌ Failed to delete ${scheduleName}: ${error.message}`);
        failed++;
      }
    }
    
    console.log(`\n✅ Cleanup complete:`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Already deleted: ${alreadyDeleted}`);
    console.log(`   Failed: ${failed}`);
  } else {
    console.log(`\n💡 To delete these orphaned schedules, run:`);
    console.log(`   node scripts/cleanup-orphaned-gallery-schedules.mjs ${stage} --delete\n`);
  }
}

// Run cleanup
cleanupOrphanedSchedules().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

