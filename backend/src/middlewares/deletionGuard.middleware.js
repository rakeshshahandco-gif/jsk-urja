/**
 * deletionGuard.middleware.js
 * ============================================================
 * A global safety-net middleware that:
 * 1. Logs every DELETE request to console + AuditLog.
 * 2. Blocks hard-delete on "protected" master data modules
 *    (customers, suppliers, items, etc.) and converts the
 *    request into a soft-delete marker that is handled by
 *    the matching controller.
 *
 * Protected modules will NEVER permanently delete records —
 * they will only set { isDeleted: true, deletedAt, deletedBy }.
 * ============================================================
 */

import { AuditLog } from '../models/auditLog.model.js';

// Modules where DELETE must be SOFT-ONLY (never hard-delete)
const PROTECTED_MODULES = [
    'customers',
    'suppliers',
    'items',
    'itemgroups',
    'itemtypes',
];

/**
 * Attach this middleware BEFORE all routes.
 * It intercepts DELETE requests and:
 *  - Always logs them
 *  - For protected modules: adds req.softDeleteOnly = true
 *    so that downstream controllers know NOT to do a hard delete.
 */
export const deletionGuardMiddleware = async (req, res, next) => {
    if (req.method !== 'DELETE') return next();

    // Extract module name from path  e.g. /api/v1/customers/123 → "customers"
    const pathParts = req.path.replace(/^\/+/, '').split('/');
    // strip "api" and "v1" prefix segments
    const moduleName = (pathParts.find(p => p && !['api', 'v1', 'v2'].includes(p.toLowerCase())) || '').toLowerCase();

    const isProtected = PROTECTED_MODULES.includes(moduleName);

    if (isProtected) {
        // Signal to the controller that only a soft-delete is permitted
        req.softDeleteOnly = true;
        console.warn(
            `🛡️  [DeletionGuard] SOFT-DELETE enforced for module="${moduleName}" path="${req.path}" user="${req.user?.email || 'unknown'}"`,
        );
    }

    // Async audit – fire-and-forget, never block the request
    if (req.user) {
        AuditLog.create({
            user: req.user._id,
            action: 'DELETE',
            module: moduleName || 'unknown',
            resourceId: req.params?.id || undefined,
            description: `DELETE request on ${req.path}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        }).catch(() => {}); // swallow errors silently
    }

    next();
};
