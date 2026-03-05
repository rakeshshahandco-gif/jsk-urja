import Joi from 'joi';

const createPOSchema = Joi.object({
    poDate: Joi.date().optional(),
    supplierId: Joi.string().required(),
    expectedDeliveryDate: Joi.date().optional().allow(null),
});

const testData1 = {
    supplierId: "123",
    poDate: "",
    expectedDeliveryDate: ""
};

const result1 = createPOSchema.validate(testData1, { allowUnknown: true });
console.log("Empty Strings:", result1.error ? result1.error.details[0].message : "Valid");

const testData2 = {
    supplierId: "123",
    poDate: undefined,
    expectedDeliveryDate: null
};

const result2 = createPOSchema.validate(testData2, { allowUnknown: true });
console.log("Undefined/Null:", result2.error ? result2.error.details[0].message : "Valid");
