import Joi from 'joi';

const settingsBody = Joi.object({
    enableCreditPeriod: Joi.boolean().optional(),
    enableGracePeriod: Joi.boolean().optional(),
    enableCustomerType: Joi.boolean().optional(),
    enableTcsApplicable: Joi.boolean().optional(),
    enableCreditLimit: Joi.boolean().optional(),
    enablePaymentTerms: Joi.boolean().optional(),
    enableInterestApplicable: Joi.boolean().optional(),
    enableCollectionPerson: Joi.boolean().optional(),
    enableRiskCategory: Joi.boolean().optional(),
}).min(1);

const createCustomerType = {
    body: Joi.object({
        name: Joi.string().trim().min(1).max(80).required(),
    }),
};

export default {
    saveSettings: { body: settingsBody },
    createCustomerType,
};
