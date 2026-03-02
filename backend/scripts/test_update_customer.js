import http from 'http';

const req = http.request('http://localhost:5000/api/v1/customers', {
    method: 'GET'
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.data && parsed.data.results && parsed.data.results.length > 0) {
            const customerId = parsed.data.results[0]._id;
            console.log('Found customer ID:', customerId);

            // Now update it
            const updateReq = http.request(`http://localhost:5000/api/v1/customers/${customerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            }, (updateRes) => {
                let updateData = '';
                updateRes.on('data', chunk => updateData += chunk);
                updateRes.on('end', () => {
                    console.log('Update Status:', updateRes.statusCode);
                    console.log('Update Response:', updateData);
                });
            });
            updateReq.write(JSON.stringify(parsed.data.results[0]));
            updateReq.end();
        } else {
            console.log('No customers found');
        }
    });
});
req.end();
