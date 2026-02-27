import Joi from 'joi';

const createWorkOrderSchema = Joi.object({
    bomId: Joi.string().required(),
    targetQty: Joi.number().min(1).required(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').default('Medium'),
    plannedStart: Joi.date().optional().allow(null, ''),
    plannedEnd: Joi.date().optional().allow(null, ''),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
});

const updateWorkOrderSchema = Joi.object({
    targetQty: Joi.number().min(1).optional(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').optional(),
    plannedStart: Joi.date().optional().allow(null, ''),
    plannedEnd: Joi.date().optional().allow(null, ''),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    status: Joi.string().valid('On Hold', 'Released').optional(),
});

const updateStageSchema = Joi.object({
    status: Joi.string().valid('Running', 'Completed', 'QC Hold', 'Failed', 'Rework').required(),
    operator: Joi.string().optional().allow(''),
    line: Joi.string().optional().allow(''),
    inputQty: Joi.number().min(0).optional(),
    outputQty: Joi.number().min(0).optional(),
    reworkQty: Joi.number().min(0).optional(),
    rejectionQty: Joi.number().min(0).optional(),
    rejectionReason: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    productionLogs: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional().allow(''),
            startTime: Joi.date().optional().allow(null, ''),
            endTime: Joi.date().optional().allow(null, ''),
            operator: Joi.string().optional().allow(''),
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

export {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    updateStageSchema,
    updateMaterialStatusSchema,
};
