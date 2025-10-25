#!/usr/bin/env node

/**
 * Test script to verify API fixes for SweepPro
 * Tests the fixed endpoints for pending bookings, reassignment, and customer assignments
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token-here';

// Test configuration
const config = {
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName) {
  log(`\n${colors.bold}🧪 Testing: ${testName}${colors.reset}`);
  log('='.repeat(50));
}

function logResult(success, message) {
  const status = success ? '✅ PASS' : '❌ FAIL';
  const color = success ? 'green' : 'red';
  log(`${status}: ${message}`, color);
}

async function testEndpoint(endpoint, expectedFields = []) {
  try {
    log(`📡 GET ${endpoint}`);
    const response = await axios.get(`${BASE_URL}${endpoint}`, config);
    
    if (response.status === 200) {
      logResult(true, `Status: ${response.status}`);
      
      if (response.data.success !== undefined) {
        logResult(response.data.success, `Success flag: ${response.data.success}`);
      }
      
      if (response.data.data) {
        log(`📊 Data count: ${Array.isArray(response.data.data) ? response.data.data.length : 'Object'}`);
        
        // Check for expected fields
        if (expectedFields.length > 0 && Array.isArray(response.data.data)) {
          const sample = response.data.data[0];
          if (sample) {
            expectedFields.forEach(field => {
              const hasField = sample.hasOwnProperty(field);
              logResult(hasField, `Has field '${field}': ${hasField}`);
            });
          }
        }
      }
      
      return { success: true, data: response.data };
    } else {
      logResult(false, `Unexpected status: ${response.status}`);
      return { success: false, error: `Status ${response.status}` };
    }
  } catch (error) {
    if (error.response) {
      logResult(false, `HTTP ${error.response.status}: ${error.response.data?.message || error.message}`);
      return { success: false, error: error.response.data };
    } else {
      logResult(false, `Network error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

async function runTests() {
  log(`${colors.bold}🚀 Starting SweepPro API Fix Tests${colors.reset}`);
  log(`Base URL: ${BASE_URL}`);
  log(`Admin Token: ${ADMIN_TOKEN.substring(0, 20)}...`);
  
  const results = {
    pendingBookings: null,
    reassignmentBookings: null,
    customerAssignments: null,
    assignmentRequests: null,
    adminStats: null
  };

  // Test 1: Pending Bookings
  logTest('Pending Bookings API');
  results.pendingBookings = await testEndpoint('/admin/pending-bookings', [
    'id', 'customerId', 'serviceId', 'status', 'scheduledAt', 'customer', 'service'
  ]);

  // Test 2: Reassignment Bookings
  logTest('Reassignment Bookings API');
  results.reassignmentBookings = await testEndpoint('/admin/reassignment-bookings', [
    'id', 'status', 'assignmentStatus', 'rejectionReason', 'customer', 'service'
  ]);

  // Test 3: Customer Assignments
  logTest('Customer Assignments API');
  results.customerAssignments = await testEndpoint('/admin/customer-assignments', [
    'id', 'customerId', 'maidId', 'isActive', 'customer', 'maid'
  ]);

  // Test 4: Assignment Requests
  logTest('Assignment Requests API');
  results.assignmentRequests = await testEndpoint('/admin/assignment-requests', [
    'id', 'customerId', 'maidId', 'status', 'customer', 'maid'
  ]);

  // Test 5: Admin Stats (to verify overall system health)
  logTest('Admin Stats API');
  results.adminStats = await testEndpoint('/admin/stats');

  // Summary
  logTest('Test Summary');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r && r.success).length;
  
  log(`📊 Total Tests: ${totalTests}`);
  log(`✅ Passed: ${passedTests}`, 'green');
  log(`❌ Failed: ${totalTests - passedTests}`, totalTests - passedTests > 0 ? 'red' : 'green');
  
  // Detailed results
  log(`\n${colors.bold}📋 Detailed Results:${colors.reset}`);
  Object.entries(results).forEach(([testName, result]) => {
    const status = result && result.success ? '✅' : '❌';
    const color = result && result.success ? 'green' : 'red';
    log(`${status} ${testName}: ${result ? (result.success ? 'PASS' : 'FAIL') : 'NO RESULT'}`, color);
  });

  // Recommendations
  log(`\n${colors.bold}💡 Recommendations:${colors.reset}`);
  
  if (!results.pendingBookings?.success) {
    log('• Check if bookings are being created with PENDING status', 'yellow');
    log('• Verify admin authentication token is valid', 'yellow');
  }
  
  if (!results.reassignmentBookings?.success) {
    log('• Check if assignment requests are being created and rejected properly', 'yellow');
    log('• Verify booking assignmentStatus is being updated correctly', 'yellow');
  }
  
  if (!results.customerAssignments?.success) {
    log('• Check if customer-maid assignments are being created', 'yellow');
    log('• Verify database relationships are working correctly', 'yellow');
  }

  log(`\n${colors.bold}🎯 Next Steps:${colors.reset}`);
  log('1. If tests fail, check server logs for detailed error messages');
  log('2. Verify database connection and data integrity');
  log('3. Test with actual frontend application');
  log('4. Check authentication and authorization middleware');

  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests()
    .then(results => {
      const allPassed = Object.values(results).every(r => r && r.success);
      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      log(`💥 Test runner error: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { runTests, testEndpoint };

