/**
 * Start one backend + one frontend after preflight (Windows: separate CMD windows).
 */
const { execSync } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const BACKEND_PORT = Number(process.env.PORT) || 5000;
const FRONTEND_PORT = 4000;

function waitForHealth(maxMs) {
    const url = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`;
    const start = Date.now();
    return new Promise((resolve) => {
        const tick = () => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => {
                if (Date.now() - start > maxMs) resolve(false);
                else setTimeout(tick, 2000);
            });
            req.setTimeout(4000, () => {
                req.destroy();
                if (Date.now() - start > maxMs) resolve(false);
                else setTimeout(tick, 2000);
            });
        };
        tick();
    });
}

if (process.platform === 'win32') {
    execSync(
        `start "JSK Backend :${BACKEND_PORT}" cmd /k "cd /d "${BACKEND}" && npm run dev"`,
        { shell: true, stdio: 'inherit' },
    );
    console.log('Waiting for backend health...');
    waitForHealth(90000).then((ok) => {
        if (!ok) {
            console.error('Backend did not respond on /api/v1/health within 90s. Check backend window.');
            process.exit(1);
        }
        console.log('Backend health OK. Starting frontend (stable preview mode)...');
        execSync(
            `start "JSK Frontend :${FRONTEND_PORT}" cmd /k "cd /d "${ROOT}" && npm run dev:stable-frontend"`,
            { shell: true, stdio: 'inherit' },
        );
        console.log(`\nOpen http://localhost:${FRONTEND_PORT} in your browser.\n`);
    });
} else {
    console.log('Run in two terminals:');
    console.log(`  1) cd backend && npm run dev`);
    console.log(`  2) cd ${ROOT} && npm run dev`);
}
