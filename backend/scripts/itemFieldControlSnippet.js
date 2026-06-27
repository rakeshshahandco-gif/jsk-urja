export const FIELD_BY_KEY = Object.fromEntries(ITEM_MASTER_TEMPLATE_FIELDS.map((f) => [f.key, f]));

export function buildItemFieldControl(settings, isEnabledLegacy) {
    const useLegacy = !settings || settings.useLegacy;
    const fields = settings?.fields || {};
    const legacyVisible = (fieldKey) => {
        const def = FIELD_BY_KEY[fieldKey];
        if (!def) return true;
        if (!def.featureKey) return true;
        return isEnabledLegacy(def.featureKey);
    };
    const isVisible = (fieldKey) => {
        if (useLegacy) return legacyVisible(fieldKey);
        const rule = fields[fieldKey];
        if (!rule) return legacyVisible(fieldKey);
        if (rule.visible === null || rule.visible === undefined) return legacyVisible(fieldKey);
        return rule.visible !== false;
    };
    const isRequired = (fieldKey) => {
        if (!isVisible(fieldKey)) return false;
        if (useLegacy) return false;
        return !!fields[fieldKey]?.required;
    };
    const isReadOnly = (fieldKey) => {
        if (useLegacy) return false;
        return !!fields[fieldKey]?.readOnly;
    };
    const getDefaultValue = (fieldKey) => fields[fieldKey]?.defaultValue;
    const anyVisibleInGroup = (group) => ITEM_MASTER_TEMPLATE_FIELDS.filter((f) => f.group === group).some((f) => isVisible(f.key));
    const tabVisible = (tabId) => {
        if (useLegacy) return true;
        const map = { basic: 'basic', stock: 'stock', purchase: 'purchase', sales: 'sales', production: 'production', technical: 'technical' };
        const group = map[tabId];
        if (!group) return true;
        return anyVisibleInGroup(group);
    };
    return { useLegacy, isVisible, isRequired, isReadOnly, getDefaultValue, anyVisibleInGroup, tabVisible, templateCode: settings?.templateCode, templateName: settings?.templateName };
}
