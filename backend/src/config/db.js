import mongoose from 'mongoose';
import config from './config.js';
import logger from '../utils/logger.js';

export const connectDB = async () => {
    try {
        logger.info('🔄 Connecting to MongoDB...');
        logger.info(`Connection URL: ${config.mongoose.url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`); // Hide password

        const conn = await mongoose.connect(config.mongoose.url, config.mongoose.options);

        logger.info('✅ MongoDB Connected Successfully!');
        logger.info(`📍 Database Host: ${conn.connection.host}`);
        logger.info(`💾 Database Name: ${conn.connection.name}`);
        logger.info(`📊 Collections: ${Object.keys(conn.connection.collections).join(', ') || 'None yet'}`);

        // Log when operations happen
        mongoose.set('debug', (collectionName, method, query, doc) => {
            logger.info(`🔍 MongoDB Query: ${collectionName}.${method}`, JSON.stringify(query));
        });

        return true;

    } catch (error) {
        logger.error('❌ Error connecting to MongoDB: ' + error.message);
        if (error.stack) {
            logger.debug('Error stack: ' + error.stack);
        }
        logger.warn('⚠️  Server will start without database connection');
        logger.warn('⚠️  Data will not persist. Please set up MongoDB for production use.');
        return false;
    }
};
