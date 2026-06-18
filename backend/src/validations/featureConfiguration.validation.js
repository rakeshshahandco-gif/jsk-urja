import Joi from 'joi';

const customDefinition = Joi.object({
    featureKey: Joi.string().required(),
    featureName: Joi.string().required(),
    module: Joi.string().required(),
    category: Joi.string().valid('module', 'compliance', 'customer', 'supplier', 'industry').required(),
    industry: Joi.string().allow('', null),
    defaultEnabled: Joi.boolean().optional(),
    required: Joi.boolean().optional(),
});

export default {
    saveConfiguration: {
        body: Joi.object({
            overrides: Joi.object().pattern(Joi.string(), Joi.boolean()).optional(),
            customDefinitions: Joi.array().items(customDefinition).optional(),
            industryFieldValues: Joi.object().optional(),
        }).min(1),
    },
};
