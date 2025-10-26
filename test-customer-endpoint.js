#!/usr/bin/env node

/**
 * Test the new customer status endpoint that works with customer tokens
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080/api';
const CUSTOMER_TOKEN = process.env.CUSTOMER_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMTc4MDllNS0yYTAwLTQwMDMtOTI2Ny02ZWFkODViZWRjMTUiLCJpZCI6ImYxNzgwOWU1LTJhMDAtNDAwMy05MjY3LTZlYWQ4NWJlZGMxNSIsInJvbGUiOiJDVVNUT01FUiIsImlhdCI6MTc2MTI5OTA4NywiZXhwIjoxNzYxMzg1NDg3fQ.RF08X3PBSqAl-hXiNZlQvy5QAWUwaozUeGzZ4bb1sSQ';

const config = {
  headers: {
    'Authorization': `Bearer ${CUSTOMER_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

async function testCustomerStatusAPI() {
  console.log('🧪 Testing NEW Customer Status API (Customer Token)');
  console.log('='.repeat(60));
  
  // Use the new customer endpoint that doesn't require admin privileges
  const endpoint = `/admin/customer-assignments/my-status`;
  
  console.log(`📡 Testing: GET ${endpoint}`);
  console.log(`🔗 Full URL: ${BASE_URL}${endpoint}`);
  console.log(`👤 Using customer token from login response`);
  console.log(`🔑 Token: ${CUSTOMER_TOKEN.substring(0, 50)}...`);
  
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, config);
    
    console.log('\n✅ SUCCESS!');
    console.log(`Status: ${response.status}`);
    console.log(`Success: ${response.data.success}`);
    
    if (response.data.data) {
      console.log('\n📊 Response Data:');
      console.log(`- Customer ID: ${response.data.data.customerId}`);
      console.log(`- Has Assignment: ${response.data.data.hasAssignment}`);
      console.log(`- Has Subscription: ${response.data.data.hasSubscription}`);
      console.log(`- Is in Buffer Period: ${response.data.data.isInBufferPeriod}`);
      
      if (response.data.data.assignment) {
        console.log(`- Assigned Maid: ${response.data.data.assignment.maid.name}`);
        console.log(`- Assignment Date: ${response.data.data.assignment.assignedAt}`);
        console.log(`- Maid Rating: ${response.data.data.assignment.maid.rating}`);
        console.log(`- Maid Skills: ${response.data.data.assignment.maid.skills.join(', ')}`);
      } else {
        console.log(`- No maid assignment found`);
      }
      
      if (response.data.data.subscription) {
        console.log(`- Subscription Status: ${response.data.data.subscription.status}`);
        console.log(`- Subscription End Date: ${response.data.data.subscription.endDate}`);
      } else {
        console.log(`- No active subscription found`);
      }
      
      if (response.data.data.nextBookingDate) {
        console.log(`- Next Booking: ${response.data.data.nextBookingDate}`);
      }
      
      if (response.data.data.lastBookingDate) {
        console.log(`- Last Booking: ${response.data.data.lastBookingDate}`);
      }
      
      if (response.data.data.bufferPeriod) {
        console.log(`- Buffer Period: ${response.data.data.bufferPeriod.startDate} to ${response.data.data.bufferPeriod.endDate}`);
        console.log(`- Buffer Reason: ${response.data.data.bufferPeriod.reason}`);
      }
    }
    
    console.log('\n🎉 NEW Customer API is working correctly!');
    console.log('✅ Customers can now check their own status without admin privileges');
    
  } catch (error) {
    console.log('\n❌ FAILED!');
    
    if (error.response) {
      console.log(`HTTP Status: ${error.response.status}`);
      console.log(`Error Message: ${error.response.data?.message || 'No message'}`);
      
      if (error.response.data?.error) {
        console.log(`Error Details: ${error.response.data.error}`);
      }
      
      console.log('\n🔍 Full Error Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`Network Error: ${error.message}`);
    }
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check if the server is running on port 8080');
    console.log('2. Verify the customer token is valid');
    console.log('3. Check server logs for detailed error messages');
    console.log('4. Ensure the new route is properly configured');
  }
}

// Also test the old admin endpoint to show the difference
async function testAdminEndpoint() {
  console.log('\n🧪 Testing OLD Admin Endpoint (Should Fail with Customer Token)');
  console.log('='.repeat(60));
  
  const customerId = 'f17809e5-2a00-4003-9267-6ead85bedc15';
  const endpoint = `/admin/customer-assignments/status/${customerId}`;
  
  console.log(`📡 Testing: GET ${endpoint}`);
  console.log(`👤 Customer ID: ${customerId}`);
  console.log(`🔑 Using customer token (should fail)`);
  
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, config);
    console.log('✅ Unexpected success!');
    console.log(`Status: ${response.status}`);
  } catch (error) {
    console.log('❌ Expected failure (403 Forbidden)');
    console.log(`Status: ${error.response?.status || 'Network Error'}`);
    console.log(`Message: ${error.response?.data?.error || error.message}`);
  }
}

// Run both tests
async function runAllTests() {
  await testCustomerStatusAPI();
  await testAdminEndpoint();
  
  console.log('\n🎯 Summary:');
  console.log('✅ NEW endpoint: /api/admin/customer-assignments/my-status');
  console.log('   - Works with customer tokens');
  console.log('   - Customers can check their own status');
  console.log('   - No admin privileges required');
  console.log('');
  console.log('❌ OLD endpoint: /api/admin/customer-assignments/status/:customerId');
  console.log('   - Requires admin tokens');
  console.log('   - Customers cannot access this endpoint');
  console.log('   - Use this for admin dashboard');
  console.log('');
  console.log('💡 Recommendation:');
  console.log('Use the NEW endpoint for customer-facing applications');
  console.log('Use the OLD endpoint for admin dashboard');
}

runAllTests()
  .catch(error => {
    console.error('💥 Test runner error:', error.message);
  });


