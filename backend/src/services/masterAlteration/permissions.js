/**
 * Sensitive Master Alteration permission keys (not auto-granted).
 * Format: masters.alteration.<action>
 */
export const MASTER_ALTERATION_PERMISSIONS = Object.freeze({
    ALTER_CUSTOMER: 'masters.alteration.alter_customer',
    ALTER_SUPPLIER: 'masters.alteration.alter_supplier',
    ALTER_LEDGER: 'masters.alteration.alter_ledger',
    ALTER_ITEM: 'masters.alteration.alter_item',
    ALTER_LEDGER_GROUP: 'masters.alteration.alter_ledger_group',
    ALTER_GSTIN: 'masters.alteration.alter_gstin',
    ALTER_GST_REGISTRATION: 'masters.alteration.alter_gst_registration',
    ALTER_GST_EFFECTIVE_DATES: 'masters.alteration.alter_gst_effective_dates',
    ALTER_STATE: 'masters.alteration.alter_state',
    ALTER_HSN: 'masters.alteration.alter_hsn',
    ALTER_NAME: 'masters.alteration.alter_name',
    OVERRIDE_LOCKED: 'masters.alteration.override_locked',
    ROLLBACK: 'masters.alteration.rollback',
    VIEW_USAGE: 'masters.alteration.view_usage',
});

const FIELD_PERM_MAP = {
    alter_name: MASTER_ALTERATION_PERMISSIONS.ALTER_NAME,
    alter_gstin: MASTER_ALTERATION_PERMISSIONS.ALTER_GSTIN,
    alter_gst_registration: MASTER_ALTERATION_PERMISSIONS.ALTER_GST_REGISTRATION,
    alter_gst_effective_dates: MASTER_ALTERATION_PERMISSIONS.ALTER_GST_EFFECTIVE_DATES,
    alter_state: MASTER_ALTERATION_PERMISSIONS.ALTER_STATE,
    alter_hsn: MASTER_ALTERATION_PERMISSIONS.ALTER_HSN,
    alter_ledger_group: MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER_GROUP,
};

const MASTER_BASE = {
    Customer: MASTER_ALTERATION_PERMISSIONS.ALTER_CUSTOMER,
    Supplier: MASTER_ALTERATION_PERMISSIONS.ALTER_SUPPLIER,
    Ledger: MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER,
    Item: MASTER_ALTERATION_PERMISSIONS.ALTER_ITEM,
};

export function permissionKeysForChanges(masterType, changes) {
    const keys = new Set();
    if (MASTER_BASE[masterType]) keys.add(MASTER_BASE[masterType]);
    if (masterType === 'Item') {
        keys.add(MASTER_ALTERATION_PERMISSIONS.ALTER_HSN);
        keys.add(MASTER_ALTERATION_PERMISSIONS.ALTER_NAME);
    }
    for (const c of changes || []) {
        const k = FIELD_PERM_MAP[c.permission];
        if (k) keys.add(k);
    }
    return [...keys];
}
