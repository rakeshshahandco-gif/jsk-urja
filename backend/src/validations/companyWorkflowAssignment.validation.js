import Joi from 'joi';

const objectId = Joi.string().hex().length(24);

const companyIdParams = {
    params: Joi.object({
        companyId: objectId.required(),
    }),
};

const assignBody = {
    ...companyIdParams,
    body: Joi.object({
        assignedWorkflowRef: objectId.allow(null, '').optional(),
        activeWorkflow: Joi.boolean().optional(),
        useSuggestedDefault: Joi.boolean().optional(),
    }).min(1),
};

const listOptionsQuery = {
    ...companyIdParams,
    query: Joi.object({
        industryTemplateRef: objectId.optional(),
    }),
};

export default {
    get: companyIdParams,
    assign: assignBody,
    listOptions: listOptionsQuery,
};
