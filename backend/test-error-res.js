import axios from 'axios';

const testError = async () => {
    try {
        // Try to create 'admin' again (which exists)
        console.log('Attempting to create duplicate user "admin"...');
        const response = await axios.post('http://localhost:3000/api/v1/users', {
            name: "Duplicate Admin",
            username: "admin",
            password: "password123"
        }, {
            headers: {
                // We need a token, but let's see what happens without one - it should be 401
                // Actually, let's use the error handler for ANY error.
            }
        });
        console.log('Response:', response.data);
    } catch (error) {
        console.log('Status Code:', error.response?.status);
        console.log('Response Data:', JSON.stringify(error.response?.data, null, 2));
        console.log('Error Message:', error.message);
    }
};

testError();
