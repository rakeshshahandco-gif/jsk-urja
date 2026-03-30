const http = require('http');
const https = require('https');

https.request('https://jsk-urja-backend.onrender.com/api/v1/auth/login', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://jsk-urja.onrender.com',
    'Access-Control-Request-Method': 'POST'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
}).on('error', (e) => {
  console.error(e);
}).end();
