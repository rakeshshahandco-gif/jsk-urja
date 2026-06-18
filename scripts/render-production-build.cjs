/**
 * Production build for Render static sites.
 * When NODE_ENV=production, npm install skips devDependencies (vite, sass, etc.)
 * and npm run build fails. This script reinstalls dev deps on Render, then builds.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

function run(cmd, opts = {}) {
    execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

if (isRender) {
    run('npm install --include=dev', {
        env: { ...process.env, NODE_ENV: 'development' },
    });
    const fix = path.join(root, 'backend/scripts/fixUtf16Encoding.mjs');
    if (fs.existsSync(fix)) {
        try {
            run(`node "${fix}"`);
        } catch {
            // non-fatal
        }
    }
}

run('node --max-old-space-size=4096 node_modules/vite/bin/vite.js build');