/**
 * Phase 1C.1 — Product alias dictionary (EN / common misspellings / GU / HI cues).
 * Longer / more specific aliases should be matched first (sorted at runtime by length).
 */

/** @type {ReadonlyArray<{ familyId: string, alias: string, weight: number }>} */
export const JSK_PRODUCT_ALIASES = Object.freeze([
    // DALI Driver
    { familyId: 'dali_driver', alias: 'dali driver', weight: 1 },
    { familyId: 'dali_driver', alias: 'dali led driver', weight: 0.98 },
    { familyId: 'dali_driver', alias: 'dali-driver', weight: 0.97 },
    { familyId: 'dali_driver', alias: 'dali', weight: 0.85 },
    { familyId: 'dali_driver', alias: 'डाली ड्राइवर', weight: 0.95 },
    { familyId: 'dali_driver', alias: 'डाली', weight: 0.8 },
    { familyId: 'dali_driver', alias: 'ડાલી ડ્રાઈવર', weight: 0.95 },
    { familyId: 'dali_driver', alias: 'ડાલી', weight: 0.8 },

    // Phase Cut
    { familyId: 'phase_cut_driver', alias: 'phase cut driver', weight: 1 },
    { familyId: 'phase_cut_driver', alias: 'phase-cut driver', weight: 0.98 },
    { familyId: 'phase_cut_driver', alias: 'phasecut driver', weight: 0.96 },
    { familyId: 'phase_cut_driver', alias: 'triac driver', weight: 0.9 },
    { familyId: 'phase_cut_driver', alias: 'leading edge driver', weight: 0.88 },
    { familyId: 'phase_cut_driver', alias: 'trailing edge driver', weight: 0.88 },
    { familyId: 'phase_cut_driver', alias: 'phase cut', weight: 0.82 },

    // BLE Mesh
    { familyId: 'ble_mesh_driver', alias: 'ble mesh driver', weight: 1 },
    { familyId: 'ble_mesh_driver', alias: 'ble-mesh driver', weight: 0.98 },
    { familyId: 'ble_mesh_driver', alias: 'bluetooth mesh driver', weight: 0.95 },
    { familyId: 'ble_mesh_driver', alias: 'ble mesh', weight: 0.88 },
    { familyId: 'ble_mesh_driver', alias: 'mesh driver', weight: 0.75 },

    // Zigbee
    { familyId: 'zigbee_driver', alias: 'zigbee driver', weight: 1 },
    { familyId: 'zigbee_driver', alias: 'zigbee led driver', weight: 0.98 },
    { familyId: 'zigbee_driver', alias: 'zigbee', weight: 0.8 },
    { familyId: 'zigbee_driver', alias: 'जिगबी', weight: 0.85 },

    // Smart Switch
    { familyId: 'smart_switch', alias: 'smart switch', weight: 1 },
    { familyId: 'smart_switch', alias: 'smartswitch', weight: 0.95 },
    { familyId: 'smart_switch', alias: 'wifi switch', weight: 0.85 },
    { familyId: 'smart_switch', alias: 'wi-fi switch', weight: 0.85 },
    { familyId: 'smart_switch', alias: 'smart light switch', weight: 0.9 },

    // Scene Controller
    { familyId: 'scene_controller', alias: 'scene controller', weight: 1 },
    { familyId: 'scene_controller', alias: 'scene-controller', weight: 0.97 },
    { familyId: 'scene_controller', alias: 'scene panel', weight: 0.88 },
    { familyId: 'scene_controller', alias: 'lighting scene controller', weight: 0.95 },
]);

export default JSK_PRODUCT_ALIASES;
