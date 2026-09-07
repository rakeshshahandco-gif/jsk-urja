/**
 * Start production Discovery Agent using .env.production.local only.
 * Does not modify .env.local. Never prints token.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const envFile = path.join(root, '.env.production.local');
if (!fs.existsSync(envFile)) {
  console.error('MISSING .env.production.local');
  process.exit(1);
}

const env = { ...process.env };
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

if (!env.CRM_BASE_URL || !env.DISCOVERY_AGENT_TOKEN) {
  console.error('INCOMPLETE_PRODUCTION_ENV');
  process.exit(1);
}
if (/127\.0\.0\.1|localhost/i.test(env.CRM_BASE_URL)) {
  console.error('REFUSING_LOCALHOST_BASE_FOR_PRODUCTION_START');
  process.exit(1);
}

const mode = process.argv[2] || 'connect';
const child = spawn(process.execPath, ['src/index.js', mode], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let out = '';
let err = '';
child.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(d); });
child.stderr.on('data', (d) => { err += d.toString(); process.stderr.write(d); });

if (mode === 'listen') {
  // Keep running; parent stays alive
  child.on('exit', (code) => {
    console.log(JSON.stringify({ listenExited: true, code }));
    process.exit(code || 0);
  });
} else {
  child.on('exit', (code) => {
    // Redact any accidental token-looking strings from captured buffers before summary
    const redact = (s) => String(s || '').replace(/jskdisc_[a-f0-9]{20,}/gi, 'jskdisc_[REDACTED]');
    const summary = {
      exitCode: code,
      crmBaseUrl: env.CRM_BASE_URL,
      tokenPrefix: String(env.DISCOVERY_AGENT_TOKEN).slice(0, 12),
      stdout: redact(out).slice(-2000),
      stderr: redact(err).slice(-1000),
    };
    fs.writeFileSync(path.join(root, 'last-prod-connect-status.json'), JSON.stringify(summary, null, 2));
    process.exit(code || 0);
  });
}
