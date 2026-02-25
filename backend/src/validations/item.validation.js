import Joi from 'joi';

const CATEGORIES = ['RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'TRADING', 'CONSUMABLE'];
const TYPES = ['ELECTRICAL', 'PCB', 'HOUSING', 'IC', 'RESISTOR', 'CAPACITOR', 'TRANSFORMER', 'WIRE', 'PACKAGING', 'FINISHED_PRODUCT', 'OTHER'];
const UOMS = ['NOS', 'PCS', 'METER', 'KG', 'BOX', 'SET', 'ROLL', 'LITRE'];
const DIMMING = ['', 'PHASE_CUT', 'DALI', '0-10V', 'ZIGBEE', 'BLE', 'TRIAC', 'PWM'];

const technicalSchema = Joi.object({
    wattage: Joi.string().allow('').optional(),
    inputVoltage: Joi.string().allow('').optional(),
    outputVoltage: Joi.string().allow('').optional(),
    outputCurrent: Joi.string().allow('').optional(),
    dimmingType: Joi.string().valid(...DIMMING).allow('').optional(),
    ipRating: Joi.string().allow('').optional(),
    surgeProtection: Joi.string().allow('').optional(),
    efficiency: Joi.string().allow('').optional(),
}).optional();

const bodySchema = Joi.object({
    itemCode: Joi.string().allow('').optional(),
    itemName: Joi.string().required().trim(),
    itemGroupName: Joi.string().allow('').optional().trim(),
    itemCategory: Joi.string().valid(...CATEGORIES).required(),
    itemType: Joi.string().allow('').optional(),
    uom: Joi.string().valid(...UOMS).optional(),
    points: Joi.string().allow('').optional(),

    openingStock: Joi.number().min(0).optional(),
    minStockLevel: Joi.number().min(0).optional(),
    maxStockLevel: Joi.number().min(0).optional(),
    valuationRate: Joi.number().min(0).optional(),
    warehouseLocation: Joi.string().allow('').optional(),
    batchTracking: Joi.boolean().optional(),
    serialTracking: Joi.boolean().optional(),

    defaultSupplier: Joi.string().allow('').optional(),
    purchaseRate: Joi.number().min(0).optional(),
    purchaseGst: Joi.number().min(0).max(100).optional(),
    hsnCode: Joi.string().allow('').optional(),
    leadTimeDays: Joi.number().min(0).optional(),

    sellingPrice: Joi.number().min(0).optional(),
    mrp: Joi.number().min(0).optional(),
    warrantyMonths: Joi.number().min(0).optional(),
    salesGst: Joi.number().min(0).max(100).optional(),
    productDescription: Joi.string().allow('').optional(),

    isManufacturable: Joi.boolean().optional(),
    bomLink: Joi.string().allow('').optional(),
    productionTimeHours: Joi.number().min(0).optional(),
    machineRequired: Joi.string().allow('').optional(),
    qcRequired: Joi.boolean().optional(),
    stdProductionCost: Joi.number().min(0).optional(),

    technical: technicalSchema,

    purchaseAccount: Joi.string().allow('').optional(),
    salesAccount: Joi.string().allow('').optional(),
    inventoryAccount: Joi.string().allow('').optional(),
    cogsAccount: Joi.string().allow('').optional(),

    isActive: Joi.boolean().optional(),
    isServiceItem: Joi.boolean().optional(),
    allowNegativeStock: Joi.boolean().optional(),
    remarks: Joi.string().allow('').optional(),
}).unknown(true);

const createItem = { body: bodySchema };
const updateItem = {
    params: Joi.object({ id: Joi.string().required() }),
    body: bodySchema
};
const getItem = { params: Joi.object({ id: Joi.string().required() }) };
const deleteItem = { params: Joi.object({ id: Joi.string().required() }) };
const getItems = {
    query: Joi.object({
        search: Joi.string().allow('').optional(),
        itemCategory: Joi.string().valid(...CATEGORIES).optional(),
        itemType: Joi.string().allow('').optional(),
        isActive: Joi.string().allow('').optional(),
        page: Joi.number().integer().optional(),
        limit: Joi.number().integer().optional(),
        sortBy: Joi.string().allow('').optional(),
    })
};

export default { createItem, updateItem, getItem, deleteItem, getItems };
