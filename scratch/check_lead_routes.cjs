const http = require('http');
function req(path, headers = {}) {
  return new Promise(resolve => {
    const opts = { hostname: 'localhost', port: 5000, path, method: 'GET', headers };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 200) }));
    });
    r.on('error', e => resolve({ err: e.code || e.message }));
    r.end();
  });
}
(async () => {
  for (const p of ['/api/v1/leads', '/api/v1/product-catalog', '/api/v1/leads/from-whatsapp']) {
    const r = await req(p);
    console.log(p, '->', r.status || r.err, '|', r.body);
  }
})();
