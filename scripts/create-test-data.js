const axios = require('axios');

const BASE_URL = 'http://localhost:9090';

async function createTestData() {
  try {
    console.log('Creating test raffle data...\n');

    // Call the test data creation endpoint
    const response = await axios.post(`${BASE_URL}/raffle/create-test-data`);
    
    console.log('✅ Test data created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    console.log('\nNow testing the endpoints...\n');

    // Test current raffle endpoint
    try {
      const currentResponse = await axios.get(`${BASE_URL}/raffle/current`);
      console.log('✅ GET /raffle/current works');
      console.log('Current raffles:', currentResponse.data.currentRaffles?.length || 0);
    } catch (error) {
      console.log('❌ GET /raffle/current failed:', error.response?.status, error.response?.data?.error || error.message);
    }

    // Test history endpoint
    try {
      const historyResponse = await axios.get(`${BASE_URL}/raffle/history?page=1&limit=5`);
      console.log('✅ GET /raffle/history works');
      console.log('History raffles:', historyResponse.data.raffleHistory?.length || 0);
    } catch (error) {
      console.log('❌ GET /raffle/history failed:', error.response?.status, error.response?.data?.error || error.message);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Backend server is not running on port 9090');
      console.log('Please start the backend with: npm run dev');
    } else {
      console.log('❌ Error creating test data:', error.response?.status, error.response?.data || error.message);
    }
  }
}

createTestData();