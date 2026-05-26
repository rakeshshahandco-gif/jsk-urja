/**
 * Financial visibility + field-level permission helpers.
 * Merged: role defaults + user overrides.
 */
export function mergeVisibilityRestrictions(user, role) {
    const base = {
        hideGpProfit: false,
        hidePurchaseRate: false,
        hideSalary: false,
        hideBankBalance: false,
        hideGstTdsReports: false,
    };
    const fromRole = role?.visibilityRestrictions || {};
    const fromUser = user?.visibilityRestrictions || {};
    return {
        hideGpProfit: fromUser.hideGpProfit ?? fromRole.hideGpProfit ?? base.hideGpProfit,
        hidePurchaseRate: fromUser.hidePurchaseRate ?? fromRole.hidePurchaseRate ?? base.hidePurchaseRate,
        hideSalary: fromUser.hideSalary ?? fromRole.hideSalary ?? base.hideSalary,
        hideBankBalance: fromUser.hideBankBalance ?? fromRole.hideBankBalance ?? base.hideBankBalance,
        hideGstTdsReports: fromUser.hideGstTdsReports ?? fromRole.hideGstTdsReports ?? base.hideGstTdsReports,
    };
}

export function mergeFieldPermissions(user, role) {
    const roleFp = role?.fieldPermissions || {};
    const userFp = user?.fieldPermissions || {};
    return deepMergeFieldPerms(roleFp, userFp);
}

function deepMergeFieldPerms(base, override) {
    const out = { ...base };
    for (const mod of Object.keys(override)) {
        out[mod] = { ...(base[mod] || {}), ...override[mod] };
        for (const field of Object.keys(override[mod] || {})) {
            out[mod][field] = { ...(base[mod]?.[field] || {}), ...override[mod][field] };
        }
    }
    return out;
}

export function canEditField(fieldPermissions, module, field) {
    const fp = fieldPermissions?.[module]?.[field];
    if (!fp) return true;
    if (fp.edit === false) return false;
    return fp.edit !== false;
}

export function canViewField(fieldPermissions, module, field) {
    const fp = fieldPermissions?.[module]?.[field];
    if (!fp) return true;
    if (fp.view === false) return false;
    return true;
}

/** Strip sensitive fields from API response based on visibility rules */
export function maskFinancialPayload(data, visibility, context = 'general') {
    if (!data || !visibility) return data;
    const clone = JSON.parse(JSON.stringify(data));

    const maskGp = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (visibility.hideGpProfit) {
            delete obj.gpAmount;
            delete obj.gpPercent;
            delete obj.totalGpAmount;
            delete obj.totalGpPercent;
            delete obj.unitCost;
            delete obj.totalCostValue;
        }
        if (visibility.hidePurchaseRate) {
            delete obj.purchaseRate;
            delete obj.valuationRate;
            delete obj.lastPurchaseCost;
        }
        if (visibility.hideBankBalance) {
            delete obj.bankBalance;
            delete obj.cashBalance;
        }
        if (Array.isArray(obj.items)) obj.items.forEach(maskGp);
        if (Array.isArray(obj)) obj.forEach(maskGp);
        else Object.values(obj).forEach((v) => {
            if (v && typeof v === 'object') maskGp(v);
        });
    };

    if (context === 'gp' && visibility.hideGpProfit) maskGp(clone);
    else if (context === 'bank' && visibility.hideBankBalance) maskGp(clone);
    else maskGp(clone);

    return clone;
}

export const DEFAULT_FIELD_PERMISSIONS_TEMPLATE = {
    sales_invoice: {
        qty: { view: true, edit: true },
        rate: { view: true, edit: true },
        gpAmount: { view: true, edit: false },
        unitCost: { view: true, edit: false },
    },
    purchase_invoice: {
        rate: { view: true, edit: true },
        purchaseRate: { view: true, edit: false },
    },
    voucher: {
        amount: { view: true, edit: true },
        delete: { view: true, edit: false },
    },
};
