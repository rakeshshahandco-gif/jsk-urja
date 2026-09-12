export function isDataExtractorAdminUser(user, hasRole) {
    const role = String(user?.roleName || user?.role?.name || '').trim().toLowerCase();
    if (['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role)) return true;
    return Boolean(hasRole?.('superadmin') || hasRole?.('admin'));
}

const TERMINAL_RUN_STATUSES = ['COMPLETED', 'CANCELLED', 'FAILED', 'STOPPED', 'EXPIRED', 'DATA_DELETED'];
const LIVE_RUN_STATUSES = ['RUNNING', 'QUEUED', 'PROCESSING', 'RETRYING', 'PAUSED'];
const BLOCKED_DELETE_STATUSES = ['RUNNING', 'QUEUED', 'PROCESSING', 'RETRYING'];
const ELIGIBLE_DELETE_STATUSES = ['PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED', 'STOPPED', 'EXPIRED'];

export function runStatusUpper(run) {
    return String(run?.status || '').toUpperCase();
}

export function isPausedRun(run) {
    return runStatusUpper(run) === 'PAUSED';
}

export function isLiveRunStatus(run) {
    const status = runStatusUpper(run);
    const ac = String(run?.autoCollectionStatus || run?.autoCollection?.status || '');
    const ap = String(run?.autoProcessingStatus || run?.autoProcessing?.status || '');
    if (run?.dataRetentionStatus === 'DATA_DELETED') return false;
    if (TERMINAL_RUN_STATUSES.includes(status)) return false;
    if (LIVE_RUN_STATUSES.includes(status)) return true;
    if (ac === 'running' || ac === 'paused_batch') return true;
    if (ap === 'running') return true;
    return false;
}

export function includeDeletedQueryValue(showDeleted) {
    return showDeleted === true;
}

export function isRunningDeleteBlocked(run) {
    return BLOCKED_DELETE_STATUSES.includes(runStatusUpper(run));
}

/** Paused / stopped / failed / completed / cancelled. Never running, processing, or retrying. */
export function canShowDeleteData(run) {
    if (!run) return false;
    if (run.dataRetentionStatus === 'DATA_DELETED') return false;
    const status = runStatusUpper(run);
    if (BLOCKED_DELETE_STATUSES.includes(status)) return false;
    if (ELIGIBLE_DELETE_STATUSES.includes(status)) return true;
    return !isLiveRunStatus(run);
}

export function resolveStartNewDecision({ hasOpenRun, runIsLive } = {}) {
    if (!hasOpenRun) return 'CLEAN_WORKSPACE';
    if (runIsLive) return 'CONFIRM_LIVE';
    return 'CLEAN_WORKSPACE';
}

export const DE_LOCAL_DEVICE_STORAGE_KEY = 'jsk.de.localDeviceId';

export function readLocalDeviceId() {
    try {
        return String(globalThis.localStorage?.getItem(DE_LOCAL_DEVICE_STORAGE_KEY) || '').trim();
    } catch {
        return '';
    }
}

export function formatRegisterPcStatus({ online, deviceName } = {}) {
    const name = String(deviceName || '').trim();
    if (online) return name ? `Ready — ${name}` : 'Ready';
    return name ? `Offline — ${name}` : 'Offline';
}

export function writeLocalDeviceId(deviceId) {
    const id = String(deviceId || '').trim();
    if (!id) return;
    try {
        globalThis.localStorage?.setItem(DE_LOCAL_DEVICE_STORAGE_KEY, id);
    } catch {
        /* ignore */
    }
}

export function formatExtractionDeviceLine(runOrSession) {
    const name = runOrSession?.assignedDeviceName
        || runOrSession?.deviceName
        || runOrSession?.owner?.deviceName
        || '';
    return name ? `Extraction Device: ${name}` : '';
}

export function formatOwnerBanner(runOrSession, currentUserId) {
    const name = runOrSession?.createdByName
        || runOrSession?.ownerName
        || runOrSession?.owner?.name
        || '';
    const ownerId = runOrSession?.createdBy
        || runOrSession?.ownerUserId
        || runOrSession?.owner?.userId
        || '';
    const monitoring = ownerId && currentUserId && String(ownerId) !== String(currentUserId);
    return {
        ownerName: name || 'Unknown',
        monitoring: Boolean(monitoring),
        label: name ? `Owner: ${name}` : 'Owner: —',
        deviceLine: formatExtractionDeviceLine(runOrSession),
    };
}

export function deleteConfirmMessage(run) {
    const location = [run?.city, run?.state, run?.country].filter(Boolean).join(', ') || '—';
    const paused = isPausedRun(run);
    return {
        title: paused ? 'Delete Paused Extraction?' : 'Delete Extracted Data?',
        warning: paused
            ? 'This extraction is currently paused and can still be resumed. Deleting it will permanently end this run and remove its extracted data.'
            : 'This permanently removes the extracted/raw data for this search. Download or archive the results first. A small audit record will be retained.',
        searchName: run?.campaignName || run?.product || run?.queryText || '—',
        location,
        user: run?.createdByName || run?.ownerName || '—',
        recordCount: run?.originalRecordCount ?? run?.resultCount ?? 0,
        createdDate: run?.startedAt || run?.createdAt || null,
        confirmWord: 'DELETE',
        paused,
    };
}
