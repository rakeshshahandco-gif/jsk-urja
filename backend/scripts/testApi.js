import axios from 'axios';

const test = async () => {
    try {
        const res = await axios.post('http://localhost:5000/api/v1/auth/login', {
            email: 'admin@jskurja.com',
            password: 'password123'
        });
        const token = res.data.data.accessToken;
        console.log('Logged in successfully');

        const headers = { Authorization: `Bearer ${token}` };

        console.log('Fetching suppliers...');
        try {
            await axios.get('http://localhost:5000/api/v1/suppliers?limit=200', { headers });
            console.log('Suppliers fetched OK');
        } catch (e) {
            console.error('Suppliers failed:', e.response?.data || e.message);
        }

        console.log('Fetching items...');
        try {
            await axios.get('http://localhost:5000/api/v1/items?limit=5000&sortBy=itemName:asc', { headers });
            console.log('Items fetched OK');
        } catch (e) {
            console.error('Items failed:', e.response?.data || e.message);
        }

        console.log('Fetching customers...');
        try {
            await axios.get('http://localhost:5000/api/v1/customers?limit=1000', { headers });
            console.log('Customers fetched OK');
        } catch (e) {
            console.error('Customers failed:', e.response?.data || e.message);
        }

    } catch (err) {
        console.error('Failed to login:', err.response?.data || err.message);
    }
};

test();
