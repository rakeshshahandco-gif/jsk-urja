/**
 * Development-only localhost application identity (Phase 0).
 * Safe fields only — never expose Mongo URI or secrets.
 */
import mongoose from 'mongoose';

function extractDatabaseName(rawUrl = '') {
    try {
        const normalized = String(rawUrl || '')
            .replace(/^mongodb\+srv:\/\//i, 'https://')
            .replace(/^mongodb:\/\//i, 'http://');
        const parsed = new URL(normalized);
        return decodeURIComponent((parsed.pathname || '/').replace(/^\//, '').split('/')[0] || '') || '(none)';
    } catch {
        return '(unknown)';
    }
}

export function getLocalAppIdentity({ mongoUrl = '', port = 0 } = {}) {
    const applicationKey = String(process.env.APPLICATION_KEY || process.env.LOCAL_APP_KEY || '').trim();
    const industryType = String(process.env.INDUSTRY_TYPE || process.env.LOCAL_INDUSTRY_TYPE || '').trim();
    const environment = String(process.env.NODE_ENV || 'development').trim();
    const dbFromConn = mongoose.connection?.readyState === 1 ? mongoose.connection.name : '';
    const databaseName = dbFromConn || extractDatabaseName(mongoUrl);

    return {
        status: 'ok',
        environment,
        applicationKey: applicationKey || '(unset)',
        industryType: industryType || '(unset)',
        port: Number(port) || Number(process.env.PORT) || 0,
        databaseName: databaseName || '(unknown)',
    };
}

export default getLocalAppIdentity;
