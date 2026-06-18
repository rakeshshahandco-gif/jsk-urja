/** Shared helpers for Textile Production Order workflow (Handloom only). */

export const VENDOR_JOB_WORK_PROCESSES = new Set([
    'Dyeing', 'Printing', 'Embroidery', 'Stitching', 'Washing', 'Pressing', 'Finishing', 'Packing',
]);

export function stageLabel(s) {
    if (s?.processName === 'Other' && s?.customProcessName) return s.customProcessName;
    return s?.processName || '';
}

export function resolveStageProcessType(stage) {
    const name = stageLabel(stage);
    return VENDOR_JOB_WORK_PROCESSES.has(name) ? name : null;
}
