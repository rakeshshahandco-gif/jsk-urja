import Joi from 'joi';
import { TEXTILE_JOB_WORK_PROCESSES, TEXTILE_RATE_TYPES, TEXTILE_PARTY_TYPES } from '../constants/textileJobWorkRate.constants.js';

const objectId = Joi.string().hex().length(24);

const rateBody = {
    processName: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESSES).required(),
    vendorWorker: Joi.string().trim().min(1).required(),
    partyType: Joi.string().valid(...TEXTILE_PARTY_TYPES).optional(),
    rateType: Joi.string().valid(...TEXTILE_RATE_TYPES).required(),
    defaultRate: Joi.number().min(0).required(),
    effectiveDate: Joi.date().optional(),
    remarks: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
    companyId: objectId.optional(),
    fabricRates: Joi.array().items(
        Joi.object({
            fabricType: Joi.string().trim().required(),
            rate: Joi.number().min(0).required(),
        }),
    ).optional(),
};

export default {
    eligibility: {
        query: Joi.object({ companyId: objectId.optional() }),
    },
    list: {
        query: Joi.object({
            companyId: objectId.optional(),
            processName: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESSES).optional(),
            partyType: Joi.string().valid(...TEXTILE_PARTY_TYPES).optional(),
            isActive: Joi.string().valid('true', 'false').optional(),
            search: Joi.string().allow('').optional(),
        }),
    },
    lookup: {
        query: Joi.object({
            companyId: objectId.optional(),
            processName: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESSES).required(),
            vendorWorker: Joi.string().trim().min(1).required(),
            fabricType: Joi.string().allow('').optional(),
        }),
    },
    create: {
        body: Joi.object(rateBody),
    },
    update: {
        params: Joi.object({ id: objectId.required() }),
        body: Joi.object({
            ...rateBody,
            processName: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESSES).optional(),
            vendorWorker: Joi.string().trim().min(1).optional(),
            rateType: Joi.string().valid(...TEXTILE_RATE_TYPES).optional(),
            defaultRate: Joi.number().min(0).optional(),
        }).min(1),
    },
    remove: {
        params: Joi.object({ id: objectId.required() }),
        query: Joi.object({ companyId: objectId.optional() }),
    },
    reports: {
        query: Joi.object({
            companyId: objectId.optional(),
            fromDate: Joi.date().optional(),
            toDate: Joi.date().optional(),
        }),
    },
};
