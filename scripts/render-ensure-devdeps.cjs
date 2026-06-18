/**
 * Handloom / Render static site: ensure vite + sass devDependencies exist before build.
 * No-op on localhost. On Render, runs only when vite is missing (NODE_ENV=production install).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

if (!isRender) {
    process.exit(0);
}

if (fs.existsSync(viteBin)) {
    process.exit(0);
}

console.log('[render] Installing devDependencies (vite, sass, ...) for static site build...');
execSync('npm install --include=dev', {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development' },
});