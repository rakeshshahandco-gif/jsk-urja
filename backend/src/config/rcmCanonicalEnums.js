/**
 * Canonical RCM evaluation enums — shared by decision engine, posting, UI options, tests.
 * Do not invent parallel spellings (COMMERCIAL_RENT vs Commercial, etc.).
 */
export const RCM_CATEGORIES = Object.freeze([
    'RENT',
    'GTA',
    'COURIER',
    'LEGAL',
    'SECURITY',
    'GENERAL',
    'OTHER',
]);

export const PROPERTY_TYPES = Object.freeze(['Commercial', 'Residential', 'Other']);

export const TRANSPORT_SERVICE_TYPES = Object.freeze([
    'GTA',
    'GTA with consignment note',
    'Courier',
    'Local vehicle hire',
    'Local Transport',
    'Parcel service',
    'Goods transport without GTA conditions',
    'Other transport',
]);

export const SUPPLIER_TAX_OPTIONS = Object.freeze([
    'Forward Charge',
    'Reverse Charge',
    'Exempt / Not Applicable',
    'Transaction-wise',
    'Unknown',
    'RCM',
]);

export const SUPPLIER_GST_STATUSES = Object.freeze([
    'Unregistered',
    'Registered Regular',
    'Registered',
    'Composition',
    'Consumer',
]);

const PROPERTY_ALIASES = {
    commercial: 'Commercial',
    commercial_rent: 'Commercial',
    commercialrent: 'Commercial',
    residential: 'Residential',
    residential_rent: 'Residential',
    other: 'Other',
};

const TRANSPORT_ALIASES = {
    gta: 'GTA',
    gta_with_consignment: 'GTA with consignment note',
    gta_with_consignment_note: 'GTA with consignment note',
    'gta with consignment note': 'GTA with consignment note',
    courier: 'Courier',
    parcel: 'Parcel service',
    'parcel service': 'Parcel service',
    local: 'Local Transport',
    'local transport': 'Local Transport',
    'local vehicle hire': 'Local vehicle hire',
};

const CATEGORY_ALIASES = {
    rent: 'RENT',
    commercial_rent: 'RENT',
    gta: 'GTA',
    courier: 'COURIER',
    legal: 'LEGAL',
    security: 'SECURITY',
    general: 'GENERAL',
    other: 'OTHER',
};

const TAX_OPTION_ALIASES = {
    forward: 'Forward Charge',
    'forward charge': 'Forward Charge',
    reverse: 'Reverse Charge',
    'reverse charge': 'Reverse Charge',
    rcm: 'Reverse Charge',
    'transaction-wise': 'Transaction-wise',
    transaction_wise: 'Transaction-wise',
    unknown: 'Unknown',
    exempt: 'Exempt / Not Applicable',
};

const STATUS_ALIASES = {
    unregistered: 'Unregistered',
    ur: 'Unregistered',
    registered: 'Registered Regular',
    'registered regular': 'Registered Regular',
    regular: 'Registered Regular',
    composition: 'Composition',
    consumer: 'Consumer',
};

function key(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function softKey(s) {
    return String(s || '').trim().toLowerCase();
}

/**
 * @returns {{ value: string|null, error: string|null }}
 */
export function normalizePropertyType(raw) {
    if (raw == null || raw === '') return { value: '', error: null };
    const k = key(raw);
    if (PROPERTY_ALIASES[k]) return { value: PROPERTY_ALIASES[k], error: null };
    const exact = PROPERTY_TYPES.find((p) => p.toLowerCase() === softKey(raw));
    if (exact) return { value: exact, error: null };
    return {
        value: null,
        error: `Unsupported propertyType "${raw}". Use one of: ${PROPERTY_TYPES.join(', ')}`,
    };
}

export function normalizeTransportServiceType(raw, { consignmentNoteAvailable } = {}) {
    if (raw == null || raw === '') {
        if (consignmentNoteAvailable === true || consignmentNoteAvailable === 'YES') {
            return { value: 'GTA with consignment note', error: null };
        }
        return { value: '', error: null };
    }
    const k = key(raw);
    const soft = softKey(raw);
    if (TRANSPORT_ALIASES[k] || TRANSPORT_ALIASES[soft]) {
        let v = TRANSPORT_ALIASES[k] || TRANSPORT_ALIASES[soft];
        if (
            v === 'GTA'
            && (consignmentNoteAvailable === true || consignmentNoteAvailable === 'YES')
        ) {
            v = 'GTA with consignment note';
        }
        return { value: v, error: null };
    }
    const exact = TRANSPORT_SERVICE_TYPES.find((p) => p.toLowerCase() === soft);
    if (exact) {
        let v = exact;
        if (
            v === 'GTA'
            && (consignmentNoteAvailable === true || consignmentNoteAvailable === 'YES')
        ) {
            v = 'GTA with consignment note';
        }
        return { value: v, error: null };
    }
    return {
        value: null,
        error: `Unsupported transportServiceType "${raw}". Use one of: ${TRANSPORT_SERVICE_TYPES.join(', ')}`,
    };
}

export function normalizeRcmCategory(raw) {
    if (raw == null || raw === '') return { value: '', error: null };
    const k = key(raw);
    if (CATEGORY_ALIASES[k]) return { value: CATEGORY_ALIASES[k], error: null };
    const exact = RCM_CATEGORIES.find((c) => c === String(raw).trim().toUpperCase());
    if (exact) return { value: exact, error: null };
    return {
        value: null,
        error: `Unsupported rcmCategory "${raw}". Use one of: ${RCM_CATEGORIES.join(', ')}`,
    };
}

export function normalizeSupplierTaxOption(raw) {
    if (raw == null || raw === '') return { value: '', error: null };
    const soft = softKey(raw);
    if (TAX_OPTION_ALIASES[soft] || TAX_OPTION_ALIASES[key(raw)]) {
        return { value: TAX_OPTION_ALIASES[soft] || TAX_OPTION_ALIASES[key(raw)], error: null };
    }
    const exact = SUPPLIER_TAX_OPTIONS.find((p) => p.toLowerCase() === soft);
    if (exact) return { value: exact, error: null };
    return {
        value: null,
        error: `Unsupported supplierGstOption/supplierTaxOption "${raw}". Use one of: ${SUPPLIER_TAX_OPTIONS.join(', ')}`,
    };
}

export function normalizeSupplierGstStatus(raw) {
    if (raw == null || raw === '') return { value: '', error: null };
    const soft = softKey(raw);
    if (STATUS_ALIASES[soft] || STATUS_ALIASES[key(raw)]) {
        return { value: STATUS_ALIASES[soft] || STATUS_ALIASES[key(raw)], error: null };
    }
    const exact = SUPPLIER_GST_STATUSES.find((p) => p.toLowerCase() === soft);
    if (exact) return { value: exact, error: null };
    return {
        value: null,
        error: `Unsupported supplierGstStatus "${raw}". Use one of: ${SUPPLIER_GST_STATUSES.join(', ')}`,
    };
}

/** Synonym-aware list match for rule conditions */
export function conditionListMatch(conditionList, value, normalizer) {
    if (!conditionList || !conditionList.length) return true;
    const vRaw = String(value || '').trim();
    if (!vRaw) return false;
    const vNorm = normalizer ? normalizer(vRaw).value : vRaw;
    const vCompare = String(vNorm || vRaw).toLowerCase();
    return conditionList.some((c) => {
        const cNorm = normalizer ? normalizer(c).value : c;
        const cCompare = String(cNorm || c).toLowerCase();
        if (cCompare === vCompare) return true;
        // GTA family: rule wants "GTA with consignment note", value "GTA" only fails;
        // value "GTA with consignment note" matches rule ["GTA"] loosely for category GTA rules
        if (cCompare === 'gta' && vCompare.startsWith('gta')) return true;
        if (vCompare === 'gta' && cCompare.startsWith('gta')) return false; // need consignment when rule requires it
        if (cCompare === 'registered' && vCompare.startsWith('registered')) return true;
        if (vCompare === 'registered' && cCompare.startsWith('registered')) return true;
        if (cCompare === 'reverse charge' && (vCompare === 'rcm' || vCompare === 'reverse charge')) return true;
        if (cCompare === 'rcm' && vCompare === 'reverse charge') return true;
        return false;
    });
}

/**
 * Deterministic source line id for RCM posting idempotency.
 * Prefer persisted line id; else stable hash of voucher + ledger + line index.
 */
export function buildStableRcmSourceLineId({
    sourceVoucherId,
    sourceLineId,
    expensePurchaseLedgerId,
    expensePurchaseLedgerName,
    lineIndex = 0,
    taxableValue,
} = {}) {
    const explicit = String(sourceLineId || '').trim();
    if (explicit && !/^e2e-|^tmp-|^new-/i.test(explicit) && explicit !== 'header') {
        // Allow explicit persisted ids; reject random QA prefixes only when regenerating
        if (!/^\d{10,}$/.test(explicit)) return explicit;
    }
    if (explicit && explicit !== 'header' && !/^(e2e-|tmp-|new-)/i.test(explicit)) {
        return explicit;
    }
    const parts = [
        String(sourceVoucherId || ''),
        String(expensePurchaseLedgerId || expensePurchaseLedgerName || 'ledger'),
        String(lineIndex),
        String(Number(taxableValue) || 0),
    ];
    return `line:${parts.join('|')}`;
}

export default {
    RCM_CATEGORIES,
    PROPERTY_TYPES,
    TRANSPORT_SERVICE_TYPES,
    SUPPLIER_TAX_OPTIONS,
    SUPPLIER_GST_STATUSES,
    normalizePropertyType,
    normalizeTransportServiceType,
    normalizeRcmCategory,
    normalizeSupplierTaxOption,
    normalizeSupplierGstStatus,
    conditionListMatch,
    buildStableRcmSourceLineId,
};
