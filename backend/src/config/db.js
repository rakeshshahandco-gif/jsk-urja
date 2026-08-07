import './dnsBootstrap.js';
import mongoose from 'mongoose';
import config from './config.js';
import logger from '../utils/logger.js';
import { realtimeSyncPlugin } from '../plugins/realtimeSync.plugin.js';
import { tenantSchemaPlugin } from '../plugins/tenantSchema.plugin.js';
import {
    assertSafeMongoUrl,
    assertSafeMongoDatabase,
} from '../utils/mongoDatabaseGuard.js';

// Register global schema plugins before any models load (import order in index.js).
mongoose.plugin(tenantSchemaPlugin);
mongoose.plugin(realtimeSyncPlugin);

export const connectDB = async () => {
    try {
        // Refuse staging/dev → jskurja-prod before any connection attempt.
        assertSafeMongoUrl(config.mongoose.url, {
            appEnv: config.appEnv,
            nodeEnv: config.env,
        });

        logger.info('🔄 Connecting to MongoDB...');
        // Redacted host only — never log full URI or credentials.
        try {
            const redacted = config.mongoose.url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
            const hostPart = redacted.split('@')[1]?.split('/')[0] || '(host-redacted)';
            logger.info(`Mongo target host: ${hostPart}`);
        } catch {
            logger.info('Mongo target host: (redacted)');
        }

        const conn = await mongoose.connect(config.mongoose.url, config.mongoose.options);

        assertSafeMongoDatabase({
            appEnv: config.appEnv,
            nodeEnv: config.env,
            databaseName: conn.connection.name,
        });

        logger.info('✅ MongoDB Connected Successfully!');
        logger.info(`📍 Database Host: ${conn.connection.host}`);
        logger.info(`💾 Database Name: ${conn.connection.name}`);
        logger.info(`📊 Collections: ${Object.keys(conn.connection.collections).join(', ') || 'None yet'}`);
        logger.info(`APP_ENV: ${config.appEnv}`);

        // Log when operations happen
        mongoose.set('debug', (collectionName, method, query, doc) => {
            logger.info(`🔍 MongoDB Query: ${collectionName}.${method}`, JSON.stringify(query));
        });

        return true;
    } catch (error) {
        if (error?.code === 'STAGING_SAFETY_BLOCK' || error?.code === 'DEV_SAFETY_BLOCK') {
            logger.error(error.message);
            throw error;
        }
        logger.error('❌ Error connecting to MongoDB: ' + error.message);
        if (error.stack) {
            logger.debug('Error stack: ' + error.stack);
        }
        logger.warn('⚠️  Server will start without database connection');
        logger.warn('⚠️  Data will not persist. Please set up MongoDB for production use.');
        return false;
    }
};
