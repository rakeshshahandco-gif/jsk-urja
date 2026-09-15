import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

function candidateDirs() {
    const dirs = [];
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    dirs.push(path.join(local, 'JSK URJA', 'Extraction Agent'));
    dirs.push(path.join(local, 'JSK URJA', 'Discovery Agent'));
    const programData = process.env.PROGRAMDATA;
    if (programData) {
        dirs.push(path.join(programData, 'JSK URJA', 'Extraction Agent'));
        dirs.push(path.join(programData, 'JSK URJA', 'Discovery Agent'));
    }
    return dirs;
}

export function agentDataDir() {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const dir = path.join(local, 'JSK URJA', 'Extraction Agent');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function readOrCreateInstallId() {
    const existingEnv = String(process.env.DISCOVERY_AGENT_INSTALL_ID || '').trim();
    if (existingEnv) return existingEnv.slice(0, 80);

    for (const dir of candidateDirs()) {
        const file = path.join(dir, 'install-id');
        try {
            if (fs.existsSync(file)) {
                const id = String(fs.readFileSync(file, 'utf8') || '').trim();
                if (id) {
                    persistInstallId(id);
                    return id.slice(0, 80);
                }
            }
        } catch {
            /* try next */
        }
    }

    const id = 'inst-' + crypto.randomBytes(12).toString('hex');
    persistInstallId(id);
    return id;
}

function persistInstallId(id) {
    for (const dir of candidateDirs()) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'install-id'), id, { encoding: 'utf8' });
        } catch {
            /* ProgramData may need elevation; LocalAppData is enough */
        }
    }
}

export function localHostname() {
    return String(process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname() || '').trim().slice(0, 120);
}

export function agentVersion() {
    return String(process.env.DISCOVERY_AGENT_VERSION || process.env.JSK_EXTRACTION_AGENT_VERSION || '1.1.1').slice(0, 40);
}
