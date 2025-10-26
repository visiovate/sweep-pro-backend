#!/usr/bin/env node

/**
 * Simple test to check server connectivity and port
 */

const axios = require('axios');

async function testServerConnectivity() {
  console.log('🔍 Testing Server Connectivity');
  console.log('='.repeat(40));
  
  const ports = [3000, 8080, 5000, 8000];
  const endpoints = [
    '/health',
    '/api/cors-test',
    '/api/admin/customer-assignments/my-status'
  ];
  
  for (const port of ports) {
    console.log(`\n🔌 Testing port ${port}:`);
    
    for (const endpoint of endpoints) {
      const url = `http://localhost:${port}${endpoint}`;
      
      try {
        const response = await axios.get(url, { timeout: 2000 });
        console.log(`  ✅ ${endpoint} - Status: ${response.status}`);
        
        if (endpoint === '/health') {
          console.log(`  📊 Server is running on port ${port}`);
          console.log(`  🎯 Use this port for API calls: http://localhost:${port}/api/...`);
        }
        
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.log(`  ❌ ${endpoint} - Connection refused`);
        } else if (error.code === 'ECONNRESET') {
          console.log(`  ❌ ${endpoint} - Connection reset`);
        } else {
          console.log(`  ❌ ${endpoint} - ${error.message}`);
        }
      }
    }
  }
  
  console.log('\n💡 Recommendations:');
  console.log('1. If server is running on port 3000, update your test scripts to use port 3000');
  console.log('2. If server is running on port 8080, check server logs for errors');
  console.log('3. Make sure the server is actually running: npm start');
}

testServerConnectivity()
  .catch(error => {
    console.error('💥 Test error:', error.message);
  });


