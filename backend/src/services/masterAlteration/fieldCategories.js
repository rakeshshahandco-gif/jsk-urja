/**
 * Master Alteration field classification (Phase 2–3 first wave).
 * A = display/report · B = accounting · C = GST/statutory · D = stock (deferred)
 */

export const MASTER_TYPES = Object.freeze({
    CUSTOMER: 'Customer',
    SUPPLIER: 'Supplier',
    LEDGER: 'Ledger',
    ITEM: 'Item',
});

export const FIELD_CATEGORY = Object.freeze({
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
});

/** Field definitions per master: path → category + permission key suffix */
export const FIELD_DEFS = Object.freeze({
    [MASTER_TYPES.CUSTOMER]: {
        customerName: { category: FIELD_CATEGORY.A, label: 'Customer Name', permission: 'alter_name', aliases: ['company', 'legalName', 'tradeName'] },
        company: { category: FIELD_CATEGORY.A, label: 'Company Name', permission: 'alter_name' },
        gstNumber: { category: FIELD_CATEGORY.C, label: 'GSTIN', permission: 'alter_gstin' },
        gstRegistrationType: { category: FIELD_CATEGORY.C, label: 'Registration Type', permission: 'alter_gst_registration' },
        gstStatus: { category: FIELD_CATEGORY.C, label: 'GST Status', permission: 'alter_gst_registration' },
        gstRegistrationEffectiveDate: { category: FIELD_CATEGORY.C, label: 'GST Effective From', permission: 'alter_gst_effective_dates' },
        gstCancellationEffectiveDate: { category: FIELD_CATEGORY.C, label: 'GST Cancelled From', permission: 'alter_gst_effective_dates' },
        state: { category: FIELD_CATEGORY.C, label: 'State', permission: 'alter_state' },
        billingStateCode: { category: FIELD_CATEGORY.C, label: 'State Code', permission: 'alter_state' },
        gstState: { category: FIELD_CATEGORY.C, label: 'GST State', permission: 'alter_state' },
        panNumber: { category: FIELD_CATEGORY.C, label: 'PAN', permission: 'alter_name' },
    },
    [MASTER_TYPES.SUPPLIER]: {
        supplierName: { category: FIELD_CATEGORY.A, label: 'Supplier Name', permission: 'alter_name' },
        gstNumber: { category: FIELD_CATEGORY.C, label: 'GSTIN', permission: 'alter_gstin' },
        gstRegistrationStatus: { category: FIELD_CATEGORY.C, label: 'Registration Status', permission: 'alter_gst_registration' },
        gstRegistrationEffectiveDate: { category: FIELD_CATEGORY.C, label: 'GST Effective From', permission: 'alter_gst_effective_dates' },
        gstCancellationEffectiveDate: { category: FIELD_CATEGORY.C, label: 'GST Cancelled From', permission: 'alter_gst_effective_dates' },
        state: { category: FIELD_CATEGORY.C, label: 'State', permission: 'alter_state' },
        panNumber: { category: FIELD_CATEGORY.C, label: 'PAN', permission: 'alter_name' },
    },
    [MASTER_TYPES.LEDGER]: {
        name: { category: FIELD_CATEGORY.A, label: 'Ledger Name', permission: 'alter_name' },
        underGroup: { category: FIELD_CATEGORY.B, label: 'Ledger Group', permission: 'alter_ledger_group' },
        groupName: { category: FIELD_CATEGORY.B, label: 'Group Name', permission: 'alter_ledger_group' },
    },
    [MASTER_TYPES.ITEM]: {
        name: { category: FIELD_CATEGORY.A, label: 'Item Name', permission: 'alter_name' },
        itemName: { category: FIELD_CATEGORY.A, label: 'Item Name', permission: 'alter_name' },
        hsnCode: { category: FIELD_CATEGORY.C, label: 'HSN', permission: 'alter_hsn' },
        hsnSacId: { category: FIELD_CATEGORY.C, label: 'HSN Master', permission: 'alter_hsn' },
    },
});

export function detectChangedFields(masterType, oldDoc, proposed) {
    const defs = FIELD_DEFS[masterType] || {};
    const changes = [];
    for (const [field, meta] of Object.entries(defs)) {
        if (!Object.prototype.hasOwnProperty.call(proposed, field)) continue;
        const oldVal = normalizeComparable(oldDoc?.[field]);
        const newVal = normalizeComparable(proposed[field]);
        if (oldVal !== newVal) {
            changes.push({
                field,
                label: meta.label,
                category: meta.category,
                permission: meta.permission,
                oldValue: oldDoc?.[field] ?? null,
                newValue: proposed[field] ?? null,
            });
        }
    }
    return changes;
}

function normalizeComparable(v) {
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object' && v._id) return String(v._id);
    return String(v).trim();
}

export function highestCategory(changes) {
    const order = { C: 3, B: 2, D: 2, A: 1 };
    let best = FIELD_CATEGORY.A;
    for (const c of changes) {
        if ((order[c.category] || 0) > (order[best] || 0)) best = c.category;
    }
    return best;
}

export function requiresReason(changes) {
    return changes.some((c) => c.category === FIELD_CATEGORY.B || c.category === FIELD_CATEGORY.C);
}
