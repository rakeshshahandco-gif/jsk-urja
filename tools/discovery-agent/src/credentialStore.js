import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { agentDataDir } from './installId.js';

const CRED_FILE = 'credentials.dpapi';

function credPath() {
    return path.join(agentDataDir(), CRED_FILE);
}

function legacyCredPath() {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'JSK URJA', 'Discovery Agent', CRED_FILE);
}

function protectWindows(plain) {
    const inputFile = path.join(os.tmpdir(), `jsk-da-plain-${process.pid}.txt`);
    const outFile = path.join(os.tmpdir(), `jsk-da-prot-${process.pid}.txt`);
    fs.writeFileSync(inputFile, Buffer.from(String(plain), 'utf8').toString('base64'), 'utf8');
    const script = [
        'Add-Type -AssemblyName System.Security',
        `$raw = [Convert]::FromBase64String((Get-Content -Raw -Path '${inputFile.replace(/'/g, "''")}'))`,
        '$prot = [System.Security.Cryptography.ProtectedData]::Protect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
        `[IO.File]::WriteAllText('${outFile.replace(/'/g, "''")}', [Convert]::ToBase64String($prot))`,
    ].join('; ');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
    try { fs.unlinkSync(inputFile); } catch { /* ignore */ }
    if (r.status !== 0) {
        try { fs.unlinkSync(outFile); } catch { /* ignore */ }
        throw new Error('Windows credential protect failed');
    }
    const out = fs.readFileSync(outFile, 'utf8').trim();
    try { fs.unlinkSync(outFile); } catch { /* ignore */ }
    return out;
}

function unprotectWindows(blob) {
    const inputFile = path.join(os.tmpdir(), `jsk-da-in-${process.pid}.txt`);
    const outFile = path.join(os.tmpdir(), `jsk-da-out-${process.pid}.txt`);
    fs.writeFileSync(inputFile, String(blob || '').trim(), 'utf8');
    const script = [
        'Add-Type -AssemblyName System.Security',
        `$prot = [Convert]::FromBase64String((Get-Content -Raw -Path '${inputFile.replace(/'/g, "''")}'))`,
        '$raw = [System.Security.Cryptography.ProtectedData]::Unprotect($prot, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
        `[IO.File]::WriteAllText('${outFile.replace(/'/g, "''")}', [Convert]::ToBase64String($raw))`,
    ].join('; ');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
    try { fs.unlinkSync(inputFile); } catch { /* ignore */ }
    if (r.status !== 0) {
        try { fs.unlinkSync(outFile); } catch { /* ignore */ }
        throw new Error('Windows credential unprotect failed');
    }
    const out = fs.readFileSync(outFile, 'utf8').trim();
    try { fs.unlinkSync(outFile); } catch { /* ignore */ }
    return Buffer.from(out, 'base64').toString('utf8');
}

export function hasStoredCredentials() {
    try {
        return fs.existsSync(credPath()) || fs.existsSync(legacyCredPath());
    } catch {
        return false;
    }
}

export function readCredentials() {
    if (!hasStoredCredentials()) return null;
    const file = fs.existsSync(credPath()) ? credPath() : legacyCredPath();
    const blob = fs.readFileSync(file, 'utf8');
    const json = process.platform === 'win32'
        ? unprotectWindows(blob)
        : Buffer.from(blob, 'base64').toString('utf8');
    const data = JSON.parse(json);
    if (!data?.token) return null;
    return data;
}

export function writeCredentials(data) {
    const payload = JSON.stringify({
        token: data.token,
        crmBaseUrl: data.crmBaseUrl || '',
        deviceId: data.deviceId || '',
        deviceName: data.deviceName || '',
        installId: data.installId || '',
        pairedAt: new Date().toISOString(),
    });
    const stored = process.platform === 'win32'
        ? protectWindows(payload)
        : Buffer.from(payload, 'utf8').toString('base64');
    fs.writeFileSync(credPath(), stored, { encoding: 'utf8', mode: 0o600 });
}

export function clearCredentials() {
    try {
        if (fs.existsSync(credPath())) fs.unlinkSync(credPath());
    } catch {
        /* ignore */
    }
}

export function applyCredentialsToEnv() {
    const data = readCredentials();
    if (!data) return null;
    if (data.token && !process.env.DISCOVERY_AGENT_TOKEN) process.env.DISCOVERY_AGENT_TOKEN = data.token;
    if (data.crmBaseUrl && !process.env.CRM_BASE_URL) process.env.CRM_BASE_URL = data.crmBaseUrl;
    if (data.deviceId && !process.env.DISCOVERY_AGENT_DEVICE_ID) process.env.DISCOVERY_AGENT_DEVICE_ID = data.deviceId;
    if (data.deviceName && !process.env.DISCOVERY_AGENT_DEVICE_NAME) process.env.DISCOVERY_AGENT_DEVICE_NAME = data.deviceName;
    if (data.installId && !process.env.DISCOVERY_AGENT_INSTALL_ID) process.env.DISCOVERY_AGENT_INSTALL_ID = data.installId;
    return data;
}
