#!/usr/bin/env node

/**
 * Quick test for the customer status API fix
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token-here';

const config = {
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

async function testCustomerStatusAPI() {
  console.log('🧪 Testing Customer Status API Fix');
  console.log('='.repeat(50));
  
  const customerId = '66e9c14e-2d3d-410e-8837-004cf2f3f278';
  const endpoint = `/admin/customer-assignments/status/${customerId}`;
  
  console.log(`📡 Testing: GET ${endpoint}`);
  console.log(`🔗 Full URL: ${BASE_URL}${endpoint}`);
  
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, config);
    
    console.log('✅ SUCCESS!');
    console.log(`Status: ${response.status}`);
    console.log(`Success: ${response.data.success}`);
    
    if (response.data.data) {
      console.log('📊 Response Data:');
      console.log(`- Customer ID: ${response.data.data.customerId}`);
      console.log(`- Has Assignment: ${response.data.data.hasAssignment}`);
      console.log(`- Has Subscription: ${response.data.data.hasSubscription}`);
      console.log(`- Is in Buffer Period: ${response.data.data.isInBufferPeriod}`);
      
      if (response.data.data.assignment) {
        console.log(`- Assigned Maid: ${response.data.data.assignment.maid.name}`);
      }
      
      if (response.data.data.subscription) {
        console.log(`- Subscription Status: ${response.data.data.subscription.status}`);
      }
    }
    
  } catch (error) {
    console.log('❌ FAILED!');
    
    if (error.response) {
      console.log(`HTTP Status: ${error.response.status}`);
      console.log(`Error Message: ${error.response.data?.message || 'No message'}`);
      console.log(`Error Details:`, error.response.data);
    } else {
      console.log(`Network Error: ${error.message}`);
    }
  }
}

// Run the test
testCustomerStatusAPI()
  .then(() => {
    console.log('\n🎯 Test completed!');
    console.log('If the test failed, check:');
    console.log('1. Server is running on port 8080');
    console.log('2. Admin token is valid');
    console.log('3. Customer ID exists in database');
    console.log('4. Database connection is working');
  })
  .catch(error => {
    console.error('💥 Test runner error:', error.message);
  });



