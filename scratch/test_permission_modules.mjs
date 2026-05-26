import fs from 'fs';
import { PERMISSION_REGISTRY } from '../backend/src/config/permissionRegistry.js';

// --- 1) Backend registry sanity ---
console.log('================ BACKEND REGISTRY ================');
console.log('Module count:', PERMISSION_REGISTRY.length);
PERMISSION_REGISTRY.forEach(m => {
    const subCount = (m.submodules || []).length;
    const actCount = (m.submodules || []).reduce((sum, s) => sum + (s.actions?.length || 0), 0);
    console.log(`  - ${m.id.padEnd(22)} | ${subCount} submods | ${actCount} actions`);
});

// --- 2) Read menu.config.js as text and extract every permission: 'x.y.z' ---
const menuSrc = fs.readFileSync('src/config/menu.config.js', 'utf8');
const permRe = /permission:\s*['"]([a-z0-9_]+(?:\.[a-z0-9_]+)*)['"]/gi;
const titleRe = /title:\s*['"]([^'"]+)['"]/g;
const allPerms = [...menuSrc.matchAll(permRe)].map(m => m[1]);
const dotted = allPerms.filter(p => p.includes('.'));
console.log(`\nMenu permissions found: ${allPerms.length} (dotted: ${dotted.length})`);

// Replicate the frontend augmentation logic
function augment(meta, dottedPerms) {
    const augmentedMeta = [...meta];
    dottedPerms.forEach(p => {
        const [moduleId, submoduleId, actionId] = p.split('.');
        if (!moduleId || !submoduleId || !actionId) return;
        let moduleEntry = augmentedMeta.find(m => m.id === moduleId);
        if (!moduleEntry) {
            moduleEntry = { id: moduleId, name: moduleId, submodules: [] };
            augmentedMeta.push(moduleEntry);
        }
        let subEntry = moduleEntry.submodules.find(s => s.id === submoduleId);
        if (!subEntry) {
            subEntry = { id: submoduleId, name: submoduleId, actions: [] };
            moduleEntry.submodules.push(subEntry);
        }
        if (!subEntry.actions.some(a => (typeof a === 'string' ? a : a.id) === actionId)) {
            subEntry.actions.push(actionId);
        }
    });
    return augmentedMeta;
}

const augmented = augment(PERMISSION_REGISTRY, dotted);
console.log('\n================ AFTER MENU AUGMENTATION ================');
console.log('Total module count:', augmented.length);
const newModules = augmented.filter(m => !PERMISSION_REGISTRY.some(r => r.id === m.id));
console.log('New modules added from menu:', newModules.map(m => m.id).join(', ') || '(none)');
newModules.forEach(m => {
    console.log(`  ${m.id}:`);
    m.submodules.forEach(s => console.log(`     ${s.id} -> [${s.actions.join(', ')}]`));
});

// --- 3) Replicate the new PERMISSION_GROUPS from AddUserForm.jsx ---
const PERMISSION_GROUPS = [
    { id: 'home',           name: 'Home & Dashboard',         modules: ['home'] },
    { id: 'crm',            name: 'CRM & Customers',          modules: ['crm', 'customers'] },
    { id: 'tasks',          name: 'Tasks & Workflow',         modules: ['tasks'] },
    { id: 'communications', name: 'Communications',           modules: ['messenger', 'whatsapp', 'wechat'] },
    { id: 'sales',          name: 'Sales',                    modules: ['sales'] },
    { id: 'purchase',       name: 'Purchase',                 modules: ['purchase'] },
    { id: 'inventory',      name: 'Inventory',                modules: ['inventory'] },
    { id: 'production',     name: 'Production',               modules: ['production'] },
    { id: 'vouchers',       name: 'Voucher Entry & Accounts', modules: ['voucher_entry', 'account_master', 'accounts', 'accounts_reports'] },
    { id: 'taxes',          name: 'Taxes',                    modules: ['gst', 'tds', 'tcs'] },
    { id: 'fixed_assets',   name: 'Fixed Assets',             modules: ['fixed_assets'] },
    { id: 'service',        name: 'Service & Support',        modules: ['service'] },
    { id: 'rd',             name: 'R&D',                      modules: ['prd', 'rd_samples'] },
    { id: 'hr',             name: 'HR Management',            modules: ['hr'] },
    { id: 'mis_reports',    name: 'MIS & Reports',            modules: ['mis', 'reports'] },
    { id: 'admin',          name: 'Admin & Settings',         modules: ['admin'] }
];

// --- 4) Group coverage ---
console.log('\n================ GROUP COVERAGE ================');
PERMISSION_GROUPS.forEach(g => {
    const present = g.modules.filter(id => augmented.some(m => m.id === id));
    const missing = g.modules.filter(id => !augmented.some(m => m.id === id));
    console.log(`[${g.name}]`);
    console.log(`   visible : ${present.join(', ') || '(none - group hidden)'}`);
    if (missing.length) console.log(`   not yet in meta (group hides them if all missing): ${missing.join(', ')}`);
});

// --- 5) "Other Modules" fallback ---
const otherModules = augmented.filter(m => !PERMISSION_GROUPS.some(g => g.modules.includes(m.id)));
console.log('\n================ OTHER MODULES (auto-fallback) ================');
if (otherModules.length === 0) {
    console.log('(none) - all modules are already grouped.');
} else {
    otherModules.forEach(m => console.log(`  - ${m.id} : ${(m.submodules||[]).length} submods`));
}

// --- 6) Validate structural correctness ---
let issues = 0;
augmented.forEach(m => {
    if (!m.id) { console.log('ISSUE: module missing id'); issues++; }
    if (!Array.isArray(m.submodules)) { console.log(`ISSUE: ${m.id} non-array submodules`); issues++; }
    (m.submodules || []).forEach(s => {
        if (!s.id) { console.log(`ISSUE: ${m.id} submodule missing id`); issues++; }
        if (!Array.isArray(s.actions)) { console.log(`ISSUE: ${m.id}.${s.id} actions not an array`); issues++; }
    });
});

// --- 7) Final summary ---
console.log('\n================ SUMMARY ================');
console.log(`Backend registry modules : ${PERMISSION_REGISTRY.length}`);
console.log(`After menu augmentation  : ${augmented.length}`);
console.log(`Mapped into groups       : ${augmented.length - otherModules.length}`);
console.log(`Falling into "Other"     : ${otherModules.length}`);
console.log(`Structural issues        : ${issues}`);
console.log(issues === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
