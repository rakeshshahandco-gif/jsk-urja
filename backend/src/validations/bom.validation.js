import Joi from 'joi';

const objectId = (value, helpers) => {
    if (!value.match(/^[0-9a-fA-F]{24}$/)) {
        return helpers.message('"{{#label}}" must be a valid mongo id');
    }
    return value;
};

const bomComponent = Joi.object().keys({
    itemId: Joi.string().custom(objectId).required(),
    itemCode: Joi.string().allow('').optional(),
    itemName: Joi.string().allow('').optional(),
    category: Joi.string().allow('').optional(),
    uom: Joi.string().allow('').optional(),
    quantity: Joi.number().required().min(0),
    wastagePercentage: Joi.number().min(0).default(0),
    finalQuantity: Joi.number().min(0).default(0),
    rate: Joi.number().min(0).default(0),
    totalCost: Joi.number().min(0).default(0)
});

const createBOM = {
    body: Joi.object().keys({
        bomNumber: Joi.string().allow('').optional(), // If empty, auto-generate
        finishedProductId: Joi.string().custom(objectId).required(),
        version: Joi.string().default('V1'),
        revisionDate: Joi.date().optional(),
        status: Joi.string().valid('Draft', 'Approved', 'Inactive').default('Draft'),
        productionQuantity: Joi.number().required().min(1).default(1),
        bomType: Joi.string().valid('Production', 'Sub-Assembly', 'Service BOM').default('Production'),
        components: Joi.array().items(bomComponent).min(1).required(),
        totalRawMaterialCost: Joi.number().default(0),
        totalProcessCost: Joi.number().default(0),
        overheadCost: Joi.number().default(0),
        labourCost: Joi.number().default(0),
        finalProductionCostPerUnit: Joi.number().default(0),
        processes: Joi.object().keys({
            smtAssembly: Joi.boolean().default(false),
            manualAssembly: Joi.boolean().default(false),
            testingRequired: Joi.boolean().default(false),
            qcRequired: Joi.boolean().default(false),
            packingRequired: Joi.boolean().default(false),
        }).optional(),
        isDefault: Joi.boolean().default(false),
        allowAlternateItems: Joi.boolean().default(false),
        scrapAccount: Joi.string().allow('').optional(),
        remarks: Joi.string().allow('').optional()
    })
};

const getBOMs = {
    query: Joi.object().keys({
        finishedProductId: Joi.string().custom(objectId),
        search: Joi.string().allow('').optional(),
        bomNumber: Joi.string().allow('').optional(),
        status: Joi.string().allow('').optional(),
        bomType: Joi.string().allow('').optional(),
        sortBy: Joi.string().allow('').optional(),
        limit: Joi.number().integer().optional(),
        page: Joi.number().integer().optional(),
    })
};

const getBOM = {
    params: Joi.object().keys({
        id: Joi.string().custom(objectId).required(),
    })
};

const updateBOM = {
    params: Joi.object().keys({
        id: Joi.required().custom(objectId),
    }),
    body: Joi.object().keys({
        bomNumber: Joi.string().uppercase(),
        version: Joi.string(),
        revisionDate: Joi.date(),
        status: Joi.string().valid('Draft', 'Approved', 'Inactive'),
        productionQuantity: Joi.number().min(1),
        bomType: Joi.string().valid('Production', 'Sub-Assembly', 'Service BOM'),
        components: Joi.array().items(bomComponent).min(1),
        totalRawMaterialCost: Joi.number(),
        totalProcessCost: Joi.number(),
        overheadCost: Joi.number(),
        labourCost: Joi.number(),
        finalProductionCostPerUnit: Joi.number(),
        processes: Joi.object().keys({
            smtAssembly: Joi.boolean(),
            manualAssembly: Joi.boolean(),
            testingRequired: Joi.boolean(),
            qcRequired: Joi.boolean(),
            packingRequired: Joi.boolean(),
        }),
        isDefault: Joi.boolean(),
        allowAlternateItems: Joi.boolean(),
        scrapAccount: Joi.string().allow(''),
        remarks: Joi.string().allow('')
    }).min(1)
};

const deleteBOM = {
    params: Joi.object().keys({
        id: Joi.string().custom(objectId).required(),
    })
};

export default {
    createBOM,
    getBOMs,
    getBOM,
    updateBOM,
    deleteBOM
};
