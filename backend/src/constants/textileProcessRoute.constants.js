/** Textile Process Route Master - Handloom / TEXTILE template only. */

export const TEXTILE_ROUTE_PROCESS_OPTIONS = [
    'Dyeing',
    'Printing',
    'Embroidery',
    'Stitching',
    'Washing',
    'Pressing',
    'Finishing',
    'Packing',
    'QC',
    'Other',
];

export const TEXTILE_PRODUCTION_ORDER_STATUS = [
    'Draft',
    'In Progress',
    'Completed',
    'Cancelled',
];

export const TEXTILE_STAGE_STATUS = [
    'pending',
    'in_progress',
    'completed',
    'skipped',
];

export const VENDOR_JOB_WORK_PROCESSES = new Set([
    'Dyeing',
    'Printing',
    'Embroidery',
    'Stitching',
    'Washing',
    'Pressing',
    'Finishing',
    'Packing',
]);

export function normalizeRouteProcessName(name, customName = '') {
    const n = String(name || '').trim();
    if (n === 'Other' && customName?.trim()) return customName.trim();
    const match = TEXTILE_ROUTE_PROCESS_OPTIONS.find((p) => p.toLowerCase() === n.toLowerCase());
    return match || 'Other';
}

export function resolveChallanProcessType(processName, customProcessName = '') {
    const n = normalizeRouteProcessName(processName, customProcessName);
    if (VENDOR_JOB_WORK_PROCESSES.has(n)) return n;
    return null;
}

export function buildProductionOrderBarcode(orderNo, routeName, stageName, lotNo = '', colour = '') {
    return ['TPO', orderNo, routeName, stageName, lotNo, colour].join('|');
}

export function slugRouteCode(routeName) {
    return String(routeName || 'ROUTE')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'ROUTE';
}
