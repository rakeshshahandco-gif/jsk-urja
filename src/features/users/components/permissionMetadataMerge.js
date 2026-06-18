import { APP_MODULES } from '@/utils/permissions';

function cloneModule(mod) {
    return JSON.parse(JSON.stringify(mod));
}

function normalizeAction(action) {
    if (typeof action === 'string') {
        return { id: action, label: action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' '), type: 'boolean' };
    }
    return { ...action, type: action.type || 'boolean' };
}

function mergeActions(targetSub, sourceSub) {
    const existingIds = new Set((targetSub.actions || []).map((a) => normalizeAction(a).id));
    (sourceSub.actions || []).forEach((action) => {
        const a = normalizeAction(action);
        if (!existingIds.has(a.id)) {
            targetSub.actions = targetSub.actions || [];
            targetSub.actions.push(a);
            existingIds.add(a.id);
        }
    });
}

function mergeSubmodule(targetMod, sourceSub) {
    let sub = targetMod.submodules.find((s) => s.id === sourceSub.id);
    if (!sub) {
        targetMod.submodules.push(cloneModule(sourceSub));
        return;
    }
    mergeActions(sub, sourceSub);
    if (sourceSub.name && (!sub.name || sub.name === sub.id)) {
        sub.name = sourceSub.name;
    }
}

/** APP_MODULES uses menu-aligned keys (e.g. customers.*) that may be absent from API registry. */
function appModulesAsRegistry() {
    return APP_MODULES.map((m) => ({
        id: m.id,
        name: m.name,
        submodules: (m.submodules || []).map((s) => ({
            id: s.id,
            name: s.name,
            actions: (s.actions || []).map(normalizeAction),
        })),
    }));
}

/** CRM submodule labels used in the app (leads, catalog, etc.). */
const CRM_SUBMODULE_SUPPLEMENT = {
    id: 'crm',
    name: 'CRM',
    submodules: [
        {
            id: 'leads',
            name: 'Inquiry / Lead',
            actions: [
                { id: 'view', label: 'Lead View Own', type: 'boolean' },
                { id: 'view_all', label: 'Lead View All', type: 'boolean' },
                { id: 'add', label: 'Lead Create', type: 'boolean' },
                { id: 'edit', label: 'Lead Edit Own', type: 'boolean' },
                { id: 'edit_all', label: 'Lead Edit All', type: 'boolean' },
                { id: 'delete', label: 'Delete', type: 'boolean' },
                { id: 'assign', label: 'Lead Assign / Reassign', type: 'boolean' },
                { id: 'report_view', label: 'Lead Report View Own', type: 'boolean' },
                { id: 'report_view_all', label: 'Lead Report View All', type: 'boolean' },
                { id: 'create_task', label: 'Lead Create Task', type: 'boolean' },
                { id: 'convert_whatsapp', label: 'Convert WhatsApp Chat to Lead', type: 'boolean' },
                { id: 'share_asset', label: 'Share Catalog / Datasheet', type: 'boolean' },
            ],
        },
        {
            id: 'product_catalog',
            name: 'Product Catalog',
            actions: [
                { id: 'view', label: 'View', type: 'boolean' },
                { id: 'add', label: 'Create', type: 'boolean' },
                { id: 'edit', label: 'Edit', type: 'boolean' },
                { id: 'delete', label: 'Delete', type: 'boolean' },
                { id: 'share', label: 'Share to WhatsApp', type: 'boolean' },
            ],
        },
    ],
};

const WHATSAPP_MODULE = {
    id: 'whatsapp',
    name: 'WhatsApp',
    submodules: [
        {
            id: 'whatsapp_settings',
            name: 'WhatsApp Settings & Chat',
            actions: [
                { id: 'view', label: 'View', type: 'boolean' },
                { id: 'edit', label: 'Edit', type: 'boolean' },
            ],
        },
    ],
};

function formatTitleFromId(id) {
    return String(id)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Merge API registry + APP_MODULES + menu paths so User Management shows every module
 * (including customers.* and crm.leads) without changing saved permission keys.
 */
export function mergePermissionMetadata(apiRegistry = [], flattenedMenu = []) {
    const map = new Map();

    (apiRegistry || []).forEach((m) => {
        map.set(m.id, cloneModule(m));
    });

    [...appModulesAsRegistry(), CRM_SUBMODULE_SUPPLEMENT, WHATSAPP_MODULE].forEach((mod) => {
        const existing = map.get(mod.id);
        if (!existing) {
            map.set(mod.id, cloneModule(mod));
            return;
        }
        if (!existing.name || existing.name === existing.id) {
            existing.name = mod.name;
        }
        (mod.submodules || []).forEach((sub) => mergeSubmodule(existing, sub));
    });

    flattenedMenu.forEach((item) => {
        if (!item.permission || !item.permission.includes('.')) return;
        const parts = item.permission.split('.');
        const [moduleId, submoduleId, actionId] = parts;
        if (!moduleId || !submoduleId || !actionId) return;

        let mod = map.get(moduleId);
        if (!mod) {
            mod = { id: moduleId, name: item.moduleName || formatTitleFromId(moduleId), submodules: [] };
            map.set(moduleId, mod);
        }

        let sub = mod.submodules.find((s) => s.id === submoduleId);
        if (!sub) {
            sub = {
                id: submoduleId,
                name: item.title || formatTitleFromId(submoduleId),
                actions: [],
            };
            mod.submodules.push(sub);
        }

        mergeActions(sub, { actions: [actionId] });
    });

    return Array.from(map.values());
}

/** Default-expanded modules so Lead/Inquiry and Customers are visible without extra clicks. */
export const DEFAULT_EXPANDED_MODULES = {
    crm: true,
    customers: true,
    reports: true,
    sales: true,
    tasks: true,
    purchase: true,
    inventory: true,
    gst: true,
    tds: true,
};

export const MODULE_DISPLAY_ORDER = [
    'home',
    'crm',
    'customers',
    'tasks',
    'whatsapp',
    'wechat',
    'messenger',
    'sales',
    'purchase',
    'inventory',
    'production',
    'voucher_entry',
    'account_master',
    'accounts_reports',
    'accounts',
    'gst',
    'tds',
    'tcs',
    'service',
    'mis',
    'reports',
    'fixed_assets',
    'prd',
    'rd_samples',
    'hr',
    'admin',
];

export function sortModulesForTable(modules) {
    const orderIndex = new Map(MODULE_DISPLAY_ORDER.map((id, i) => [id, i]));
    return [...modules].sort((a, b) => {
        const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : 999;
        const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : 999;
        if (ai !== bi) return ai - bi;
        return (a.name || a.id).localeCompare(b.name || b.id);
    });
}
