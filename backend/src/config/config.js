import dotenv from 'dotenv';
import path from 'path';
import Joi from 'joi';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const envSchema = Joi.object().keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(5000),
    MONGODB_URL: Joi.string().optional().description('Mongo DB url (preferred)'),
    MONGO_URI: Joi.string().optional().description('Mongo DB url (alias)'),
    MONGODB_URI: Joi.string().optional().description('Mongo DB url (alias)'),
}).unknown();

const { value: envVars, error } = envSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
    throw new Error(`Config validation error: ${error.message}`);
}

const mongoUrl = envVars.MONGODB_URL || envVars.MONGO_URI || envVars.MONGODB_URI;
if (!mongoUrl) {
    throw new Error('Config validation error: MONGODB_URL, MONGO_URI, or MONGODB_URI is required');
}

export default {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    mongoose: {
        url: mongoUrl,
        options: {
            // Prefer IPv4 for Atlas replica hostnames (helps ENOTFOUND on some Windows networks)
            family: 4,
            serverSelectionTimeoutMS: 20000,
        },
    },
};
