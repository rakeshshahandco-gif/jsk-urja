/** Simple Lead Search per-query capture workflow (additive; does not replace SearchQuery.status). */
export const SLS_QUERY_CAPTURE_STATUSES = Object.freeze([
    'pending',
    'opening',
    'ready',
    'partially_captured',
    'completed',
    'skipped',
    'failed',
]);

export const SLS_QUERY_OPENABLE = Object.freeze(['pending', 'failed']);
export const SLS_QUERY_TERMINAL = Object.freeze(['completed', 'skipped']);