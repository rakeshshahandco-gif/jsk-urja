import Joi from 'joi';
import { TEXTILE_ROUTE_PROCESS_OPTIONS } from '../constants/textileProcessRoute.constants.js';

const stageSchema = Joi.object({
    sequenceNo: Joi.number().min(1).optional(),
    processName: Joi.string().valid(...TEXTILE_ROUTE_PROCESS_OPTIONS).required(),
    customProcessName: Joi.string().allow('').optional(),
    allowSkip: Joi.boolean().optional(),
    remarks: Joi.string().allow('').optional(),
});

export default {
    list: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            isActive: Joi.string().valid('true', 'false').optional(),
            search: Joi.string().optional(),
        }),
    },
    create: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            routeName: Joi.string().required(),
            routeCode: Joi.string().allow('').optional(),
            description: Joi.string().allow('').optional(),
            isActive: Joi.boolean().optional(),
            stages: Joi.array().items(stageSchema).min(1).required(),
        }),
    },
    update: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            routeName: Joi.string().optional(),
            description: Joi.string().allow('').optional(),
            isActive: Joi.boolean().optional(),
            stages: Joi.array().items(stageSchema).min(1).optional(),
        }),
    },
};
