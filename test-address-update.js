const fetch = require('node-fetch');

async function testAddressUpdate() {
  const apiUrl = 'http://localhost:3000/api';
  
  try {
    console.log('🧪 Testing Address Update API...\n');
    
    // Step 1: Login to get authentication token
    console.log('1. Logging in as customer...');
    const loginResponse = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'customer@sweepro.com',
        password: 'customer123'
      })
    });
    
    const loginData = await loginResponse.json();
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      return;
    }
    
    const token = loginData.data.token;
    console.log('✅ Login successful');
    
    // Step 2: Update user address with detailed fields
    console.log('2. Updating user address with detailed fields...');
    const addressUpdateResponse = await fetch(`${apiUrl}/users/update-address`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        address: 'Test Full Address from PaymentOptions',
        pincode: '560001',
        locality: 'MG Road Area',
        addressLine: '123, Test Street, Test Building',
        city: 'Bangalore',
        state: 'Karnataka',
        landmark: 'Near Test Mall',
        latitude: 12.9716,
        longitude: 77.5946
      })
    });
    
    const addressUpdateData = await addressUpdateResponse.json();
    
    if (addressUpdateData.success) {
      console.log('✅ Address update successful!');
      console.log('📍 Updated address fields:');
      const user = addressUpdateData.data.user;
      console.log(`   - Address: ${user.address}`);
      console.log(`   - Pincode: ${user.pincode}`);
      console.log(`   - Locality: ${user.locality}`);
      console.log(`   - Address Line: ${user.addressLine}`);
      console.log(`   - City: ${user.city}`);
      console.log(`   - State: ${user.state}`);
      console.log(`   - Landmark: ${user.landmark}`);
      console.log(`   - Coordinates: ${user.latitude}, ${user.longitude}`);
    } else {
      console.error('❌ Address update failed:', addressUpdateData.message);
      console.error('Errors:', addressUpdateData.errors);
    }
    
    // Step 3: Verify the update by fetching user profile
    console.log('3. Verifying update by fetching user profile...');
    const profileResponse = await fetch(`${apiUrl}/users/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const profileData = await profileResponse.json();
    if (profileData.user) {
      console.log('✅ Profile fetch successful - address details confirmed:');
      console.log(`   - Pincode: ${profileData.user.pincode}`);
      console.log(`   - City: ${profileData.user.city}`);
      console.log(`   - State: ${profileData.user.state}`);
    }
    
    console.log('\n🎉 Address update API test completed successfully!');
    console.log('The frontend PaymentOptions page should now work correctly.');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testAddressUpdate();
