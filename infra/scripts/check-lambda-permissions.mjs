#!/usr/bin/env node
/**
 * Quick check script to verify Lambda permission configuration in code
 * without requiring CDK synthesis or AWS credentials.
 * 
 * This script analyzes the TypeScript code to verify:
 * 1. Wildcard permissions are defined for apiFn and authFn
 * 2. Routes use CfnIntegration instead of HttpLambdaIntegration
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INFRA_DIR = join(__dirname, '..');
const STACK_FILE = join(INFRA_DIR, 'lib', 'app-stack.ts');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkCode() {
  log(`\n🔍 Analyzing code for Lambda permission configuration...`, 'cyan');

  if (!existsSync(STACK_FILE)) {
    log(`   ✗ Stack file not found: ${STACK_FILE}`, 'red');
    return false;
  }

  const code = readFileSync(STACK_FILE, 'utf-8');

  // Check for wildcard permissions
  const hasApiFnWildcard = /apiFn\.addPermission\(['"]AllowHttpApiInvoke['"]/s.test(code) &&
    /sourceArn.*\*\/\*/s.test(code);
  const hasAuthFnWildcard = /authFn\.addPermission\(['"]AllowHttpApiInvoke['"]/s.test(code) &&
    /sourceArn.*\*\/\*/s.test(code);

  // Check for CfnIntegration usage
  const hasCfnIntegrationImport = /import.*CfnIntegration.*from.*apigatewayv2/s.test(code);
  const hasCfnRouteImport = /import.*CfnRoute.*from.*apigatewayv2/s.test(code);
  const hasHelperFunction = /addRouteWithoutPermission\s*=/s.test(code);

  // Count HttpLambdaIntegration usage for apiFn and authFn
  const apiFnHttpIntegrations = (code.match(/HttpLambdaIntegration.*apiFn/gi) || []).length;
  const authFnHttpIntegrations = (code.match(/HttpLambdaIntegration.*authFn/gi) || []).length;

  // Count CfnIntegration usage
  const cfnIntegrationUsage = (code.match(/addRouteWithoutPermission/gi) || []).length;

  // Check for payment routes (these are OK to use HttpLambdaIntegration)
  const paymentRoutes = (code.match(/payments.*HttpLambdaIntegration/gi) || []).length;

  log(`\n📊 Code Analysis Results:`, 'cyan');

  // Wildcard permissions
  log(`\n   Wildcard Permissions:`, 'blue');
  log(`     - apiFn wildcard permission: ${hasApiFnWildcard ? '✓' : '✗'}`, 
    hasApiFnWildcard ? 'green' : 'red');
  log(`     - authFn wildcard permission: ${hasAuthFnWildcard ? '✓' : '✗'}`, 
    hasAuthFnWildcard ? 'green' : 'red');

  // Imports
  log(`\n   Required Imports:`, 'blue');
  log(`     - CfnIntegration import: ${hasCfnIntegrationImport ? '✓' : '✗'}`, 
    hasCfnIntegrationImport ? 'green' : 'red');
  log(`     - CfnRoute import: ${hasCfnRouteImport ? '✓' : '✗'}`, 
    hasCfnRouteImport ? 'green' : 'red');

  // Helper function
  log(`\n   Helper Function:`, 'blue');
  log(`     - addRouteWithoutPermission defined: ${hasHelperFunction ? '✓' : '✗'}`, 
    hasHelperFunction ? 'green' : 'red');

  // Route usage
  log(`\n   Route Configuration:`, 'blue');
  log(`     - Routes using helper function: ${cfnIntegrationUsage}`, 
    cfnIntegrationUsage > 0 ? 'green' : 'yellow');
  log(`     - HttpLambdaIntegration for apiFn: ${apiFnHttpIntegrations} (should be 0)`, 
    apiFnHttpIntegrations === 0 ? 'green' : 'red');
  log(`     - HttpLambdaIntegration for authFn: ${authFnHttpIntegrations} (should be 0)`, 
    authFnHttpIntegrations === 0 ? 'green' : 'red');
  log(`     - Payment routes (OK): ${paymentRoutes}`, 'blue');

  // Overall health
  const isHealthy = 
    hasApiFnWildcard &&
    hasAuthFnWildcard &&
    hasCfnIntegrationImport &&
    hasCfnRouteImport &&
    hasHelperFunction &&
    cfnIntegrationUsage > 0 &&
    apiFnHttpIntegrations === 0 &&
    authFnHttpIntegrations === 0;

  log(`\n${isHealthy ? '✅' : '❌'} Code Check ${isHealthy ? 'PASSED' : 'FAILED'}`, 
    isHealthy ? 'green' : 'red');

  if (!isHealthy) {
    log(`\nIssues found:`, 'red');
    if (!hasApiFnWildcard) log(`   - Missing apiFn wildcard permission`, 'red');
    if (!hasAuthFnWildcard) log(`   - Missing authFn wildcard permission`, 'red');
    if (!hasCfnIntegrationImport) log(`   - Missing CfnIntegration import`, 'red');
    if (!hasCfnRouteImport) log(`   - Missing CfnRoute import`, 'red');
    if (!hasHelperFunction) log(`   - Missing addRouteWithoutPermission helper function`, 'red');
    if (cfnIntegrationUsage === 0) log(`   - No routes using helper function`, 'red');
    if (apiFnHttpIntegrations > 0) log(`   - Found ${apiFnHttpIntegrations} HttpLambdaIntegration for apiFn`, 'red');
    if (authFnHttpIntegrations > 0) log(`   - Found ${authFnHttpIntegrations} HttpLambdaIntegration for authFn`, 'red');
  }

  return isHealthy;
}

// Main execution
log(`\n🧪 Quick Lambda Permissions Code Check`, 'cyan');

if (checkCode()) {
  log(`\n✨ Code looks good! Run 'test-lambda-permissions.mjs' for full synthesis test.`, 'green');
  process.exit(0);
} else {
  log(`\n⚠️  Code issues detected. Please review the issues above.`, 'yellow');
  process.exit(1);
}
