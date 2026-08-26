import Joi from 'joi';

const textileFieldsSchema = Joi.object({
    designNo: Joi.string().optional().allow(''),
    colour: Joi.string().optional().allow(''),
    size: Joi.string().optional().allow(''),
    requiredFabricMeter: Joi.number().min(0).optional().allow(null, ''),
    fabricItemId: Joi.string().optional().allow('', null),
    fabricItemName: Joi.string().optional().allow(''),
    lotNo: Joi.string().optional().allow(''),
    thanNo: Joi.string().optional().allow(''),
    rollNo: Joi.string().optional().allow(''),
    processRoute: Joi.string().optional().allow(''),
    assignedVendorWorker: Joi.string().optional().allow(''),
});

const createWorkOrderSchema = Joi.object({
    woNumber: Joi.string().optional().allow(''),
    bomId: Joi.string().required(),
    targetQty: Joi.number().min(1).required(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').default('Medium'),
    plannedStart: Joi.date().optional().allow(null, ''),
    plannedEnd: Joi.date().optional().allow(null, ''),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    textile: textileFieldsSchema.optional(),
});

const updateWorkOrderSchema = Joi.object({
    targetQty: Joi.number().min(1).optional(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').optional(),
    plannedStart: Joi.date().optional().allow(null, ''),
    plannedEnd: Joi.date().optional().allow(null, ''),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    status: Joi.string().valid('On Hold', 'Released').optional(),
    textile: textileFieldsSchema.optional(),
});

const updateStageSchema = Joi.object({
    status: Joi.string().valid('Running', 'Completed', 'QC Hold', 'Failed', 'Rework').required(),
    inputQty: Joi.number().min(0).optional(),
    outputQty: Joi.number().min(0).optional(),
    reworkQty: Joi.number().min(0).optional(),
    rejectionQty: Joi.number().min(0).optional(),
    rejectionReason: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    productionLogs: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional().allow(''),
            inputQty: Joi.number().min(0).optional(),
            outputQty: Joi.number().min(0).optional(),
            reworkQty: Joi.number().min(0).optional(),
            rejectionQty: Joi.number().min(0).optional(),
            rejectionReason: Joi.string().optional().allow(''),
        })
    ).optional(),
    checklist: Joi.array().items(
        Joi.object({
            item: Joi.string().required(),
            result: Joi.string().valid('Pending', 'Pass', 'Fail').required(),
            remarks: Joi.string().optional().allow(''),
        })
    ).optional(),
    testData: Joi.object({
        inputVoltageMin: Joi.number().optional().allow(null),
        inputVoltageMax: Joi.number().optional().allow(null),
        outputVoltage: Joi.number().optional().allow(null),
        outputCurrent: Joi.number().optional().allow(null),
        loadPercent: Joi.number().optional().allow(null),
        temperature: Joi.number().optional().allow(null),
        burninMinutes: Joi.number().optional().allow(null),
        result: Joi.string().valid('Pass', 'Fail', 'Pending').optional(),
        resultSummary: Joi.string().optional().allow(''),
        testerName: Joi.string().optional().allow(''),
    }).optional(),
});

const updateMaterialStatusSchema = Joi.object({
    materialUpdates: Joi.array().items(
        Joi.object({
            materialId: Joi.string().required(),
            shortQty: Joi.number().min(0).optional(),
            availableStock: Joi.number().min(0).optional(),
            procurementStatus: Joi.string().valid('Not Ordered', 'Ordered', 'In Transit', 'Received').optional(),
            isMandatory: Joi.boolean().optional(),
            alternateAvailable: Joi.boolean().optional(),
            remarks: Joi.string().optional().allow(''),
        })
    ).required(),
    eta: Joi.date().optional().allow(null, ''),
});

const createSectionWorkOrderSchema = Joi.object({
    bomSectionNo: Joi.number().integer().min(1).required(),
    targetQty: Joi.number().min(1).optional(),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    requiredQtyPerFinishedUnit: Joi.number().min(0).optional(),
    isMandatory: Joi.boolean().optional(),
    plannedStart: Joi.date().optional().allow(null, ''),
});

const updateSectionConfigSchema = Joi.object({
    enabled: Joi.boolean().optional(),
    sections: Joi.array().items(
        Joi.object({
            bomSectionNo: Joi.number().integer().min(1).required(),
            bomSectionName: Joi.string().optional().allow(''),
            requiredQtyPerFinishedUnit: Joi.number().min(0).default(1),
            isMandatory: Joi.boolean().default(true),
        })
    ).min(1).required(),
});

const addProductionLogSchema = Joi.object({
    date: Joi.date().required(),
    shift: Joi.string().optional().allow(''),
    operator: Joi.string().optional().allow(''),
    inputQty: Joi.number().min(0).optional(),
    outputQty: Joi.number().min(0).optional(),
    reworkQty: Joi.number().min(0).default(0),
    rejectionQty: Joi.number().min(0).default(0),
    rejectionReason: Joi.string().optional().allow(''),

    // QC specific details
    qcPassedQty: Joi.number().min(0).optional(),
    qcRejectedQty: Joi.number().min(0).optional(),
    qcReworkQty: Joi.number().min(0).optional(),

    // Missing components
    missingComponents: Joi.array().items(
        Joi.object({
            itemId: Joi.string().required(),
            itemCode: Joi.string().optional().allow(''),
            itemName: Joi.string().optional().allow(''),
            quantity: Joi.number().min(0).required(),
            remarks: Joi.string().optional().allow(''),
        })
    ).optional(),

    remarks: Joi.string().optional().allow(''),
});

export {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    updateStageSchema,
    updateMaterialStatusSchema,
    addProductionLogSchema,
    createSectionWorkOrderSchema,
    updateSectionConfigSchema,
};
