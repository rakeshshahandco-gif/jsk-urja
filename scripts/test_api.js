import axios from 'axios';

const test = async () => {
    try {
        const res = await axios.get('http://localhost:5000/api/v1/health');
        console.log('Health Check:', res.data);
    } catch (err) {
        console.error('Health Check Failed:', err.message);
    }

    try {
        const res = await axios.get('http://localhost:5000/api/v1/items');
        console.log('Items List:', res.data.success ? 'Success' : 'Failed');
    } catch (err) {
        console.error('Items List Failed:', err.response?.status, err.response?.data?.message || err.message);
    }
};

test();
