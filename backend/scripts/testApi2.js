import axios from 'axios';

const test = async () => {
    try {
        let loginRes;
        try {
            loginRes = await axios.post('http://localhost:5000/api/v1/auth/login', {
                email: 'admin@jskurja.com',
                password: 'password123'
            });
        } catch (e) {
            loginRes = await axios.post('http://localhost:5000/api/v1/auth/login', {
                email: 'admin@jskurja.com',
                password: 'admin'
            });
        }

        const token = loginRes.data.data.accessToken;
        const headers = { Authorization: 'Bearer ' + token };

        try {
            await axios.get('http://localhost:5000/api/v1/suppliers?limit=200', { headers });
            console.log('Suppliers: OK');
        } catch (e) {
            console.log('Suppliers Error:', e.response?.data || e.message);
        }

        try {
            await axios.get('http://localhost:5000/api/v1/items?limit=5000&sortBy=itemName:asc', { headers });
            console.log('Items: OK');
        } catch (e) {
            console.log('Items Error:', e.response?.data || e.message);
        }

        try {
            await axios.get('http://localhost:5000/api/v1/customers?limit=1000', { headers });
            console.log('Customers: OK');
        } catch (e) {
            console.log('Customers Error:', e.response?.data || e.message);
        }

    } catch (e) {
        console.log('Login failed', e.message);
    }
    process.exit(0);
};

test();
