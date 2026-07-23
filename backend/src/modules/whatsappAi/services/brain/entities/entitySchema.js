/**
 * Phase 1C.0 — Entity extraction schema (framework).
 */

export const WHATSAPP_AI_ENTITY_KEYS = Object.freeze([
    'productName',
    'quantity',
    'wattage',
    'voltage',
    'current',
    'dt6',
    'dt8',
    'ble',
    'zigbee',
    'wifi',
    'colourTemperature',
    'customerCompany',
    'language',
]);

export function emptyEntityMap(language = 'en') {
    return {
        productName: null,
        quantity: null,
        wattage: null,
        voltage: null,
        current: null,
        dt6: false,
        dt8: false,
        ble: false,
        zigbee: false,
        wifi: false,
        colourTemperature: null,
        customerCompany: null,
        language,
        unresolvedTokens: [],
    };
}
