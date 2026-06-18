import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const lotIdParams = {
    params: Joi.object({
        id: objectId.required(),
    }),
};

const stageParams = {
    params: Joi.object({
        id: objectId.required(),
        stageIndex: Joi.number().integer().min(0).required(),
    }),
};

export default {
    list: {
        query: Joi.object({
            companyId: objectId.optional(),
            lotStatus: Joi.string().valid('draft', 'in_progress', 'completed', 'cancelled').optional(),
            search: Joi.string().trim().allow('').optional(),
            limit: Joi.number().integer().min(1).max(500).optional(),
        }),
    },
    get: lotIdParams,
    preview: {
        params: Joi.object({
            companyId: objectId.required(),
        }),
    },
    create: {
        body: Joi.object({
            companyId: objectId.required(),
            itemId: objectId.required(),
            qtyStarted: Joi.number().positive().required(),
            batchNo: Joi.string().trim().allow('').optional(),
            lotNo: Joi.string().trim().allow('').optional(),
            financialYearId: objectId.optional(),
        }),
    },
    startStage: {
        ...stageParams,
        body: Joi.object({
            qtyStarted: Joi.number().positive().optional(),
            remarks: Joi.string().trim().allow('').optional(),
        }),
    },
    completeStage: {
        ...stageParams,
        body: Joi.object({
            qtyCompleted: Joi.number().positive().required(),
            remarks: Joi.string().trim().allow('').optional(),
            attachmentUrl: Joi.string().trim().allow('').optional(),
            attachmentName: Joi.string().trim().allow('').optional(),
        }),
    },
    skipStage: {
        ...stageParams,
        body: Joi.object({
            remarks: Joi.string().trim().allow('').optional(),
        }),
    },
};
