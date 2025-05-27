const axios = require('axios');

const BASE_URL = 'http://localhost:9090';

async function testRaffleEndpoints() {
  try {
    console.log('Testing raffle endpoints...\n');

    // Test GET /raffle/current
    console.log('1. Testing GET /raffle/current');
    try {
      const currentResponse = await axios.get(`${BASE_URL}/raffle/current`);
      console.log('✅ Current raffle endpoint working');
      console.log('Response:', JSON.stringify(currentResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Current raffle endpoint failed:', error.response?.status, error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test GET /raffle/history
    console.log('2. Testing GET /raffle/history');
    try {
      const historyResponse = await axios.get(`${BASE_URL}/raffle/history?page=1&limit=10`);
      console.log('✅ Raffle history endpoint working');
      console.log('Response:', JSON.stringify(historyResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Raffle history endpoint failed:', error.response?.status, error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test base backend connection
    console.log('3. Testing base backend connection');
    try {
      const baseResponse = await axios.get(`${BASE_URL}/`);
      console.log('✅ Backend base endpoint working');
      console.log('Response:', baseResponse.data);
    } catch (error) {
      console.log('❌ Backend base endpoint failed:', error.response?.status, error.response?.data || error.message);
    }

  } catch (error) {
    console.error('Error testing endpoints:', error.message);
  }
}

// Run the test
testRaffleEndpoints();