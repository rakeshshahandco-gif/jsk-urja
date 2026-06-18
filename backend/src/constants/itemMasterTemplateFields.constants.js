/**
 * Phase 4 — Item Master fields controlled by Industry Template.
 */
import { normalizeFieldRule, mergeFieldRules } from './customerMasterTemplateFields.constants.js';

export const ITEM_MASTER_TEMPLATE_FIELDS = [
    { key: 'itemName', featureKey: null, label: 'Item Name', formField: 'itemName', group: 'basic' },
    { key: 'itemCode', featureKey: null, label: 'Item Code', formField: 'itemCode', group: 'basic' },
    { key: 'itemGroup', featureKey: null, label: 'Item Group', formField: 'itemGroupName', group: 'basic' },
    { key: 'category', featureKey: null, label: 'Category', formField: 'itemCategory', group: 'basic' },
    { key: 'hsnSac', featureKey: null, label: 'HSN/SAC', formField: 'hsnCode', group: 'basic' },
    { key: 'uom', featureKey: null, label: 'UOM', formField: 'uom', group: 'basic' },
    { key: 'gstRate', featureKey: null, label: 'GST Rate', formField: 'purchaseGst', group: 'purchase', hasDefault: true, defaultValue: 18 },
    { key: 'purchaseRate', featureKey: null, label: 'Purchase Rate', formField: 'purchaseRate', group: 'purchase', hasDefault: true, defaultValue: 0 },
    { key: 'salesRate', featureKey: null, label: 'Sales Rate', formField: 'sellingPrice', group: 'sales', hasDefault: true, defaultValue: 0 },
    { key: 'openingStock', featureKey: null, label: 'Opening Stock', formField: 'openingStock', group: 'stock', hasDefault: true, defaultValue: 0 },
    { key: 'minStock', featureKey: null, label: 'Minimum Stock', formField: 'minStockLevel', group: 'stock', hasDefault: true, defaultValue: 0 },
    { key: 'maxStock', featureKey: null, label: 'Maximum Stock', formField: 'maxStockLevel', group: 'stock', hasDefault: true, defaultValue: 0 },
    { key: 'reorderLevel', featureKey: null, label: 'Reorder Level', formField: 'minStockLevel', group: 'stock', hasDefault: true, defaultValue: 0 },
    { key: 'description', featureKey: null, label: 'Description', formField: 'description', group: 'basic' },
    { key: 'activeInactive', featureKey: null, label: 'Active / Inactive', formField: 'isActive', group: 'basic' },
    { key: 'pointsLeads', featureKey: null, label: 'Points (Leads)', formField: 'points', group: 'basic' },
    { key: 'wattage', featureKey: null, label: 'Wattage', formField: 'technical.wattage', group: 'technical' },
    { key: 'voltage', featureKey: null, label: 'Voltage', formField: 'technical.inputVoltage', group: 'technical' },
    { key: 'current', featureKey: null, label: 'Current', formField: 'technical.outputCurrent', group: 'technical' },
    { key: 'driverType', featureKey: null, label: 'Driver Type', formField: 'driverType', group: 'technical' },
    { key: 'dimmingType', featureKey: null, label: 'Dimming Type', formField: 'technical.dimmingType', group: 'technical' },
    { key: 'cct', featureKey: null, label: 'CCT', formField: 'cct', group: 'technical' },
    { key: 'outputVoltage', featureKey: null, label: 'Output Voltage', formField: 'technical.outputVoltage', group: 'technical' },
    { key: 'outputCurrent', featureKey: null, label: 'Output Current', formField: 'technical.outputCurrent', group: 'technical' },
    { key: 'daliType', featureKey: null, label: 'DALI Type', formField: 'daliType', group: 'technical' },
    { key: 'warranty', featureKey: null, label: 'Warranty', formField: 'warrantyMonths', group: 'sales', hasDefault: true, defaultValue: 0 },
    { key: 'bomApplicable', featureKey: null, label: 'BOM Applicable', formField: 'isManufacturable', group: 'production' },
    { key: 'fabricType', featureKey: null, label: 'Fabric Type', formField: 'textile.fabricType', group: 'textile' },
    { key: 'quality', featureKey: null, label: 'Quality', formField: 'textile.quality', group: 'textile' },
    { key: 'gsm', featureKey: null, label: 'GSM', formField: 'textile.gsm', group: 'textile' },
    { key: 'width', featureKey: null, label: 'Width', formField: 'textile.width', group: 'textile' },
    { key: 'colour', featureKey: null, label: 'Colour', formField: 'textile.colour', group: 'textile' },
    { key: 'designNo', featureKey: null, label: 'Design No', formField: 'textile.designNo', group: 'textile' },
    { key: 'pattern', featureKey: null, label: 'Pattern', formField: 'textile.pattern', group: 'textile' },
    { key: 'season', featureKey: null, label: 'Season', formField: 'textile.season', group: 'textile' },
    { key: 'brand', featureKey: null, label: 'Brand', formField: 'textile.brand', group: 'textile' },
    { key: 'shade', featureKey: null, label: 'Shade', formField: 'textile.shade', group: 'textile' },
    { key: 'lotNo', featureKey: null, label: 'Lot No', formField: 'textile.lotNo', group: 'textile' },
    { key: 'rollNo', featureKey: null, label: 'Roll No', formField: 'textile.rollNo', group: 'textile' },
    { key: 'than', featureKey: null, label: 'Than', formField: 'textile.than', group: 'textile' },
    { key: 'meter', featureKey: null, label: 'Meter', formField: 'textile.meter', group: 'textile' },
    { key: 'barcodeRequired', featureKey: null, label: 'Barcode Required', formField: 'textile.barcodeRequired', group: 'textile' },
    { key: 'textileItemImages', featureKey: 'inventory.textileItemImagesRequired', label: 'Textile Images', formField: null, group: 'textileImages' },
    { key: 'exportHsn', featureKey: null, label: 'Export HSN', formField: 'exportHsn', group: 'exporter' },
    { key: 'countryOfOrigin', featureKey: null, label: 'Country of Origin', formField: 'countryOfOrigin', group: 'exporter' },
    { key: 'currency', featureKey: null, label: 'Currency', formField: 'currency', group: 'exporter' },
    { key: 'exportDescription', featureKey: null, label: 'Export Description', formField: 'exportDescription', group: 'exporter' },
    { key: 'packingType', featureKey: null, label: 'Packing Type', formField: 'packingType', group: 'exporter' },
];

export const ITEM_TEMPLATE_FIELD_KEYS = ITEM_MASTER_TEMPLATE_FIELDS.map((f) => f.key);

export function getItemMasterFieldDef(key) {
    return ITEM_MASTER_TEMPLATE_FIELDS.find((f) => f.key === key) || null;
}

export { normalizeFieldRule, mergeFieldRules };
