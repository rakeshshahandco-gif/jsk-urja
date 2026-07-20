import dotenv from 'dotenv';
import path from 'path';
import Joi from 'joi';

// Capture shell/platform PORT before any dotenv load (Render injects PORT; local tests may set PORT=10000).
const portFromShell = process.env.PORT;

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

// Localhost .env.local only — never on Render/production (would override Render's PORT).
const isManagedHost = Boolean(
    process.env.RENDER
    || process.env.RENDER_SERVICE_ID
    || process.env.NODE_ENV === 'production'
);
if (!isManagedHost) {
    dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });
    dotenv.config({ path: path.join(process.cwd(), 'backend', '.env.local'), override: true });
}

// Prefer explicit process PORT (Render or shell) over file defaults.
if (portFromShell !== undefined && String(portFromShell).trim() !== '') {
    process.env.PORT = portFromShell;
}

const envSchema = Joi.object().keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    // Local JSK default 5100; Render always injects process.env.PORT
    PORT: Joi.number().default(5100),
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
