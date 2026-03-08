import Joi from 'joi';

const piItemJoi = Joi.object({
    itemId: Joi.string().required(),
    itemName: Joi.string().required(),
    qty: Joi.number().min(0).required(),
    rate: Joi.number().min(0).required(),
});

const baseSchema = Joi.object({
    flowType: Joi.string().required(),
    supplierId: Joi.string().required(),
    // Current problematic field
    poDate: Joi.alternatives().try(
        Joi.date(),
        Joi.string().allow('', null, '—')
    ).optional(),
    items: Joi.array().items(piItemJoi).min(1).required(),
});

const testData = {
    flowType: 'Direct Invoice',
    supplierId: '65a1234567890abcdef12345',
    poDate: null, // Test with null
    items: [{ itemId: 'item1', itemName: 'Item 1', qty: 10, rate: 100 }]
};

const testDataEmpty = {
    flowType: 'Direct Invoice',
    supplierId: '65a1234567890abcdef12345',
    poDate: '', // Test with empty string
    items: [{ itemId: 'item1', itemName: 'Item 1', qty: 10, rate: 100 }]
};

const testDataMissing = {
    flowType: 'Direct Invoice',
    supplierId: '65a1234567890abcdef12345',
    items: [{ itemId: 'item1', itemName: 'Item 1', qty: 10, rate: 100 }]
};

console.log('Testing null:', baseSchema.validate(testData).error?.details[0]?.message || 'OK');
console.log('Testing empty string:', baseSchema.validate(testDataEmpty).error?.details[0]?.message || 'OK');
console.log('Testing missing:', baseSchema.validate(testDataMissing).error?.details[0]?.message || 'OK');
