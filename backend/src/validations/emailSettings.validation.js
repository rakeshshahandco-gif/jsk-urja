import Joi from 'joi';
import { EMAIL_PROVIDERS } from '../constants/emailProvider.constants.js';

const objectId = Joi.string().hex().length(24);

const settings = {
    body: Joi.object().keys({
        provider: Joi.string().valid(...EMAIL_PROVIDERS),
        smtpHost: Joi.string().allow(''),
        smtpPort: Joi.number().min(1).max(65535),
        smtpSecure: Joi.boolean(),
        authUser: Joi.string().allow(''),
        authPass: Joi.string().allow(''),
        fromEmail: Joi.string().email().allow(''),
        senderName: Joi.string().allow(''),
        replyTo: Joi.string().email().allow(''),
    }),
};

const testConnection = {
    body: Joi.object().keys({
        provider: Joi.string().valid(...EMAIL_PROVIDERS),
        smtpHost: Joi.string().allow(''),
        smtpPort: Joi.number().min(1).max(65535),
        smtpSecure: Joi.boolean(),
        authUser: Joi.string().allow(''),
        authPass: Joi.string().allow(''),
        fromEmail: Joi.string().email().allow(''),
        senderName: Joi.string().allow(''),
        replyTo: Joi.string().email().allow(''),
    }),
};

export default { settings, testConnection };
