/**
 * Stable local frontend: serve pre-built dist via vite preview (avoids Vite dev hang on Windows).
 * Rebuild with: npm run build
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const distIndex = path.join(ROOT, 'dist', 'index.html');
const srcRoot = path.join(ROOT, 'src');

function newestMtimeInDir(dir) {
    let max = 0;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            max = Math.max(max, newestMtimeInDir(p));
        } else {
            max = Math.max(max, fs.statSync(p).mtimeMs);
        }
    }
    return max;
}

function distNeedsRebuild() {
    if (!fs.existsSync(distIndex)) return true;
    try {
        const distMtime = fs.statSync(distIndex).mtimeMs;
        const srcMtime = newestMtimeInDir(srcRoot);
        return srcMtime > distMtime;
    } catch {
        return true;
    }
}

execSync('node scripts/dev-preflight.cjs --ports 4000', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
});

if (distNeedsRebuild()) {
    console.log('\nBuilding frontend (dist/ missing or out of date — one-time, ~3 min)...\n');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit', shell: true });
} else {
    console.log('\nServing dist/ via vite preview. Run "npm run build" after code changes.\n');
}

execSync('npx vite preview --port 4000 --host 127.0.0.1 --strictPort', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
});
