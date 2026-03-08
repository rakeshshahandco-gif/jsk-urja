import Joi from 'joi';

const createWorkOrderSchema = Joi.object({
    woNumber: Joi.string().optional().allow(''),
    bomId: Joi.string().required(),
    targetQty: Joi.number().min(1).required(),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').default('Medium'),
    plannedStart: Joi.date().optional().allow(null, ''),
    plannedEnd: Joi.date().optional().allow(null, ''),
    supervisor: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
});

const testData = {
    woNumber: 'TEST-123',
    bomId: '69a683e528a912b8ecd20496',
    targetQty: 100,
    priority: 'Medium',
    plannedStart: '2026-03-08',
    plannedEnd: '2026-03-10',
    supervisor: 'Test',
    remarks: 'Test remarks'
};

const { error, value } = createWorkOrderSchema.validate(testData);
if (error) {
    console.error('Validation Error:', error.details[0].message);
} else {
    console.log('Validation Success:', value);
}
