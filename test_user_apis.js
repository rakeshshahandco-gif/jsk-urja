import axios from 'axios';

const token = 'YOUR_AUTH_TOKEN_HERE'; // I'll need a token, but let's see if 404 happens even without it (usually 404 is before auth)

async function test() {
    const urls = [
        'http://localhost:5000/api/v1/users/permissions/metadata',
        'http://localhost:5000/api/v1/users/roles',
        'http://localhost:5000/api/v1/users/departments'
    ];

    for (const url of urls) {
        try {
            console.log(`Testing ${url}...`);
            const res = await axios.get(url);
            console.log(`- Success: ${res.status}`);
        } catch (err) {
            console.log(`- Error: ${err.response?.status} - ${err.response?.data?.message || err.message}`);
        }
    }
}

test();
