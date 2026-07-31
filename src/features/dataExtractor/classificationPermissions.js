/**
 * Frontend visibility helpers for Industry Classification actions.
 * Backend permission checks remain the source of truth.
 */
export function getClassificationActionVisibility(hasPermission) {
    const can = (key) => {
        try {
            return hasPermission?.(key) === true;
        } catch {
            return false;
        }
    };

    return {
        canView: can('data_extractor.lead_intelligence.view'),
        canClassify: can('data_extractor.lead_intelligence.classify'),
        canBatch: can('data_extractor.lead_intelligence.batch'),
        canOverride: can('data_extractor.lead_intelligence.override'),
        canLock: can('data_extractor.lead_intelligence.lock'),
        canMarkIrrelevant: can('data_extractor.lead_intelligence.mark_irrelevant'),
        canViewEvidence: can('data_extractor.lead_intelligence.view_evidence'),
        canViewHistory: can('data_extractor.lead_intelligence.view_history'),
        canAudit: can('data_extractor.lead_intelligence.audit'),
        canManage: can('data_extractor.lead_intelligence.manage'),
    };
}
