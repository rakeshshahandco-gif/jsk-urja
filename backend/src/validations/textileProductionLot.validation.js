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
    eligibility: {
        params: Joi.object({
            companyId: objectId.required(),
        }),
    },
    list: {
        query: Joi.object({
            companyId: objectId.optional(),
            lotStatus: Joi.string().valid('draft', 'in_progress', 'completed', 'cancelled').optional(),
            search: Joi.string().trim().allow('').optional(),
            limit: Joi.number().integer().min(1).max(500).optional(),
        }),
    },
    get: lotIdParams,
    report: lotIdParams,
    create: {
        body: Joi.object({
            companyId: objectId.required(),
            itemId: objectId.required(),
            meter: Joi.number().positive().required(),
            rollNo: Joi.string().trim().allow('').optional(),
            batchNo: Joi.string().trim().allow('').optional(),
            fabricName: Joi.string().trim().allow('').optional(),
            fabricQuality: Joi.string().trim().allow('').optional(),
            fabricType: Joi.string().trim().allow('').optional(),
            gsm: Joi.number().min(0).allow(null).optional(),
            width: Joi.number().min(0).allow(null).optional(),
            barcode: Joi.string().trim().allow('').optional(),
            colour: Joi.string().trim().allow('').optional(),
            shade: Joi.string().trim().allow('').optional(),
            remarks: Joi.string().trim().allow('').optional(),
            financialYearId: objectId.optional(),
        }),
    },
    dyeingIssue: {
        ...lotIdParams,
        body: Joi.object({
            meterIssued: Joi.number().positive().required(),
            dyeingChallanNo: Joi.string().trim().allow('').optional(),
            dyerName: Joi.string().trim().allow('').optional(),
            vendorWorker: Joi.string().trim().allow('').optional(),
            processName: Joi.string().trim().allow('').optional(),
            rateType: Joi.string().trim().allow('').optional(),
            rateApplied: Joi.number().min(0).optional(),
            rateMasterId: Joi.string().hex().length(24).allow(null).optional(),
            remarks: Joi.string().trim().allow('').optional(),
        }),
    },
    dyeingReturn: {
        ...lotIdParams,
        body: Joi.object({
            meterReturned: Joi.number().positive().required(),
            dyeingChallanNo: Joi.string().trim().allow('').optional(),
            dyerName: Joi.string().trim().allow('').optional(),
            remarks: Joi.string().trim().allow('').optional(),
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
            qtyCompleted: Joi.number().positive().optional(),
            remarks: Joi.string().trim().allow('').optional(),
            vendorWorker: Joi.string().trim().allow('').optional(),
            processName: Joi.string().trim().allow('').optional(),
            partyType: Joi.string().valid('vendor', 'worker').optional(),
            rateType: Joi.string().trim().allow('').optional(),
            rateApplied: Joi.number().min(0).optional(),
            rateMasterId: Joi.string().hex().length(24).allow(null).optional(),
        }),
    },
};
