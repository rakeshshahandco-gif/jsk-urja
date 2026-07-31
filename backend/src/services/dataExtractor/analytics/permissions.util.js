import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { MODULE_PERM } from './constants.js';

export function hasAnalyticsView(user) {
    return checkUserPermission(user, 'data_extractor.analytics.view')
        || checkUserPermission(user, 'data_extractor.analytics.executive');
}

export function canViewModule(user, moduleKey) {
    const key = MODULE_PERM[moduleKey];
    if (!key) return hasAnalyticsView(user);
    return checkUserPermission(user, key) || checkUserPermission(user, 'data_extractor.analytics.manage');
}

/** Aggregate-only: has executive/view but not the module-specific analytics permission. */
export function isAggregateOnly(user, moduleKey) {
    if (checkUserPermission(user, 'data_extractor.analytics.manage')) return false;
    if (canViewModule(user, moduleKey)) return false;
    return hasAnalyticsView(user);
}

/**
 * Drill-down requires module analytics permission.
 * Source-module view is recommended for record lists but analytics.* is the gate here.
 */
export function canDrillDown(user, moduleKey) {
    return canViewModule(user, moduleKey);
}

export function assertCanExport(user) {
    if (!checkUserPermission(user, 'data_extractor.analytics.export')
        && !checkUserPermission(user, 'data_extractor.analytics.manage')) {
        throw new ApiError(403, 'Missing permission: data_extractor.analytics.export');
    }
}

export function assertCanRefresh(user) {
    if (!checkUserPermission(user, 'data_extractor.analytics.refresh')
        && !checkUserPermission(user, 'data_extractor.analytics.manage')) {
        throw new ApiError(403, 'Missing permission: data_extractor.analytics.refresh');
    }
}

export function assertCanManageViews(user) {
    if (!checkUserPermission(user, 'data_extractor.analytics.manage_views')
        && !checkUserPermission(user, 'data_extractor.analytics.manage')) {
        throw new ApiError(403, 'Missing permission: data_extractor.analytics.manage_views');
    }
}

export function assertCanSavePersonalView(user) {
    if (!checkUserPermission(user, 'data_extractor.analytics.saved_views')
        && !checkUserPermission(user, 'data_extractor.analytics.manage_views')
        && !checkUserPermission(user, 'data_extractor.analytics.manage')) {
        throw new ApiError(403, 'Missing permission: data_extractor.analytics.saved_views');
    }
}

export function stripRestrictedDetails(payload, aggregateOnly) {
    if (!aggregateOnly) return payload;
    const clone = JSON.parse(JSON.stringify(payload || {}));
    delete clone.rows;
    delete clone.samples;
    delete clone.recordIds;
    delete clone.companyNames;
    delete clone.contacts;
    delete clone.sourceUrls;
    if (clone.dimensions) {
        for (const k of Object.keys(clone.dimensions)) {
            const arr = clone.dimensions[k];
            if (Array.isArray(arr)) {
                clone.dimensions[k] = arr.map((row) => {
                    const { name, companyName, contactName, email, phone, url, sourceUrl, ...rest } = row || {};
                    return rest;
                });
            }
        }
    }
    clone.aggregateOnly = true;
    clone.drillDownAllowed = false;
    return clone;
}