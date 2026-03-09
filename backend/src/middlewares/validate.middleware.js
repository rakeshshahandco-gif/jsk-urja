import Joi from 'joi';
import { ApiError } from '../utils/ApiError.js';
import pick from '../utils/pick.js';

export const validate = (schema) => (req, res, next) => {
    const validSchema = pick(schema, ['params', 'query', 'body']);
    const object = pick(req, Object.keys(validSchema));

    const { value, error } = Joi.compile(validSchema)
        .prefs({ errors: { label: 'key' }, abortEarly: false, allowUnknown: true })
        .validate(object);

    if (error) {
        const errorMessage = error.details.map((details) => details.message).join(', ');
        console.log('Validation Error:', errorMessage, 'Object:', JSON.stringify(object, null, 2));
        return next(new ApiError(400, `DEBUG: ${errorMessage}`));
    }

    Object.assign(req, value);
    return next();
};
