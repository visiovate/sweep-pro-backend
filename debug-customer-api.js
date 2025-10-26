#!/usr/bin/env node

/**
 * Debug script for customer status API with detailed error reporting
 */

const axios = require('axios');

const CUSTOMER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMTc4MDllNS0yYTAwLTQwMDMtOTI2Ny02ZWFkODViZWRjMTUiLCJpZCI6ImYxNzgwOWU1LTJhMDAtNDAwMy05MjY3LTZlYWQ4NWJlZGMxNSIsInJvbGUiOiJDVVNUT01FUiIsImlhdCI6MTc2MTI5OTA4NywiZXhwIjoxNzYxMzg1NDg3fQ.RF08X3PBSqAl-hXiNZlQvy5QAWUwaozUeGzZ4bb1sSQ';

async function debugCustomerStatusAPI() {
  console.log('🐛 Debug Customer Status API');
  console.log('='.repeat(50));
  
  // Test different ports
  const ports = [3000, 8080];
  const endpoint = '/api/admin/customer-assignments/my-status';
  
  for (const port of ports) {
    console.log(`\n🔌 Testing port ${port}:`);
    const url = `http://localhost:${port}${endpoint}`;
    
    const config = {
      headers: {
        'Authorization': `Bearer ${CUSTOMER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };
    
    try {
      console.log(`📡 GET ${url}`);
      console.log(`🔑 Token: ${CUSTOMER_TOKEN.substring(0, 50)}...`);
      
      const response = await axios.get(url, config);
      
      console.log('✅ SUCCESS!');
      console.log(`Status: ${response.status}`);
      console.log(`Headers:`, response.headers);
      console.log(`Data:`, JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      console.log('❌ FAILED!');
      
      if (error.response) {
        console.log(`HTTP Status: ${error.response.status}`);
        console.log(`Status Text: ${error.response.statusText}`);
        console.log(`Headers:`, error.response.headers);
        console.log(`Data:`, JSON.stringify(error.response.data, null, 2));
        
        // Check for specific error types
        if (error.response.status === 500) {
          console.log('\n🔍 500 Error Analysis:');
          console.log('- Server internal error');
          console.log('- Check server logs for detailed error messages');
          console.log('- Possible causes:');
          console.log('  * Database connection issues');
          console.log('  * Syntax errors in code');
          console.log('  * Missing environment variables');
          console.log('  * Prisma schema issues');
        } else if (error.response.status === 403) {
          console.log('\n🔍 403 Error Analysis:');
          console.log('- Access denied');
          console.log('- Token might be invalid or expired');
          console.log('- User role might not have permission');
        } else if (error.response.status === 404) {
          console.log('\n🔍 404 Error Analysis:');
          console.log('- Route not found');
          console.log('- Check if route is properly registered');
          console.log('- Verify server is running the latest code');
        }
        
      } else if (error.code === 'ECONNREFUSED') {
        console.log('❌ Connection Refused');
        console.log('- Server is not running on this port');
        console.log('- Check if server is started: npm start');
        
      } else if (error.code === 'ECONNRESET') {
        console.log('❌ Connection Reset');
        console.log('- Server crashed or closed connection');
        console.log('- Check server logs for crash details');
        
      } else if (error.code === 'ETIMEDOUT') {
        console.log('❌ Request Timeout');
        console.log('- Server is not responding');
        console.log('- Check if server is overloaded or stuck');
        
      } else {
        console.log(`❌ Network Error: ${error.message}`);
        console.log(`Code: ${error.code}`);
      }
    }
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Check server logs for detailed error messages');
  console.log('2. Verify database connection is working');
  console.log('3. Check if all environment variables are set');
  console.log('4. Restart the server after code changes');
  console.log('5. Test with a simple endpoint first (like /health)');
}

debugCustomerStatusAPI()
  .catch(error => {
    console.error('💥 Debug script error:', error.message);
  });


