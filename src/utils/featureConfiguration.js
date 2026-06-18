const CUSTOMER_LEGACY_SYNC = {
    enableCreditPeriod: 'customer.creditPeriod',
    enableGracePeriod: 'customer.gracePeriod',
    enableCustomerType: 'customer.customerType',
    enableTcsApplicable: 'customer.tcsApplicable',
    enableCreditLimit: 'customer.creditLimit',
    enablePaymentTerms: 'customer.paymentTerms',
    enableInterestApplicable: 'customer.interestApplicable',
    enableCollectionPerson: 'customer.collectionPerson',
    enableRiskCategory: 'customer.riskCategory',
    enableGstNumber: 'customer.gstNumber',
    enableGstRegistrationType: 'customer.gstRegistrationType',
    enableGstState: 'customer.gstState',
    enablePlaceOfSupply: 'customer.placeOfSupply',
    enablePanNumber: 'customer.panNumber',
    enableTanNumber: 'customer.tanNumber',
    enableMsmeNumber: 'customer.msmeNumber',
    enableIecNumber: 'customer.iecNumber',
    enableCinNumber: 'customer.cinNumber',
    enableBankDetails: 'customer.bankDetails',
    enableExportDetails: 'customer.exportDetails',
    enableDocumentsKyc: 'customer.documentsKyc',
};

function getByPath(obj, path) {
    if (!path) return undefined;
    let cur = obj;
    for (const p of path.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

export function buildEffectiveOverrides(settings, registry = []) {
    const engine = settings?.featureEngine || {};
    const overrides = { ...(engine.overrides || {}) };

    for (const def of registry) {
        if (overrides[def.featureKey] !== undefined) continue;
        if (def.legacyPath) {
            const legacyVal = getByPath(settings, def.legacyPath);
            if (legacyVal !== undefined) {
                overrides[def.featureKey] = !!legacyVal;
                continue;
            }
        }
        overrides[def.featureKey] = def.defaultEnabled !== false;
    }

    for (const custom of engine.customDefinitions || []) {
        if (custom?.featureKey && overrides[custom.featureKey] === undefined) {
            overrides[custom.featureKey] = custom.defaultEnabled !== false;
        }
    }

    // Feature / Compliance → Customer tab wins over stale featureEngine overrides
    for (const [legacyKey, featureKey] of Object.entries(CUSTOMER_LEGACY_SYNC)) {
        const legacyVal = settings?.customer?.[legacyKey];
        if (legacyVal !== undefined) overrides[featureKey] = !!legacyVal;
    }

    return overrides;
}

export function isFeatureConfigEnabled(settings, registry, featureKey) {
    if (!featureKey) return true;
    const overrides = buildEffectiveOverrides(settings, registry);
    if (Object.prototype.hasOwnProperty.call(overrides, featureKey)) {
        return Boolean(overrides[featureKey]);
    }
    const def = registry.find((r) => r.featureKey === featureKey);
    if (def?.legacyPath) {
        const v = getByPath(settings, def.legacyPath);
        if (v !== undefined) return Boolean(v);
    }
    return def ? Boolean(def.defaultEnabled) : true;
}
