/**
 * Approved RCM rules — FILE FALLBACK ONLY (localhost / fixtures / read-only).
 * Production authoritative store = MongoDB `RcmRule` collection.
 * Do NOT silently migrate or activate file rules into production.
 * When used as fallback, decision engine surfaces a visible ruleStoreWarning.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const FILE_RULE_STORE_WARNING =
    'Using file-store approved RCM rules as read-only fallback. MongoDB is the production durable store — approve rules in Mongo for production.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'rcm-approved-rules.json');

function readStore() {
    try {
        if (!fs.existsSync(STORE_PATH)) return { rules: [] };
        return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch {
        return { rules: [] };
    }
}

function writeStore(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function listApprovedRcmRulesFile({ companyId } = {}) {
    const store = readStore();
    return (store.rules || []).filter((r) => {
        if (r.status !== 'active') return false;
        if (!r.approvedBy || !r.approvedAt || !r.effectiveFrom || !r.statutoryReference) return false;
        if (companyId && r.companyId && String(r.companyId) !== String(companyId)) return false;
        return true;
    });
}

export function upsertApprovedRcmRuleFile(rule) {
    const store = readStore();
    const id = rule.id || rule._id || `file-${rule.ruleCode}-${Date.now()}`;
    const row = {
        ...rule,
        id: String(id),
        _id: String(id),
        status: 'active',
        source: 'file_store',
        updatedAt: new Date().toISOString(),
    };
    const idx = (store.rules || []).findIndex(
        (r) => r.ruleCode === row.ruleCode && String(r.companyId || '') === String(row.companyId || ''),
    );
    if (idx >= 0) store.rules[idx] = { ...store.rules[idx], ...row };
    else store.rules.push(row);
    writeStore(store);
    return row;
}

export function findApprovedRcmRuleFile({ ruleCode, companyId, id } = {}) {
    const rows = listApprovedRcmRulesFile({ companyId });
    if (id) return rows.find((r) => String(r.id || r._id) === String(id)) || null;
    if (ruleCode) return rows.find((r) => r.ruleCode === ruleCode) || null;
    return rows[0] || null;
}

export default {
    listApprovedRcmRulesFile,
    upsertApprovedRcmRuleFile,
    findApprovedRcmRuleFile,
};
