#!/usr/bin/env node

/**
 * Test the customer status API with the correct customer ID from login response
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMTc4MDllNS0yYTAwLTQwMDMtOTI2Ny02ZWFkODViZWRjMTUiLCJpZCI6ImYxNzgwOWU1LTJhMDAtNDAwMy05MjY3LTZlYWQ4NWJlZGMxNSIsInJvbGUiOiJDVVNUT01FUiIsImlhdCI6MTc2MTI5OTA4NywiZXhwIjoxNzYxMzg1NDg3fQ.RF08X3PBSqAl-hXiNZlQvy5QAWUwaozUeGzZ4bb1sSQ';

const config = {
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

async function testCustomerStatusAPI() {
  console.log('🧪 Testing Customer Status API with Correct Customer ID');
  console.log('='.repeat(60));
  
  // Use the customer ID from the login response
  const customerId = 'f17809e5-2a00-4003-9267-6ead85bedc15';
  const endpoint = `/admin/customer-assignments/status/${customerId}`;
  
  console.log(`📡 Testing: GET ${endpoint}`);
  console.log(`🔗 Full URL: ${BASE_URL}${endpoint}`);
  console.log(`👤 Customer ID: ${customerId}`);
  console.log(`🔑 Using token from login response`);
  
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
    }
    
    console.log('\n🎉 API is working correctly!');
    
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
    console.log('2. Verify the customer ID exists in the database');
    console.log('3. Check server logs for detailed error messages');
    console.log('4. Ensure the admin routes are properly configured');
  }
}

// Also test the wrong customer ID for comparison
async function testWrongCustomerID() {
  console.log('\n🧪 Testing with Wrong Customer ID (for comparison)');
  console.log('='.repeat(60));
  
  const wrongCustomerId = '66e9c14e-2d3d-410e-8837-004cf2f3f278';
  const endpoint = `/admin/customer-assignments/status/${wrongCustomerId}`;
  
  console.log(`📡 Testing: GET ${endpoint}`);
  console.log(`👤 Wrong Customer ID: ${wrongCustomerId}`);
  
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, config);
    console.log('✅ This should work now too (if customer exists)');
    console.log(`Status: ${response.status}`);
  } catch (error) {
    console.log('❌ Expected to fail or return empty data');
    console.log(`Status: ${error.response?.status || 'Network Error'}`);
  }
}

// Run both tests
async function runAllTests() {
  await testCustomerStatusAPI();
  await testWrongCustomerID();
  
  console.log('\n🎯 Summary:');
  console.log('The API should work with the correct customer ID from your login response.');
  console.log('If it still fails, the issue might be:');
  console.log('1. Server not restarted after route fixes');
  console.log('2. Database connection issues');
  console.log('3. Authentication/authorization problems');
}

runAllTests()
  .catch(error => {
    console.error('💥 Test runner error:', error.message);
  });


