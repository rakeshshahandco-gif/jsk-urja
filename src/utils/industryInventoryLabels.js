/** Central industry-aware labels for Inventory master pages. */

export function resolveIndustryTemplateCode(company) {
    const ref = company?.industryTemplateRef;
    const code = String(ref?.templateCode || '').toUpperCase();
    if (code) return code;
    const name = `${company?.companyName || ''} ${company?.brandName || ''} ${company?.legalName || ''}`.toUpperCase();
    if (/TEXTILE|HANDLOOM/.test(name)) return 'TEXTILE';
    if (name.includes('JSK') && (name.includes('URJA') || name.includes('INNOVATIVE'))) return 'ELECTRONICS_JSK';
    return 'ELECTRONICS_JSK';
}

export function isTextileIndustryCompany(company) {
    const code = resolveIndustryTemplateCode(company);
    if (code === 'TEXTILE' || code === 'HANDLOOM') return true;
    const templateName = String(company?.industryTemplateRef?.templateName || '').toLowerCase();
    return templateName.includes('textile') || templateName.includes('handloom');
}

const ELECTRONICS = {
    itemGroupPlaceholder: 'e.g. Drivers, LED Chips, Controllers, PCB, Components…',
    itemGroupCodePlaceholder: 'DRIVERS',
    itemTypePlaceholder: 'e.g. Electrical, PCB, Housing, Components…',
    itemTypeCodePlaceholder: 'ELECTRICAL',
    itemCategoryHelperText: 'Raw Material, WIP, Finished Goods, Trading, Consumable',
    uomExamples: 'Nos, Pcs, Meter, Kg, Box, Set, Roll',
    itemNamePlaceholder: '12W Phase Cut Dimmable Driver',
    hsnPlaceholder: '8504',
    productDescriptionPlaceholder: 'e.g. High efficiency dimmable LED driver with phase cut dimming',
    serialTrackingHint: 'Enable for items with unique serial numbers (e.g. LED Drivers)',
    machineRequiredPlaceholder: 'e.g. SMT Line, Wave Solder',
    salesSectionTitle: 'Sales Information (Finished Goods)',
    showElectricalToggle: true,
    showElectricalColumn: true,
    itemTypeFilterExamples: [
        { value: '', label: 'All Types' },
        { value: 'ELECTRICAL', label: 'Electrical' },
        { value: 'PCB', label: 'PCB' },
        { value: 'HOUSING', label: 'Housing' },
        { value: 'IC', label: 'IC' },
        { value: 'RESISTOR', label: 'Resistor' },
        { value: 'CAPACITOR', label: 'Capacitor' },
        { value: 'TRANSFORMER', label: 'Transformer' },
        { value: 'WIRE', label: 'Wire' },
        { value: 'PACKAGING', label: 'Packaging' },
        { value: 'FINISHED_PRODUCT', label: 'Finished Product' },
        { value: 'OTHER', label: 'Other' },
    ],
    defaultExamples: {
        itemGroups: ['Drivers', 'LED Chips', 'Controllers', 'PCB', 'Components'],
        itemTypes: ['Electrical', 'PCB', 'Housing', 'Components'],
        itemCategories: ['Raw Material', 'WIP', 'Finished Goods', 'Trading', 'Consumable'],
        uom: ['Nos', 'Pcs', 'Meter', 'Kg', 'Box', 'Set', 'Roll'],
    },
};

const TEXTILE = {
    itemGroupPlaceholder: 'e.g. Raw Fabric, Dyed Fabric, Printed Fabric, Dupatta, Kurti, Suit Set, Accessories, Packing Material…',
    itemGroupCodePlaceholder: 'RAW_FABRIC',
    itemTypePlaceholder: 'e.g. Cotton, Silk, Linen, Rayon, Polyester, Blended Fabric, Dupatta, Kurti, Saree…',
    itemTypeCodePlaceholder: 'COTTON',
    itemCategoryHelperText: 'Raw Material, Semi Finished, Finished Goods, Accessory, Packing Material, Service / Job Work',
    uomExamples: 'Than, Meter, PCS, Set, Pair, KG, Roll',
    itemNamePlaceholder: 'Cotton Saree Fabric 44 inch',
    hsnPlaceholder: '5208',
    productDescriptionPlaceholder: 'e.g. Premium cotton dress material, 44 inch width, suitable for kurti and suit',
    serialTrackingHint: 'Enable for items tracked by roll/than or unique piece numbers',
    machineRequiredPlaceholder: 'e.g. Dyeing Unit, Printing Table, Embroidery Machine',
    salesSectionTitle: 'Sales Information (Finished Goods / Fabric)',
    showElectricalToggle: false,
    showElectricalColumn: false,
    itemTypeFilterExamples: [
        { value: '', label: 'All Types' },
        { value: 'COTTON', label: 'Cotton' },
        { value: 'SILK', label: 'Silk' },
        { value: 'LINEN', label: 'Linen' },
        { value: 'RAYON', label: 'Rayon' },
        { value: 'POLYESTER', label: 'Polyester' },
        { value: 'BLENDED_FABRIC', label: 'Blended Fabric' },
        { value: 'DUPATTA', label: 'Dupatta' },
        { value: 'SUIT_PIECE', label: 'Suit Piece' },
        { value: 'KURTI', label: 'Kurti' },
        { value: 'SAREE', label: 'Saree' },
        { value: 'DRESS_MATERIAL', label: 'Dress Material' },
        { value: 'ACCESSORY', label: 'Accessory' },
        { value: 'PACKING_MATERIAL', label: 'Packing Material' },
        { value: 'JOB_WORK_SERVICE', label: 'Job Work Service' },
        { value: 'OTHER', label: 'Other' },
    ],
    defaultExamples: {
        itemGroups: ['Raw Fabric', 'Grey Fabric', 'Dyed Fabric', 'Printed Fabric', 'Embroidered Fabric', 'Finished Fabric', 'Dupatta', 'Kurti', 'Suit Set', 'Saree', 'Dress Material', 'Accessories', 'Packing Material', 'Job Work / Services'],
        itemTypes: ['Cotton', 'Silk', 'Linen', 'Rayon', 'Polyester', 'Blended Fabric', 'Dupatta', 'Suit Piece', 'Kurti', 'Saree', 'Dress Material', 'Accessory', 'Packing Material', 'Job Work Service'],
        itemCategories: ['Raw Material', 'Semi Finished', 'Finished Goods', 'Accessory', 'Packing Material', 'Service / Job Work'],
        uom: ['Than', 'Meter', 'PCS', 'Set', 'Pair', 'KG', 'Roll'],
    },
};

/** BOM component row — electronics (JSK) vs textile (Handloom). */
export const ELECTRONICS_BOM_COMPONENT_TYPES = [
    { value: 'SMD', label: 'SMD' },
    { value: 'TH', label: 'TH (Through-Hole)' },
    { value: 'OTHER', label: 'Other' },
];

export const TEXTILE_BOM_COMPONENT_TYPES = [
    { value: 'GREY_FABRIC', label: 'Grey Fabric' },
    { value: 'DYED_FABRIC', label: 'Dyed Fabric' },
    { value: 'PRINTED_FABRIC', label: 'Printed Fabric' },
    { value: 'TRIM', label: 'Trim / Accessory' },
    { value: 'PACKING', label: 'Packing Material' },
    { value: 'OTHER', label: 'Other' },
];

export const TEXTILE_BOM_PROCESS_LABELS = {
    smtAssembly: 'Dyeing',
    manualAssembly: 'Printing',
    testingRequired: 'Embroidery',
    qcRequired: 'Stitching / QC',
    packingRequired: 'Packing',
};

export function getBomComponentTypes(isTextile) {
    return isTextile ? TEXTILE_BOM_COMPONENT_TYPES : ELECTRONICS_BOM_COMPONENT_TYPES;
}

export function formatBomProcessLabel(isTextile, key) {
    if (isTextile && TEXTILE_BOM_PROCESS_LABELS[key]) return TEXTILE_BOM_PROCESS_LABELS[key];
    return key.replace(/([A-Z])/g, ' $1').trim();
}

export function getIndustryInventoryLabels(company, industryTemplate = null) {
    const templateCode = String(
        industryTemplate?.templateCode
        || company?.industryTemplateRef?.templateCode
        || resolveIndustryTemplateCode(company)
        || '',
    ).toUpperCase();
    const isTextile = templateCode === 'TEXTILE';
    const src = isTextile ? TEXTILE : ELECTRONICS;
    return {
        templateCode: templateCode || (isTextile ? 'TEXTILE' : 'ELECTRONICS_JSK'),
        isTextile,
        ...src,
    };
}