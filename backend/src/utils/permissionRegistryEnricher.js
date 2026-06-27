/**
 * Merges the static PERMISSION_REGISTRY with every permission module declared in
 * MODULE_REGISTRY so new modules appear in User Management without a manual registry edit.
 */
import { PERMISSION_REGISTRY, STANDARD_ACTIONS } from '../config/permissionRegistry.js';
import {
    MODULE_REGISTRY,
    collectPermissionModuleIds,
    filterPermissionRegistryModules,
} from '../constants/moduleRegistry.constants.js';

const PERMISSION_MODULE_LABEL_OVERRIDES = {
    wechat: 'China Sourcing / WeChat',
    rd_samples: 'R&D Samples',
    prd: 'R&D / PRD',
    accounts: 'Accounts / Vouchers',
    accounts_reports: 'Accounts Reports',
    voucher_entry: 'Voucher Entry',
    account_master: 'Account Master',
    messenger: 'Messenger',
    data_extractor: 'Data Extractor / Market Finder',
    china_sourcing: 'China Sourcing / WeChat',
};

function formatTitleFromId(id) {
    return String(id)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function buildPermissionModuleLabels() {
    const labels = { ...PERMISSION_MODULE_LABEL_OVERRIDES };
    for (const mod of MODULE_REGISTRY) {
        for (const pm of mod.permissionModules || []) {
            if (!labels[pm]) labels[pm] = mod.label;
        }
        if (!labels[mod.code]) labels[mod.code] = mod.label;
    }
    return labels;
}

function createModuleStub(id, name) {
    return {
        id,
        name: name || formatTitleFromId(id),
        submodules: [
            {
                id: 'module_access',
                name: 'Module Access',
                actions: STANDARD_ACTIONS.map((a) => ({ ...a })),
            },
        ],
    };
}

/**
 * Full registry for API metadata, role sync, and permission checks metadata.
 * Static registry entries win; missing module codes get a default stub.
 */
export function getEffectivePermissionRegistry() {
    const labels = buildPermissionModuleLabels();
    const map = new Map();

    for (const mod of PERMISSION_REGISTRY) {
        map.set(mod.id, JSON.parse(JSON.stringify(mod)));
    }

    for (const moduleId of collectPermissionModuleIds()) {
        if (!map.has(moduleId)) {
            map.set(moduleId, createModuleStub(moduleId, labels[moduleId]));
            continue;
        }
        const existing = map.get(moduleId);
        if (!existing.name || existing.name === existing.id) {
            existing.name = labels[moduleId] || existing.name;
        }
    }

    return filterPermissionRegistryModules(Array.from(map.values()));
}
