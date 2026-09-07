/**
 * Start the existing Discovery Agent in listen mode.
 * Does not start the CRM backend. Never prints the agent token.
 *
 * Localhost: npm run discovery-agent
 * Render worker (recommended, separate Background Worker):
 *   cd tools/discovery-agent && npm ci && npx playwright install chromium && npm run start:worker
 *   Env: CRM_BASE_URL, DISCOVERY_AGENT_TOKEN, DISCOVERY_AGENT_HEADLESS=true
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_DIR = path.join(ROOT, 'tools', 'discovery-agent');
const ENV_FILE = path.join(AGENT_DIR, '.env.local');
const INDEX_JS = path.join(AGENT_DIR, 'src', 'index.js');

function readEnvFile(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) return env;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
}

if (!fs.existsSync(INDEX_JS)) {
    console.error('Discovery agent entry missing: tools/discovery-agent/src/index.js');
    process.exit(1);
}

const fileEnv = readEnvFile(ENV_FILE);
const env = { ...process.env, ...fileEnv };
if (!String(env.DISCOVERY_AGENT_TOKEN || '').trim()) {
    console.error('DISCOVERY_AGENT_TOKEN missing. Create a token in CRM Data Extractor → Discovery Agent, then set tools/discovery-agent/.env.local');
    process.exit(1);
}
if (!String(env.CRM_BASE_URL || '').trim()) {
    env.CRM_BASE_URL = 'http://127.0.0.1:5100/api/v1';
}

console.log('Starting Discovery Agent listen mode');
console.log('CRM_BASE_URL=', env.CRM_BASE_URL);
console.log('HEADLESS=', String(env.DISCOVERY_AGENT_HEADLESS || 'false'));

const child = spawn(process.execPath, [INDEX_JS, 'listen'], {
    cwd: AGENT_DIR,
    env,
    stdio: 'inherit',
});

const stop = () => {
    if (child.exitCode == null) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

child.on('exit', (code) => {
    process.exit(code || 0);
});
