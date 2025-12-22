#!/usr/bin/env node

/**
 * Pre-Deployment Check Script
 * 
 * Runs validation checks before deploying to Render
 * Usage: node scripts/pre-deployment-check.js
 */

const fs = require('fs');
const path = require('path');

function checkFile(filepath, description) {
  const exists = fs.existsSync(filepath);
  console.log(`${exists ? '✅' : '❌'} ${description}: ${filepath}`);
  return exists;
}

function checkPackageScript(scriptName) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const exists = packageJson.scripts && packageJson.scripts[scriptName];
  console.log(`${exists ? '✅' : '❌'} Package script '${scriptName}' exists`);
  return exists;
}

function checkEnvironmentVariable(varName) {
  const exists = process.env[varName];
  console.log(`${exists ? '✅' : '⚠️ '} Environment variable '${varName}' ${exists ? 'set' : 'not set (will need to be set in Render)'}`);
  return exists;
}

function main() {
  console.log('🚀 Pre-Deployment Check for Sweepro\n');

  let allChecks = true;

  // File checks
  console.log('📁 File Structure Checks:');
  allChecks &= checkFile('package.json', 'Package.json');
  allChecks &= checkFile('prisma/schema.prisma', 'Prisma schema');
  allChecks &= checkFile('src/index.js', 'Main server file');
  allChecks &= checkFile('src/workers/assignmentWorker.js', 'Assignment worker');
  allChecks &= checkFile('src/workers/adminReassignWorker.js', 'Reassignment worker');
  allChecks &= checkFile('src/cron/cronManager.js', 'Cron manager');
  allChecks &= checkFile('render.yaml', 'Render configuration');

  console.log('\n📦 Package Scripts Checks:');
  allChecks &= checkPackageScript('start');
  allChecks &= checkPackageScript('worker');
  allChecks &= checkPackageScript('reassign-worker');
  allChecks &= checkPackageScript('cron');

  console.log('\n🔧 Environment Variables (Local):');
  checkEnvironmentVariable('DATABASE_URL');
  checkEnvironmentVariable('REDIS_URL');
  checkEnvironmentVariable('JWT_SECRET');

  console.log('\n🎯 Critical Deployment Files:');
  const deploymentFiles = [
    'DEPLOYMENT_GUIDE.md',
    'DEPLOYMENT_CHECKLIST.md',
    'scripts/start-production.sh',
    'scripts/start-worker.sh'
  ];
  
  deploymentFiles.forEach(file => {
    checkFile(file, `Deployment file`);
  });

  console.log('\n📋 Prisma Checks:');
  try {
    const { execSync } = require('child_process');
    execSync('npx prisma validate', { stdio: 'ignore' });
    console.log('✅ Prisma schema is valid');
  } catch (error) {
    console.log('❌ Prisma schema validation failed');
    allChecks = false;
  }

  console.log('\n🧪 Test Run Checks:');
  try {
    // Check if main files can be imported without errors
    require('../src/utils/timeSlotUtils');
    console.log('✅ Time slot utilities import correctly');
    
    // Check if job scheduler can be imported
    require('../src/services/jobScheduler');
    console.log('✅ Job scheduler imports correctly');
    
    // Check if daily automation can be imported
    require('../src/scripts/daily-booking-automation');
    console.log('✅ Daily automation script imports correctly');
  } catch (error) {
    console.log(`❌ Import error: ${error.message}`);
    allChecks = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allChecks) {
    console.log('🎉 ALL CHECKS PASSED! Ready for Render deployment.');
    console.log('\n📚 Next Steps:');
    console.log('1. Commit all changes to GitHub');
    console.log('2. Follow DEPLOYMENT_CHECKLIST.md');
    console.log('3. Deploy services in this order:');
    console.log('   - PostgreSQL Database');
    console.log('   - Redis');
    console.log('   - Main API Server');
    console.log('   - Background Workers');
  } else {
    console.log('⚠️  SOME CHECKS FAILED. Please fix issues before deployment.');
    console.log('\n🔧 Common Fixes:');
    console.log('- Ensure all required files exist');
    console.log('- Check package.json scripts');
    console.log('- Validate Prisma schema');
    console.log('- Fix import errors');
  }
  
  console.log('\n🔗 Deployment Resources:');
  console.log('- Render Dashboard: https://dashboard.render.com');
  console.log('- Deployment Guide: ./DEPLOYMENT_GUIDE.md');
  console.log('- Checklist: ./DEPLOYMENT_CHECKLIST.md');
  
  process.exit(allChecks ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { main };