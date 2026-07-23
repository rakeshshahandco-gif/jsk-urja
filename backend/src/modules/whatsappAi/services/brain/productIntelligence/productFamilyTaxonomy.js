/**
 * Phase 1C.1 — JSK product family taxonomy (deterministic, no LLM).
 */

export const JSK_PRODUCT_FAMILIES = Object.freeze([
    Object.freeze({
        id: 'dali_driver',
        label: 'DALI Driver',
        category: 'driver',
        protocols: Object.freeze(['dali']),
    }),
    Object.freeze({
        id: 'phase_cut_driver',
        label: 'Phase Cut Driver',
        category: 'driver',
        protocols: Object.freeze(['phase_cut']),
    }),
    Object.freeze({
        id: 'ble_mesh_driver',
        label: 'BLE Mesh Driver',
        category: 'driver',
        protocols: Object.freeze(['ble_mesh', 'ble']),
    }),
    Object.freeze({
        id: 'zigbee_driver',
        label: 'Zigbee Driver',
        category: 'driver',
        protocols: Object.freeze(['zigbee']),
    }),
    Object.freeze({
        id: 'smart_switch',
        label: 'Smart Switch',
        category: 'control',
        protocols: Object.freeze([]),
    }),
    Object.freeze({
        id: 'scene_controller',
        label: 'Scene Controller',
        category: 'control',
        protocols: Object.freeze([]),
    }),
]);

export function getProductFamilyById(id) {
    return JSK_PRODUCT_FAMILIES.find((f) => f.id === id) || null;
}

export default JSK_PRODUCT_FAMILIES;
