import Joi from 'joi';
import {
    TEXTILE_TRANSFORMATION_PROCESSES,
    TEXTILE_CONVERSION_UOMS,
    TEXTILE_FORMULA_TYPES,
} from '../constants/textileConversion.constants.js';

const objectId = Joi.string().hex().length(24);

const traceabilityBody = Joi.object({
    lotNo: Joi.string().allow('').optional(),
    rollNo: Joi.string().allow('').optional(),
    barcode: Joi.string().allow('').optional(),
    vendor: Joi.string().allow('').optional(),
    worker: Joi.string().allow('').optional(),
});

const masterBody = {
    conversionName: Joi.string().trim().min(1).required(),
    inputItemId: objectId.required(),
    inputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).required(),
    outputItemId: objectId.required(),
    outputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).required(),
    formulaType: Joi.string().valid(...TEXTILE_FORMULA_TYPES).optional(),
    inputQtyPerOutput: Joi.number().min(0).optional(),
    expectedOutputQty: Joi.number().min(0).optional(),
    expectedLossPercent: Joi.number().min(0).max(100).optional(),
    remarks: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
    companyId: objectId.optional(),
};

export default {
    eligibility: {
        query: Joi.object({ companyId: objectId.optional() }),
    },
    listMasters: {
        query: Joi.object({
            companyId: objectId.optional(),
            isActive: Joi.string().valid('true', 'false').optional(),
            inputItemId: objectId.optional(),
            outputItemId: objectId.optional(),
            search: Joi.string().allow('').optional(),
        }),
    },
    getMaster: {
        params: Joi.object({ id: objectId.required() }),
        query: Joi.object({ companyId: objectId.optional() }),
    },
    createMaster: {
        body: Joi.object(masterBody),
    },
    updateMaster: {
        params: Joi.object({ id: objectId.required() }),
        body: Joi.object({
            ...masterBody,
            conversionName: Joi.string().trim().min(1).optional(),
            inputItemId: objectId.optional(),
            inputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).optional(),
            outputItemId: objectId.optional(),
            outputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).optional(),
        }).min(1),
    },
    removeMaster: {
        params: Joi.object({ id: objectId.required() }),
        query: Joi.object({ companyId: objectId.optional() }),
    },
    preview: {
        body: Joi.object({
            companyId: objectId.optional(),
            conversionMasterId: objectId.optional(),
            inputQty: Joi.number().min(0).required(),
            outputQty: Joi.number().min(0).optional(),
            formulaType: Joi.string().valid(...TEXTILE_FORMULA_TYPES).optional(),
            inputQtyPerOutput: Joi.number().min(0).optional(),
            inputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).optional(),
            outputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).optional(),
        }),
    },
    listEntries: {
        query: Joi.object({
            companyId: objectId.optional(),
            status: Joi.string().valid('ACTIVE', 'CANCELLED').optional(),
            process: Joi.string().valid(...TEXTILE_TRANSFORMATION_PROCESSES).optional(),
            lotNo: Joi.string().allow('').optional(),
            fromDate: Joi.date().optional(),
            toDate: Joi.date().optional(),
            search: Joi.string().allow('').optional(),
        }),
    },
    getEntry: {
        params: Joi.object({ id: objectId.required() }),
        query: Joi.object({ companyId: objectId.optional() }),
    },
    createEntry: {
        body: Joi.object({
            companyId: objectId.optional(),
            date: Joi.date().optional(),
            process: Joi.string().valid(...TEXTILE_TRANSFORMATION_PROCESSES).required(),
            inputItemId: objectId.required(),
            inputQty: Joi.number().greater(0).required(),
            inputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).required(),
            outputItemId: objectId.required(),
            outputQty: Joi.number().min(0).optional(),
            outputUom: Joi.string().valid(...TEXTILE_CONVERSION_UOMS).required(),
            conversionMasterId: objectId.optional().allow(null),
            lossQty: Joi.number().min(0).optional(),
            lossPercent: Joi.number().min(0).max(100).optional(),
            remarks: Joi.string().allow('').optional(),
            traceability: traceabilityBody.optional(),
            productionLotId: objectId.optional().allow(null),
            financialYear: Joi.string().allow('').optional(),
        }),
    },
    cancelEntry: {
        params: Joi.object({ id: objectId.required() }),
        query: Joi.object({ companyId: objectId.optional() }),
    },
    chainReport: {
        query: Joi.object({ companyId: objectId.optional() }),
    },
};
