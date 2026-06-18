import Joi from 'joi';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '../constants/textileJobWorkChallan.constants.js';
import { TEXTILE_RETURN_NEXT_ACTIONS } from '../constants/textileProcessOutput.constants.js';

export default {
    available: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            forProcess: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            search: Joi.string().allow('').optional(),
        }),
    },
    consume: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            stockId: Joi.string().required(),
            meterQty: Joi.number().min(0).optional(),
            pcsQty: Joi.number().min(0).optional(),
            targetChallanId: Joi.string().allow('', null).optional(),
            targetChallanNo: Joi.string().allow('').optional(),
            targetProcessType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            vendorName: Joi.string().allow('').optional(),
        }),
    },
    trace: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            barcode: Joi.string().required(),
        }),
    },
    summary: {
        query: Joi.object({
            companyId: Joi.string().optional(),
        }),
    },
    stock: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            status: Joi.string().optional(),
            pendingOnly: Joi.string().valid('true', 'false').optional(),
            search: Joi.string().allow('').optional(),
        }),
    },
    history: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            eventType: Joi.string().allow('').optional(),
            search: Joi.string().allow('').optional(),
            limit: Joi.number().integer().min(1).max(500).optional(),
        }),
    },
    reports: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            search: Joi.string().allow('').optional(),
            limit: Joi.number().integer().min(1).max(500).optional(),
        }),
    },
    nextAction: {
        type: Joi.string().valid(...TEXTILE_RETURN_NEXT_ACTIONS).optional(),
    },
    demoStatus: {
        query: Joi.object({
            companyId: Joi.string().optional(),
        }),
    },
    demoSeed: {
        body: Joi.object({
            companyId: Joi.string().optional(),
        }),
    },
    demoPreview: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            mode: Joi.string().valid('full', 'partial').required(),
            qtyPcs: Joi.number().min(0).optional(),
        }),
    },
    demoTransfer: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            mode: Joi.string().valid('full', 'partial').required(),
            qtyPcs: Joi.number().min(0).optional(),
        }),
    },
    demoReset: {
        body: Joi.object({
            companyId: Joi.string().optional(),
        }),
    },
};
