/**
 * Safe application identity for health / localhost guards.
 * Never expose Mongo URI or secrets.
 */
import mongoose from 'mongoose';
import { extractDatabaseNameFromUrl } from './mongoDatabaseGuard.js';

export function getLocalAppIdentity({ mongoUrl = '', port = 0 } = {}) {
    const applicationKey = String(process.env.APPLICATION_KEY || process.env.LOCAL_APP_KEY || '').trim();
    const industryType = String(process.env.INDUSTRY_TYPE || process.env.LOCAL_INDUSTRY_TYPE || '').trim();
    const environment = String(process.env.NODE_ENV || 'development').trim();
    const appEnv = String(process.env.APP_ENV || environment).trim().toLowerCase() || environment;
    const dbFromConn = mongoose.connection?.readyState === 1 ? mongoose.connection.name : '';
    const databaseName =
        dbFromConn || extractDatabaseNameFromUrl(mongoUrl) || '(unknown)';

    return {
        status: 'ok',
        environment,
        appEnv,
        applicationKey: applicationKey || '(unset)',
        industryType: industryType || '(unset)',
        port: Number(port) || Number(process.env.PORT) || 0,
        databaseName: databaseName || '(unknown)',
    };
}

export default getLocalAppIdentity;

export default getLocalAppIdentity;
