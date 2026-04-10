import Joi from 'joi';

const contactPersonSchema = Joi.object().keys({
    name: Joi.string().optional().allow('').trim(),
    mobile: Joi.string().optional().allow('').trim(),
    mobile2: Joi.string().optional().allow('').trim(),
    mobile3: Joi.string().optional().allow('').trim(),
    mobile4: Joi.string().optional().allow('').trim(),
    mobile5: Joi.string().optional().allow('').trim(),
    email: Joi.string().optional().allow('').email().trim().lowercase(),
    isPrimary: Joi.boolean().optional().default(false),
}).unknown(true);

const createCustomer = {
    body: Joi.object().keys({
        customerName: Joi.string().optional().allow('').trim(),
        contactPersons: Joi.array().items(contactPersonSchema).min(1).required().custom((value, helpers) => {
            const primaryCount = value.filter(contact => contact.isPrimary).length;
            if (primaryCount !== 1) {
                return helpers.error('any.custom', { message: 'Exactly one contact person must be marked as primary' });
            }
            return value;
        }).messages({
            'array.min': 'At least one contact person is required',
            'any.custom': 'Exactly one contact person must be marked as primary'
        }),
        companyEmail: Joi.string().optional().allow('').email().trim().lowercase(),
        website: Joi.string().optional().allow('').trim(),
        company: Joi.string().optional().allow('').trim(),
        companyBrand: Joi.string().optional().allow('').trim(),
        city: Joi.string().optional().allow(''),
        district: Joi.string().optional().allow(''),
        taluka: Joi.string().optional().allow(''),
        country: Joi.string().optional().allow(''),
        state: Joi.string().optional().allow(''),
        address: Joi.string().optional().allow(''),
        additionalAddress: Joi.string().optional().allow(''),
        pincode: Joi.string().optional().allow('').trim(),
        customerStatus: Joi.string().valid('hot', 'warm', 'cold', 'active', 'inactive').optional(),
        status: Joi.string().valid('running_high', 'running_low', 'inactive', 'lead').optional(),
        customerType: Joi.string().optional().allow(''),
        sticker: Joi.string().optional().allow(''),
        gstNumber: Joi.string().optional().allow(''),
        gstType: Joi.string().valid('CGST / SGST', 'IGST', '').optional(),
        notes: Joi.string().optional().allow(''),
        tags: Joi.array().items(Joi.string()).optional(),
        stickers: Joi.array().items(Joi.string().hex().length(24)).optional(),
        interestedProducts: Joi.array().items(Joi.string()).optional(),
    }).options({ allowUnknown: true }),
};

const getCustomers = {
    query: Joi.object().keys({
        customerName: Joi.string(),
        status: Joi.string(),
        customerStatus: Joi.string(),
        sortBy: Joi.string(),
        limit: Joi.number().integer().min(1).max(100),
        page: Joi.number().integer().min(1),
        search: Joi.string().allow(''),
    }),
};

const getCustomer = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required().messages({
            'string.length': 'Invalid Customer ID',
            'string.hex': 'Invalid Customer ID format'
        }),
    }),
};

const updateCustomer = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required(),
    }),
    body: Joi.object()
        .keys({
            customerName: Joi.string().optional().allow('').trim(),
            name: Joi.string().optional(), // Allow but don't require name for legacy/compatibility
            company: Joi.string().allow(''),
            companyBrand: Joi.string().allow('').trim(),
            companyEmail: Joi.string().email().allow(''),
            website: Joi.string().allow('').trim(),
            email: Joi.string().email().allow(''),
            mobile: Joi.string().allow(''),
            mobile2: Joi.string().allow(''),
            city: Joi.string().allow(''),
            district: Joi.string().allow(''),
            taluka: Joi.string().allow(''),
            country: Joi.string().allow(''),
            state: Joi.string().allow(''),
            address: Joi.string().allow(''),
            additionalAddress: Joi.string().allow(''),
            pincode: Joi.string().allow('').trim(),
            status: Joi.string().valid('lead', 'running_high', 'running_low', 'inactive'),
            customerType: Joi.string().allow(''),
            sticker: Joi.string().allow(''),
            gstNumber: Joi.string().allow(''),
            gstType: Joi.string().valid('CGST / SGST', 'IGST', '').optional(),
            notes: Joi.string().allow(''),
            tags: Joi.array().items(Joi.string()),
            stickers: Joi.array().items(Joi.string().hex().length(24)),
            interestedProducts: Joi.array().items(Joi.string()).optional(),
            contactPersons: Joi.array().items(contactPersonSchema),
        })
        .min(1)
        .options({ allowUnknown: true }),
};

const deleteCustomer = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required(),
    }),
};

export default {
    createCustomer,
    getCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer,
};
