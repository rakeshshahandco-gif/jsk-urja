/** Mirror of backend itemMasterTemplateDefaults.js for client-side field control. */
const TEXTILE_BASIC_KEYS = new Set([
    'itemName', 'itemCode', 'itemGroup', 'category', 'hsnSac', 'uom',
    'description', 'activeInactive', 'gstRate', 'purchaseRate', 'salesRate',
    'openingStock', 'minStock', 'maxStock', 'reorderLevel',
]);

export function getTemplateDefaultFieldVisible(templateCode, fieldDef) {
    const code = String(templateCode || '').toUpperCase();
    const group = fieldDef?.group || 'basic';
    const key = fieldDef?.key;

    if (code === 'TEXTILE') {
        if (group === 'textile' || group === 'textileImages') return true;
        if (group === 'technical') return false;
        if (group === 'exporter') return false;
        if (group === 'production') return false;
        if (key === 'warranty' || key === 'pointsLeads') return false;
        if (TEXTILE_BASIC_KEYS.has(key)) return true;
        return false;
    }

    if (code === 'ELECTRONICS_JSK') {
        if (group === 'textile' || group === 'exporter' || group === 'textileImages') return false;
        return true;
    }

    if (group === 'textile' || group === 'exporter' || group === 'textileImages') return false;
    return true;
}

export function getTemplateDefaultFieldRequired(_templateCode, _fieldDef) {
    return false;
}
