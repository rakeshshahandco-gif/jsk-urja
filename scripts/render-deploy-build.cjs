/**
 * Render build: use committed dist/ when present (skip vite rebuild).
 * Rebuilding on Render was leaving the service on an old frontend bundle.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const indexHtml = path.join(root, 'dist', 'index.html');
const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
/** Staging must rebuild UI so committed production dist cannot be reused. */
const forceStagingRebuild =
    String(process.env.APP_ENV || '').trim().toLowerCase() === 'staging' ||
    String(process.env.VITE_APP_ENV || '').trim().toLowerCase() === 'staging' ||
    String(process.env.APPLICATION_KEY || '').trim() === 'jsk-urja-staging';

function committedDistReady() {
    if (!fs.existsSync(indexHtml)) return false;
    const html = fs.readFileSync(indexHtml, 'utf8');
    const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!match) return false;
    const jsPath = path.join(root, 'dist', 'assets', path.basename(match[1]));
    return fs.existsSync(jsPath);
}

if (isRender && committedDistReady() && !forceStagingRebuild) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    console.log(`[render] Using committed dist from git (${match[1]}); skipping vite build.`);
    process.exit(0);
}
if (isRender && forceStagingRebuild) {
    console.log('[render] Staging lane: forcing vite rebuild (will not reuse production dist).');
}

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
    console.log('[render] Installing devDependencies for vite build...');
    execSync('npm install --include=dev', {
        stdio: 'inherit',
        cwd: root,
        env: { ...process.env, NODE_ENV: 'development' },
    });
}

console.log('[render] Running vite build...');
execSync('npm run build', { stdio: 'inherit', cwd: root });
