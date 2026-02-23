import axios from 'axios';

const checkVersion = async () => {
    try {
        console.log('Hitting http://localhost:3000/api/v1/health...');
        const res = await axios.get('http://localhost:3000/api/v1/health');
        console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error hitting health endpoint:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', e.response.data);
        }
    }
};

checkVersion();
