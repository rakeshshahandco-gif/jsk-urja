/**
 * Safe RCM role-permission matrix (company-level).
 * Does not grant everything to every role. Superadmin remains full bypass.
 */
export const RCM_ROLE_PERMISSION_MATRIX = Object.freeze({
    /** Company System Admin — all company RCM actions */
    system_admin: [
        'evaluate', 'confirm', 'view_accounting_preview', 'override',
        'post_liability', 'view_payment', 'record_payment', 'reverse_payment',
        'view_itc_review', 'review_itc', 'release_itc', 'reverse_itc',
        'view_reconciliation', 'prepare_return_mapping', 'review_return_mapping',
        'approve_return_mapping', 'include_in_gstr3b', 'lock_period', 'create_amendment',
        'reverse',
    ],
    /** Accounts / GST Manager — operate day-to-day; no approve/include/lock/reverse */
    accounts_gst_manager: [
        'evaluate', 'confirm', 'view_accounting_preview',
        'post_liability', 'view_payment', 'record_payment',
        'view_itc_review', 'review_itc', 'release_itc',
        'view_reconciliation', 'prepare_return_mapping', 'review_return_mapping',
    ],
    /** Senior GST Approver — manager set + approvals / reversals / lock */
    senior_gst_approver: [
        'evaluate', 'confirm', 'view_accounting_preview', 'override',
        'post_liability', 'view_payment', 'record_payment', 'reverse_payment',
        'view_itc_review', 'review_itc', 'release_itc', 'reverse_itc',
        'view_reconciliation', 'prepare_return_mapping', 'review_return_mapping',
        'approve_return_mapping', 'include_in_gstr3b', 'lock_period', 'create_amendment',
        'reverse',
    ],
    /** Normal accounts user — evaluate / view only */
    normal_accounts: [
        'evaluate', 'view_accounting_preview', 'view_payment', 'view_itc_review', 'view_reconciliation',
    ],
});

export function buildGstRcmPermissionObject(actionIds = []) {
    const rcm = {};
    for (const id of actionIds) rcm[id] = true;
    return rcm;
}

/**
 * Merge RCM actions into role.permissions.gst.rcm without wiping other gst modules.
 */
export function mergeRcmIntoRolePermissions(existingPermissions = {}, actionIds = []) {
    const next = { ...(existingPermissions || {}) };
    const gst = { ...(next.gst || {}) };
    gst.rcm = {
        ...(gst.rcm || {}),
        ...buildGstRcmPermissionObject(actionIds),
    };
    next.gst = gst;
    return next;
}

/** Role-name → matrix key mapping for safe localhost assignment */
export const RCM_ROLE_NAME_TARGETS = Object.freeze({
    // Company admin role (not the superadmin bypass document)
    // Note: some local users named "jay" were incorrectly assigned this role — treat carefully in QA.
    admin: 'system_admin',
    accounts: 'accounts_gst_manager',
    'gst manager': 'accounts_gst_manager',
    gst_manager: 'accounts_gst_manager',
    'senior gst': 'senior_gst_approver',
    senior_gst_approver: 'senior_gst_approver',
    staff: 'normal_accounts',
    viewer: 'normal_accounts',
    // sales / purchase / inventory intentionally omitted — no automatic RCM grants
});

export default {
    RCM_ROLE_PERMISSION_MATRIX,
    RCM_ROLE_NAME_TARGETS,
    buildGstRcmPermissionObject,
    mergeRcmIntoRolePermissions,
};
