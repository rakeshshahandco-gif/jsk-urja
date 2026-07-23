/**
 * Estimated POSSIBLE_BLOCK_OR_UNREACHABLE scoring.
 * Never confirms a customer blocked us. Never uses profile/last-seen signals.
 */
export const POSSIBLE_BLOCK_WARNING =
  'This is an estimated delivery risk only. WhatsApp does not provide reliable confirmation that a recipient has blocked this number.';

export const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  UNKNOWN: 'UNKNOWN',
});

/**
 * @param {object} history
 * @param {number} history.failedAttempts
 * @param {number} history.distinctFailureDays
 * @param {boolean} history.hadPriorSuccessfulDelivery
 * @param {boolean} history.whatsappAvailable
 * @param {boolean} history.campaignPeersDeliveredNormally
 * @param {boolean} history.sessionWasHealthy
 * @param {boolean} history.broadCampaignFailure
 */
export function estimatePossibleBlockOrUnreachable(history = {}) {
  const failedAttempts = Number(history.failedAttempts || 0);
  const distinctFailureDays = Number(history.distinctFailureDays || 0);
  const indicators = [];

  // Single failure must never produce high risk
  if (failedAttempts <= 1) {
    return {
      status: 'POSSIBLE_BLOCK_OR_UNREACHABLE',
      riskLevel: failedAttempts === 1 ? RISK_LEVELS.LOW : RISK_LEVELS.UNKNOWN,
      confidence: 'low',
      indicators: failedAttempts === 1 ? ['single_failure_only'] : [],
      recommendedAction: failedAttempts === 1 ? 'do_not_retry_immediately' : 'insufficient_history',
      warning: POSSIBLE_BLOCK_WARNING,
      blockingConfirmed: false,
    };
  }

  let score = 0;
  if (failedAttempts >= 2) {
    score += 1;
    indicators.push('multiple_failures');
  }
  if (failedAttempts >= 3) {
    score += 1;
    indicators.push('repeated_failures');
  }
  if (distinctFailureDays >= 2) {
    score += 2;
    indicators.push('failures_across_dates');
  }
  if (history.whatsappAvailable === true) {
    score += 1;
    indicators.push('number_still_whatsapp_available');
  }
  if (history.hadPriorSuccessfulDelivery === true) {
    score += 1;
    indicators.push('prior_successful_delivery');
  }
  if (history.sessionWasHealthy === true) {
    score += 1;
    indicators.push('session_was_healthy');
  }
  if (history.campaignPeersDeliveredNormally === true) {
    score += 1;
    indicators.push('peers_delivered_normally');
  }
  if (history.broadCampaignFailure === true) {
    score -= 3;
    indicators.push('broad_campaign_or_session_failure');
  }

  let riskLevel = RISK_LEVELS.LOW;
  if (score >= 6) riskLevel = RISK_LEVELS.HIGH;
  else if (score >= 4) riskLevel = RISK_LEVELS.MEDIUM;
  else if (score >= 2) riskLevel = RISK_LEVELS.LOW;
  else riskLevel = RISK_LEVELS.UNKNOWN;

  let recommendedAction = 'request_manual_review';
  if (riskLevel === RISK_LEVELS.HIGH) recommendedAction = 'stop_further_campaign_messages';
  else if (riskLevel === RISK_LEVELS.MEDIUM) recommendedAction = 'verify_by_another_business_channel';

  return {
    status: 'POSSIBLE_BLOCK_OR_UNREACHABLE',
    riskLevel,
    confidence: riskLevel === RISK_LEVELS.HIGH ? 'medium' : 'low',
    indicators,
    recommendedAction,
    warning: POSSIBLE_BLOCK_WARNING,
    blockingConfirmed: false,
    explanation:
      'Possible delivery risk; blocking cannot be confirmed. Score is estimated from repeated recipient-specific delivery failures only.',
  };
}

export function assertNoConfirmedBlockedStatus(value) {
  const banned = ['CONFIRMED_BLOCKED', 'BLOCKED_BY_CUSTOMER', 'DEFINITELY_BLOCKED'];
  return !banned.includes(String(value || ''));
}
