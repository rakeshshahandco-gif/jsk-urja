import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** backend/tools/regression/lib → repo root */
export function repoRoot() {
    return path.resolve(__dirname, '../../../..');
}

/** backend/tools/regression/lib → backend */
export function backendRoot() {
    return path.resolve(__dirname, '../../..');
}

/** backend/tools/regression */
export function regressionRoot() {
    return path.resolve(__dirname, '..');
}

export function loadEnvFile(filePath, into = {}) {
    if (!fs.existsSync(filePath)) return into;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        into[m[1]] = v;
    }
    return into;
}

export function extractDbName(mongoUrl = '') {
    try {
        const normalized = String(mongoUrl || '')
            .replace(/^mongodb\+srv:\/\//i, 'https://')
            .replace(/^mongodb:\/\//i, 'http://');
        const parsed = new URL(normalized);
        return decodeURIComponent((parsed.pathname || '/').replace(/^\//, '').split('/')[0] || '') || '';
    } catch {
        return '';
    }
}

export function loadProductMongoUrl(productKey) {
    const root = repoRoot();
    if (productKey === 'handloom') {
        const env = {};
        loadEnvFile(path.join(root, 'backend/.env'), env);
        loadEnvFile(path.join(root, 'backend/.env.local'), env);
        return env.MONGODB_URL || env.MONGO_URI || env.MONGODB_URI || '';
    }
    if (productKey === 'jsk') {
        const jskBackend = path.resolve(root, '../JSK-E-SARTHI-MASTER-jsk-deploy/backend');
        const env = {};
        loadEnvFile(path.join(jskBackend, '.env'), env);
        loadEnvFile(path.join(jskBackend, '.env.local'), env);
        return env.MONGODB_URL || env.MONGO_URI || env.MONGODB_URI || '';
    }
    return '';
}

export function credentialFor(product) {
    const user = process.env[product.defaultUserEnv]
        || process.env.REGRESSION_USER
        || product.defaultUsername;
    const pass = process.env[product.defaultPassEnv]
        || process.env.REGRESSION_PASS
        || process.env.HANDLOOM_LOCAL_PASS
        || process.env.JSK_LOCAL_PASS
        || '';
    return { username: user, password: pass };
}
