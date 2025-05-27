const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:9090'; // Backend runs on port 9090
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'password123';

async function testRaffleAPI() {
  try {
    console.log('🔍 Testing Raffle API Endpoints\n');

    // Step 1: Create test raffle data
    console.log('1. Creating test raffle data...');
    try {
      const createTestResponse = await axios.post(`${BASE_URL}/raffle/create-test-data`);
      console.log('✅ Test data created:', createTestResponse.data);
    } catch (error) {
      console.log('⚠️  Test data creation failed (might already exist):', error.response?.data?.error);
    }

    // Step 2: Get current raffle (unauthenticated)
    console.log('\n2. Getting current raffle (unauthenticated)...');
    const unauthResponse = await axios.get(`${BASE_URL}/raffle/current`);
    console.log('📊 Unauthenticated response:');
    console.log(JSON.stringify(unauthResponse.data, null, 2));

    // Step 3: Authenticate user
    console.log('\n3. Authenticating user...');
    let authToken = null;
    try {
      const authResponse = await axios.post(`${BASE_URL}/auth/signin`, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      });
      authToken = authResponse.data.token;
      console.log('✅ Authentication successful');
    } catch (error) {
      console.log('❌ Authentication failed:', error.response?.data);
      
      // Try to create user if signin failed
      console.log('   Attempting to create test user...');
      try {
        const signupResponse = await axios.post(`${BASE_URL}/auth/signup`, {
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          first_name: 'Test',
          last_name: 'User'
        });
        authToken = signupResponse.data.token;
        console.log('✅ Test user created and authenticated');
      } catch (signupError) {
        console.log('❌ User creation failed:', signupError.response?.data);
        return;
      }
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // Step 4: Get current raffle (authenticated)
    console.log('\n4. Getting current raffle (authenticated)...');
    const authResponse = await axios.get(`${BASE_URL}/raffle/current`, { headers });
    console.log('📊 Authenticated response:');
    console.log(JSON.stringify(authResponse.data, null, 2));

    const currentRaffles = authResponse.data.currentRaffles;
    if (currentRaffles.length === 0) {
      console.log('❌ No current raffles found');
      return;
    }

    const drawId = currentRaffles[0].id;
    console.log(`🎯 Using raffle draw ID: ${drawId}`);

    // Step 5: Check user's current balance
    console.log('\n5. Checking user balance...');
    try {
      const profileResponse = await axios.get(`${BASE_URL}/auth/profile`, { headers });
      console.log('💰 User balance:', profileResponse.data.account);
      
      // If balance is 0, add some balance for testing
      if (profileResponse.data.account === 0) {
        console.log('   Adding test balance...');
        // This would require an admin endpoint or direct database update
        console.log('⚠️  User has 0 balance - opt-in will fail');
      }
    } catch (error) {
      console.log('❌ Failed to get user profile:', error.response?.data);
    }

    // Step 6: Opt into raffle
    console.log('\n6. Opting into raffle...');
    try {
      const optInResponse = await axios.post(`${BASE_URL}/raffle/opt-in`, 
        { drawId }, 
        { headers }
      );
      console.log('✅ Opt-in successful:');
      console.log(JSON.stringify(optInResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Opt-in failed:');
      console.log('Status:', error.response?.status);
      console.log('Error:', error.response?.data);
      
      if (error.response?.data?.error === 'Already registered for this raffle') {
        console.log('ℹ️  User already registered, continuing with tests...');
      } else if (error.response?.data?.error === 'Insufficient coin balance to participate') {
        console.log('⚠️  User needs coin balance to participate');
        return;
      }
    }

    // Step 7: Get current raffle again to see updated userTickets
    console.log('\n7. Getting current raffle after opt-in...');
    const afterOptInResponse = await axios.get(`${BASE_URL}/raffle/current`, { headers });
    console.log('📊 Response after opt-in:');
    console.log(JSON.stringify(afterOptInResponse.data, null, 2));

    // Step 8: Check raffle history
    console.log('\n8. Getting raffle history...');
    const historyResponse = await axios.get(`${BASE_URL}/raffle/history`, { headers });
    console.log('📚 Raffle history:');
    console.log(JSON.stringify(historyResponse.data, null, 2));

    // Step 9: Analyze the userTickets issue
    console.log('\n9. Analysis of userTickets field:');
    const afterOptIn = afterOptInResponse.data.currentRaffles[0];
    console.log(`Total tickets: ${afterOptIn.totalTickets}`);
    console.log(`User tickets: ${afterOptIn.userTickets}`);
    console.log(`Total participants: ${afterOptIn.totalParticipants}`);
    
    if (afterOptIn.totalTickets > 0 && afterOptIn.userTickets === 0) {
      console.log('🐛 BUG DETECTED: userTickets is 0 despite having totalTickets > 0');
      console.log('   This suggests an issue with user authentication or ticket lookup');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testRaffleAPI();