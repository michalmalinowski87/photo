#!/usr/bin/env node
/**
 * Test script to verify Lambda permissions are configured correctly
 * without requiring a full deployment.
 * 
 * This script:
 * 1. Synthesizes the CDK stack
 * 2. Analyzes Lambda permission resources
 * 3. Verifies wildcard permissions are used instead of individual route permissions
 * 4. Checks estimated policy sizes
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INFRA_DIR = join(__dirname, '..');

// Colors for output
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

function getStage() {
  return process.env.STAGE || process.argv[2] || 'dev';
}

function synthesizeStack(stage) {
  log(`\n📦 Synthesizing CDK stack for stage: ${stage}...`, 'cyan');
  
  // Load env file if it exists (same logic as deploy.sh)
  const envFile = join(INFRA_DIR, `.env.${stage === 'dev' ? 'development' : stage}.local`);
  if (existsSync(envFile)) {
    log(`   Loading environment from: ${envFile}`, 'blue');
    const envContent = readFileSync(envFile, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
  }

  try {
    // Build first
    log('   Building TypeScript...', 'blue');
    execSync('npm run build', { 
      cwd: INFRA_DIR, 
      stdio: 'inherit',
      env: { ...process.env, STAGE: stage }
    });
    
    // Then synthesize (may fail if env vars missing, but that's OK for testing structure)
    log('   Synthesizing CloudFormation template...', 'blue');
    log('   Note: This may fail if required env vars are missing, but we can still check structure', 'yellow');
    
    const synthOutput = execSync(`npm run synth -- --context stage=${stage} 2>&1`, { 
      cwd: INFRA_DIR, 
      stdio: 'pipe',
      env: { ...process.env, STAGE: stage },
      encoding: 'utf-8'
    });
    
    log('   ✓ Synthesis complete', 'green');
    return true;
  } catch (error) {
    // Check if template was still generated despite errors
    const templatePath = join(INFRA_DIR, 'cdk.out', `PixiProof-${stage}.template.json`);
    if (existsSync(templatePath)) {
      log('   ⚠️  Synthesis had errors, but template was generated', 'yellow');
      log('   Proceeding with analysis...', 'yellow');
      return true;
    }
    
    log(`   ✗ Synthesis failed`, 'red');
    log(`   This is expected if required env vars are missing.`, 'yellow');
    log(`   Run the quick check instead: node scripts/check-lambda-permissions.mjs`, 'yellow');
    if (error.stdout) log(`   stdout: ${error.stdout.toString().substring(0, 500)}`, 'yellow');
    if (error.stderr) log(`   stderr: ${error.stderr.toString().substring(0, 500)}`, 'yellow');
    return false;
  }
}

function analyzeLambdaPermissions(stage) {
  log(`\n🔍 Analyzing Lambda permissions...`, 'cyan');
  
  const templatePath = join(INFRA_DIR, 'cdk.out', `PixiProof-${stage}.template.json`);
  
  if (!existsSync(templatePath)) {
    log(`   ✗ Template not found: ${templatePath}`, 'red');
    log('   Run synthesis first', 'yellow');
    return false;
  }

  const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
  const resources = template.Resources || {};
  
  // Find all Lambda permission resources
  const permissions = Object.entries(resources)
    .filter(([key, value]) => 
      value.Type === 'AWS::Lambda::Permission' && 
      (key.includes('ApiFunction') || key.includes('AuthFunction'))
    );

  log(`   Found ${permissions.length} Lambda permission resources`, 'blue');

  // Analyze permissions
  const apiFnPermissions = [];
  const authFnPermissions = [];
  const wildcardPermissions = [];
  const individualPermissions = [];

  permissions.forEach(([key, permission]) => {
    const props = permission.Properties || {};
    const sourceArn = props.SourceArn || '';
    const functionName = props.FunctionName?.Ref || props.FunctionName?.['Fn::GetAtt']?.[0] || 'unknown';
    
    const isWildcard = sourceArn.includes('*/*') || sourceArn.includes('*');
    const isApiFn = key.includes('ApiFunction') || functionName.includes('apiLambda');
    const isAuthFn = key.includes('AuthFunction') || functionName.includes('authLambda');

    if (isWildcard) {
      wildcardPermissions.push({ key, sourceArn, functionName });
    } else {
      individualPermissions.push({ key, sourceArn, functionName });
    }

    if (isApiFn) {
      apiFnPermissions.push({ key, sourceArn, isWildcard });
    }
    if (isAuthFn) {
      authFnPermissions.push({ key, sourceArn, isWildcard });
    }
  });

  // Estimate policy sizes
  function estimatePolicySize(perms) {
    // Each permission statement is roughly 200-300 bytes
    // Wildcard permission: ~250 bytes
    // Individual permission: ~280 bytes per route
    const baseSize = 100; // Policy wrapper
    const wildcardSize = 250;
    const individualSize = 280;
    
    const wildcards = perms.filter(p => p.isWildcard).length;
    const individuals = perms.filter(p => !p.isWildcard).length;
    
    return baseSize + (wildcards * wildcardSize) + (individuals * individualSize);
  }

  const apiFnPolicySize = estimatePolicySize(apiFnPermissions);
  const authFnPolicySize = estimatePolicySize(authFnPermissions);
  const totalPolicySize = apiFnPolicySize + authFnPolicySize;

  // Report results
  log(`\n📊 Results:`, 'cyan');
  log(`   API Function (apiFn):`, 'blue');
  log(`     - Total permissions: ${apiFnPermissions.length}`, 'blue');
  log(`     - Wildcard permissions: ${apiFnPermissions.filter(p => p.isWildcard).length}`, 
    apiFnPermissions.filter(p => p.isWildcard).length > 0 ? 'green' : 'red');
  log(`     - Individual permissions: ${apiFnPermissions.filter(p => !p.isWildcard).length}`, 
    apiFnPermissions.filter(p => !p.isWildcard).length === 0 ? 'green' : 'yellow');
  log(`     - Estimated policy size: ${apiFnPolicySize} bytes`, 
    apiFnPolicySize < 20480 ? 'green' : 'red');

  log(`   Auth Function (authFn):`, 'blue');
  log(`     - Total permissions: ${authFnPermissions.length}`, 'blue');
  log(`     - Wildcard permissions: ${authFnPermissions.filter(p => p.isWildcard).length}`, 
    authFnPermissions.filter(p => p.isWildcard).length > 0 ? 'green' : 'red');
  log(`     - Individual permissions: ${authFnPermissions.filter(p => !p.isWildcard).length}`, 
    authFnPermissions.filter(p => !p.isWildcard).length === 0 ? 'green' : 'yellow');
  log(`     - Estimated policy size: ${authFnPolicySize} bytes`, 
    authFnPolicySize < 20480 ? 'green' : 'red');

  log(`\n✅ Overall:`, 'cyan');
  log(`   - Wildcard permissions: ${wildcardPermissions.length}`, 
    wildcardPermissions.length >= 2 ? 'green' : 'red');
  log(`   - Individual permissions: ${individualPermissions.length}`, 
    individualPermissions.length === 0 ? 'green' : 'yellow');
  log(`   - Total estimated policy size: ${totalPolicySize} bytes / 20480 bytes limit`, 
    totalPolicySize < 20480 ? 'green' : 'red');

  // Show wildcard permissions
  if (wildcardPermissions.length > 0) {
    log(`\n✓ Wildcard permissions found:`, 'green');
    wildcardPermissions.forEach(({ key, sourceArn }) => {
      log(`   - ${key}: ${sourceArn}`, 'green');
    });
  }

  // Warn about individual permissions
  if (individualPermissions.length > 0) {
    log(`\n⚠️  Individual permissions found (should be 0):`, 'yellow');
    individualPermissions.slice(0, 10).forEach(({ key, sourceArn }) => {
      log(`   - ${key}: ${sourceArn.substring(0, 80)}...`, 'yellow');
    });
    if (individualPermissions.length > 10) {
      log(`   ... and ${individualPermissions.length - 10} more`, 'yellow');
    }
  }

  // Final verdict
  const isHealthy = 
    wildcardPermissions.length >= 2 &&
    individualPermissions.length === 0 &&
    apiFnPolicySize < 20480 &&
    authFnPolicySize < 20480;

  log(`\n${isHealthy ? '✅' : '❌'} Test ${isHealthy ? 'PASSED' : 'FAILED'}`, 
    isHealthy ? 'green' : 'red');

  if (!isHealthy) {
    log(`\nIssues found:`, 'red');
    if (wildcardPermissions.length < 2) {
      log(`   - Missing wildcard permissions (expected 2, found ${wildcardPermissions.length})`, 'red');
    }
    if (individualPermissions.length > 0) {
      log(`   - Found ${individualPermissions.length} individual permissions (should be 0)`, 'red');
    }
    if (apiFnPolicySize >= 20480) {
      log(`   - apiFn policy size (${apiFnPolicySize} bytes) exceeds limit`, 'red');
    }
    if (authFnPolicySize >= 20480) {
      log(`   - authFn policy size (${authFnPolicySize} bytes) exceeds limit`, 'red');
    }
  }

  return isHealthy;
}

// Main execution
const stage = getStage();
log(`\n🧪 Testing Lambda Permissions Configuration`, 'cyan');
log(`   Stage: ${stage}`, 'blue');

if (!synthesizeStack(stage)) {
  process.exit(1);
}

if (!analyzeLambdaPermissions(stage)) {
  process.exit(1);
}

log(`\n✨ Test complete!`, 'green');
