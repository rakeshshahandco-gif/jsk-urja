import Joi from 'joi';
import { WORKFLOW_STAGE_TYPES } from '../constants/workflowMaster.constants.js';

const objectId = Joi.string().hex().length(24);

const stageSchema = Joi.object({
    _id: objectId.optional(),
    stageName: Joi.string().trim().min(1).required(),
    sequenceNo: Joi.number().integer().min(1).optional(),
    stageType: Joi.string().valid(...WORKFLOW_STAGE_TYPES).optional(),
    allowStart: Joi.boolean().optional(),
    allowComplete: Joi.boolean().optional(),
    allowSkip: Joi.boolean().optional(),
    remarksRequired: Joi.boolean().optional(),
    attachmentRequired: Joi.boolean().optional(),
});

const createBody = {
    body: Joi.object({
        workflowName: Joi.string().trim().min(1).max(120).required(),
        workflowCode: Joi.string().trim().uppercase().max(56).optional(),
        industryTemplateRef: objectId.required(),
        description: Joi.string().allow('').max(500).optional(),
        isActive: Joi.boolean().optional(),
        stages: Joi.array().items(stageSchema).optional(),
    }),
};

const updateBody = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        workflowName: Joi.string().trim().min(1).max(120).optional(),
        workflowCode: Joi.string().trim().uppercase().max(56).optional(),
        industryTemplateRef: objectId.optional(),
        description: Joi.string().allow('').max(500).optional(),
        isActive: Joi.boolean().optional(),
        stages: Joi.array().items(stageSchema).optional(),
    }).min(1),
};

const idParams = {
    params: Joi.object({ id: objectId.required() }),
};

const templateParams = {
    params: Joi.object({ templateId: objectId.required() }),
};

const reorderBody = {
    params: Joi.object({ id: objectId.required() }),
    body: Joi.object({
        stages: Joi.array().items(stageSchema).min(1).required(),
    }),
};

const listQuery = {
    query: Joi.object({
        industryTemplateRef: objectId.optional(),
        isActive: Joi.boolean().optional(),
    }),
};

export default {
    list: listQuery,
    get: idParams,
    getByTemplate: templateParams,
    create: createBody,
    update: updateBody,
    reorder: reorderBody,
    toggle: idParams,
    remove: idParams,
    registry: {},
};
