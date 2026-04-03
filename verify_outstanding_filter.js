import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1';

async function testFilter() {
    try {
        console.log('--- Testing Outstanding Only ---');
        const res1 = await axios.get(`${API_URL}/ledgers/outstanding-summary?type=Receivable&showAll=false`);
        console.log('Outstanding Only Count:', res1.data.data.length);
        
        console.log('\n--- Testing Show All ---');
        const res2 = await axios.get(`${API_URL}/ledgers/outstanding-summary?type=Receivable&showAll=true`);
        console.log('Show All Count:', res2.data.data.length);
        
        if (res2.data.data.length >= res1.data.data.length) {
            console.log('\n✅ Verification Successful: All ledgers count is >= outstanding only count.');
        } else {
            console.log('\n❌ Verification Failed: All ledgers count is less than outstanding only count.');
        }
    } catch (error) {
        console.error('Error during verification:', error.message);
    }
}

testFilter();
