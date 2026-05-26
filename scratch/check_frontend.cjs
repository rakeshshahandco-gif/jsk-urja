const http = require('http');
function fetch(path) {
  return new Promise(resolve => {
    http.get('http://localhost:4000' + path, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, ct: r.headers['content-type'], size: d.length, body: d }));
    }).on('error', e => resolve({ err: e.code || e.message }));
  });
}
(async () => {
  const root = await fetch('/');
  console.log('/  Status:', root.status, '| Type:', root.ct, '| Size:', root.size);
  console.log('   Has React root?', root.body && root.body.includes('id="root"'));

  const admin = await fetch('/admin/users');
  console.log('/admin/users Status:', admin.status, '| Type:', admin.ct, '| Size:', admin.size);

  const userForm = await fetch('/src/features/users/components/AddUserForm.jsx');
  console.log('AddUserForm.jsx Status:', userForm.status);
  console.log('   Compiled (has React import)?', userForm.body && userForm.body.includes('react'));

  const scss = await fetch('/src/features/users/components/AddUserForm.module.scss');
  console.log('AddUserForm.module.scss Status:', scss.status);
})();
