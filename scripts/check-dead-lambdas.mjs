#!/usr/bin/env node
/**
 * Script to check for and optionally remove dead Lambda functions
 * 
 * This script verifies which Lambda functions exist in AWS and identifies
 * any that are not defined in the current CDK stack (dead infrastructure).
 * 
 * Usage:
 *   node scripts/check-dead-lambdas.mjs [--remove]
 * 
 * Options:
 *   --remove    Actually delete dead Lambda functions (default: dry-run)
 *   --stage      AWS stage/environment (default: from CDK context or 'dev')
 */

import { LambdaClient, ListFunctionsCommand, DeleteFunctionCommand } from '@aws-sdk/client-lambda';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Expected Lambda function names (from CDK stack)
// These are the logical IDs - actual function names will have CDK-generated suffixes
const EXPECTED_FUNCTIONS = [
	'ApiFunction',
	'AuthFunction',
	'DownloadsZipFn',
	'ExpiryCheckFn',
	'GalleriesDeleteHelperFn',
	'GalleryExpiryDeletionFn',
	'ImagesOnS3DeleteBatchFn',
	'PaymentsCheckoutFn',
	'PaymentsWebhookFn',
	'PaymentsSuccessFn',
	'PaymentsCancelFn',
	'PaymentsCheckStatusFn',
	'TransactionExpiryCheckFn'
];

// Deprecated functions that should NOT exist
const DEPRECATED_FUNCTIONS = [
	'onGalleryExpired',  // Old DynamoDB Stream handler - replaced by EventBridge Scheduler
];

async function getCdkStackName(stage) {
	try {
		// Try to get stack name from CDK context or environment
		const cdkJson = JSON.parse(readFileSync(join(projectRoot, 'infra/cdk.json'), 'utf8'));
		const app = cdkJson.app || 'npx ts-node --prefer-ts-exts bin/cdk.ts';
		// Extract stack name pattern - typically PixiProof-{stage}
		return `PixiProof-${stage}`;
	} catch (err) {
		console.warn('Could not read cdk.json, using default stack name pattern');
		return `PixiProof-${stage}`;
	}
}

async function listLambdaFunctions(lambdaClient) {
	try {
		const command = new ListFunctionsCommand({});
		const response = await lambdaClient.send(command);
		return response.Functions || [];
	} catch (err) {
		console.error('Error listing Lambda functions:', err.message);
		throw err;
	}
}

function isExpectedFunction(functionName, expectedPrefixes) {
	return expectedPrefixes.some(prefix => functionName.includes(prefix));
}

function isDeprecatedFunction(functionName) {
	return DEPRECATED_FUNCTIONS.some(deprecated => 
		functionName.toLowerCase().includes(deprecated.toLowerCase())
	);
}

async function deleteFunction(lambdaClient, functionName) {
	try {
		console.log(`  Deleting ${functionName}...`);
		const command = new DeleteFunctionCommand({ FunctionName: functionName });
		await lambdaClient.send(command);
		console.log(`  ✓ Successfully deleted ${functionName}`);
		return true;
	} catch (err) {
		console.error(`  ✗ Failed to delete ${functionName}:`, err.message);
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const shouldRemove = args.includes('--remove');
	const stageArg = args.find(arg => arg.startsWith('--stage='));
	const stage = stageArg ? stageArg.split('=')[1] : (process.env.STAGE || 'dev');

	console.log('🔍 Lambda Function Cleanup Script');
	console.log('==================================\n');
	console.log(`Stage: ${stage}`);
	console.log(`Mode: ${shouldRemove ? 'REMOVE (will delete functions)' : 'DRY-RUN (read-only)'}\n`);

	// Initialize Lambda client
	const lambdaClient = new LambdaClient({
		region: process.env.AWS_REGION || 'us-east-1'
	});

	// List all Lambda functions
	console.log('Fetching Lambda functions from AWS...');
	const functions = await listLambdaFunctions(lambdaClient);
	console.log(`Found ${functions.length} total Lambda functions\n`);

	// Filter functions by stack name pattern
	const stackNamePattern = await getCdkStackName(stage);
	const stackFunctions = functions.filter(fn => 
		fn.FunctionName.includes(stackNamePattern) || 
		fn.FunctionName.includes('PixiProof') ||
		fn.FunctionName.includes('PhotoCloud')
	);

	console.log(`Found ${stackFunctions.length} functions matching stack pattern\n`);

	// Categorize functions
	const expectedFunctions = [];
	const deprecatedFunctions = [];
	const unknownFunctions = [];

	for (const fn of stackFunctions) {
		const functionName = fn.FunctionName;
		
		if (isDeprecatedFunction(functionName)) {
			deprecatedFunctions.push(fn);
		} else if (isExpectedFunction(functionName, EXPECTED_FUNCTIONS)) {
			expectedFunctions.push(fn);
		} else {
			unknownFunctions.push(fn);
		}
	}

	// Report findings
	console.log('📊 Function Analysis');
	console.log('====================\n');
	console.log(`✅ Expected functions: ${expectedFunctions.length}`);
	console.log(`❌ Deprecated functions (should be removed): ${deprecatedFunctions.length}`);
	console.log(`⚠️  Unknown functions: ${unknownFunctions.length}\n`);

	// Show deprecated functions
	if (deprecatedFunctions.length > 0) {
		console.log('🚨 DEPRECATED FUNCTIONS (Dead Infrastructure):');
		console.log('='.repeat(50));
		for (const fn of deprecatedFunctions) {
			console.log(`\n  Function: ${fn.FunctionName}`);
			console.log(`  Runtime: ${fn.Runtime}`);
			console.log(`  Last Modified: ${fn.LastModified}`);
			console.log(`  Memory: ${fn.MemorySize} MB`);
			console.log(`  Timeout: ${fn.Timeout} seconds`);
			
			if (shouldRemove) {
				await deleteFunction(lambdaClient, fn.FunctionName);
			} else {
				console.log(`  [DRY-RUN] Would delete this function`);
			}
		}
		console.log('\n');
	} else {
		console.log('✅ No deprecated functions found!\n');
	}

	// Show unknown functions (for review)
	if (unknownFunctions.length > 0) {
		console.log('⚠️  UNKNOWN FUNCTIONS (Review Required):');
		console.log('='.repeat(50));
		for (const fn of unknownFunctions) {
			console.log(`  - ${fn.FunctionName} (${fn.Runtime}, ${fn.MemorySize}MB)`);
		}
		console.log('\n');
	}

	// Summary
	console.log('📋 Summary');
	console.log('==========\n');
	console.log(`Total functions analyzed: ${stackFunctions.length}`);
	console.log(`Expected functions: ${expectedFunctions.length}`);
	console.log(`Deprecated functions found: ${deprecatedFunctions.length}`);
	
	if (deprecatedFunctions.length > 0) {
		if (shouldRemove) {
			console.log(`\n✅ Cleanup completed! Removed ${deprecatedFunctions.length} deprecated function(s).`);
		} else {
			console.log(`\n💡 To actually remove these functions, run with --remove flag:`);
			console.log(`   node scripts/check-dead-lambdas.mjs --remove --stage=${stage}`);
		}
	} else {
		console.log(`\n✅ No cleanup needed - all functions are current!`);
	}
}

main().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});

