/**
 * Development / Golden Module Lock catalog.
 * Runtime CRM behavior is NOT blocked by these locks — Cursor/dev protection only.
 * Storage: platformfeaturesettings.settings.moduleLocks (no new collection).
 */

export const MODULE_LOCK_SCOPES = Object.freeze([
    'COMMON',
    'JSK_URJA',
    'HANDLOOM',
    'PROFESSIONAL',
    'HEALTHCARE',
]);

/** Top-level + optional sub-module keys for Super Admin Module Lock UI. */
export const MODULE_LOCK_CATALOG = Object.freeze([
    { moduleKey: 'customerMaster', moduleName: 'Customer Master', scope: 'COMMON' },
    { moduleKey: 'supplierMaster', moduleName: 'Supplier Master', scope: 'COMMON' },
    { moduleKey: 'salesOrder', moduleName: 'Sales Order', scope: 'COMMON' },
    { moduleKey: 'salesOrder.form', moduleName: 'Sales Order Form', scope: 'COMMON', parentKey: 'salesOrder' },
    { moduleKey: 'salesOrder.calculation', moduleName: 'Sales Order Calculation', scope: 'COMMON', parentKey: 'salesOrder' },
    { moduleKey: 'salesOrder.print', moduleName: 'Sales Order Print/PDF', scope: 'COMMON', parentKey: 'salesOrder' },
    { moduleKey: 'salesOrder.whatsappPdf', moduleName: 'Sales Order WhatsApp PDF', scope: 'COMMON', parentKey: 'salesOrder' },
    { moduleKey: 'salesInvoice', moduleName: 'Sales Invoice', scope: 'COMMON' },
    { moduleKey: 'salesInvoice.print', moduleName: 'Sales Invoice Print/PDF', scope: 'COMMON', parentKey: 'salesInvoice' },
    { moduleKey: 'purchaseOrder', moduleName: 'Purchase Order', scope: 'COMMON' },
    { moduleKey: 'accountMaster', moduleName: 'Account Master', scope: 'COMMON' },
    { moduleKey: 'accountReport', moduleName: 'Account Report', scope: 'COMMON' },
    { moduleKey: 'gstr1', moduleName: 'GST / GSTR-1', scope: 'COMMON' },
    { moduleKey: 'gstr3b', moduleName: 'GSTR-3B', scope: 'COMMON' },
    { moduleKey: 'tds', moduleName: 'TDS', scope: 'COMMON' },
    { moduleKey: 'tcs', moduleName: 'TCS', scope: 'COMMON' },
    { moduleKey: 'whatsapp', moduleName: 'WhatsApp', scope: 'COMMON' },
    { moduleKey: 'inventory', moduleName: 'Inventory', scope: 'COMMON' },
    { moduleKey: 'backupRestore', moduleName: 'Backup & Restore', scope: 'COMMON' },
    { moduleKey: 'production', moduleName: 'Electronics Production', scope: 'JSK_URJA' },
    { moduleKey: 'bom', moduleName: 'BOM', scope: 'JSK_URJA' },
    { moduleKey: 'pcb', moduleName: 'PCB', scope: 'JSK_URJA' },
    { moduleKey: 'smd', moduleName: 'SMD', scope: 'JSK_URJA' },
    { moduleKey: 'qc', moduleName: 'QC', scope: 'JSK_URJA' },
    { moduleKey: 'handloomProduction', moduleName: 'Handloom Production', scope: 'HANDLOOM' },
    { moduleKey: 'than_meter_stock', moduleName: 'Thaan / Piece Stock', scope: 'HANDLOOM' },
    { moduleKey: 'dyeing', moduleName: 'Dyeing', scope: 'HANDLOOM' },
    { moduleKey: 'printing', moduleName: 'Printing', scope: 'HANDLOOM' },
    { moduleKey: 'embroidery', moduleName: 'Embroidery', scope: 'HANDLOOM' },
    /** Harmless entry for Super Admin UI tests — not a business module. */
    { moduleKey: '_moduleLockTest', moduleName: 'Module Lock Test (safe)', scope: 'COMMON', testOnly: true },
]);

export function getCatalogEntry(moduleKey) {
    const key = String(moduleKey || '').trim();
    return MODULE_LOCK_CATALOG.find((m) => m.moduleKey === key) || null;
}

export function normalizeModuleLockKey(moduleKey) {
    return String(moduleKey || '').trim();
}
