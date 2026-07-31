export const SESSION_ALLOWED_TTL_MINUTES_DEFAULT = 30;
export const SESSION_ALLOWED_TTL_MINUTES_MAX = 60;

export const CAMPAIGN_ELIGIBLE_FOR_ASSISTED_CAPTURE = Object.freeze(['draft', 'active', 'paused']);
export const QUERY_ELIGIBLE_FOR_ASSISTED_CAPTURE = Object.freeze(['approved', 'opened', 'captured']);

export const PERM_ASSISTED_VIEW = 'data_extractor.assisted_capture.view';
export const PERM_ASSISTED_START = 'data_extractor.assisted_capture.start';
export const PERM_ASSISTED_MANAGE = 'data_extractor.assisted_capture.manage';

export const ASSISTED_IDEMPOTENCY_REUSED_CODE = 'IDEMPOTENCY_KEY_REUSED';

export const AGENT_HEARTBEAT_STATUS_ALLOWED = Object.freeze([
    'opening',
    'awaiting_user',
    'manual_action_required',
    'ready_to_capture',
    'capturing',
]);
