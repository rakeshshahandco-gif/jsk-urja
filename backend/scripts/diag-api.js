import http from 'http';

const testEndpoint = (method, path) => {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`[TEST] ${method} ${path} -> Status: ${res.statusCode}`);
                console.log(`[TEST] Response: ${data}`);
                resolve({ status: res.statusCode, body: data });
            });
        });

        req.on('error', (e) => {
            console.error(`[TEST] Error: ${e.message}`);
            resolve({ error: e.message });
        });

        if (method === 'POST') {
            req.write(JSON.stringify({ title: 'Test Task' }));
        }
        req.end();
    });
};

async function runTests() {
    console.log('--- Starting API Diagnostics ---');
    await testEndpoint('GET', '/api/v1/health');
    await testEndpoint('GET', '/api/v1/users');
    await testEndpoint('GET', '/api/v1/test-tasks');
    await testEndpoint('GET', '/api/v1/tasks');
    await testEndpoint('POST', '/api/v1/tasks');
    console.log('--- Diagnostics Finished ---');
}

runTests();
