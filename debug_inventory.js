
import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/v1';

async function test() {
    try {
        console.log('--- Testing Item Types ---');
        const typesRes = await axios.get(`${BASE_URL}/item-types`);
        console.log('Status:', typesRes.status);
        console.log('Data:', JSON.stringify(typesRes.data, null, 2));

        console.log('\n--- Testing Items ---');
        const itemsRes = await axios.get(`${BASE_URL}/items`);
        console.log('Status:', itemsRes.status);
        console.log('Data summary:', itemsRes.data.data?.length, 'items found');

    } catch (error) {
        console.error('Error:', error.response?.status, error.response?.data || error.message);
    }
}

test();
