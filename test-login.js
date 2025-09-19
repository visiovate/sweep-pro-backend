const fetch = require('node-fetch');

async function testLogin() {
  try {
    console.log('Testing admin login...');
    
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@sweepro.com',
        password: 'admin123'
      })
    });
    
    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.status === 200 && data.success) {
      console.log('✅ Login successful!');
      console.log('Token received:', data.data.token ? 'Yes' : 'No');
      console.log('User role:', data.data.user?.role);
    } else {
      console.log('❌ Login failed!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogin();
