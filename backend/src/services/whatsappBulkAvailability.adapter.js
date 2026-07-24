/**
 * Isolated WhatsApp availability adapter for Bulk Number Health.
 * - Does not create a new Baileys session / QR / auth folder
 * - Does not send messages
 * - Lazy-loads Chat WhatsApp service only on authorized lookup
 * - Injectable for unit tests / simulation
 */
import { bulkSendDelay, randomBulkDelayMs } from './whatsappBulkSafeMode.util.js';

export const AVAILABILITY_STATUSES = Object.freeze({
  WHATSAPP_AVAILABLE: 'WHATSAPP_AVAILABLE',
  NOT_ON_WHATSAPP: 'NOT_ON_WHATSAPP',
  UNKNOWN: 'UNKNOWN',
  CHECK_FAILED: 'CHECK_FAILED',
  NOT_CHECKED: 'NOT_CHECKED',
  SESSION_UNAVAILABLE: 'SESSION_UNAVAILABLE',
  SESSION_NOT_CONNECTED: 'SESSION_NOT_CONNECTED',
  METHOD_UNSUPPORTED: 'METHOD_UNSUPPORTED',
  RATE_LIMITED: 'RATE_LIMITED',
});

let lookupImpl = null;
let lookupInFlight = false;
let dailyLookupCount = 0;
let dailyLookupDate = '';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyIfNeeded() {
  const t = todayKey();
  if (dailyLookupDate !== t) {
    dailyLookupDate = t;
    dailyLookupCount = 0;
  }
}

export function setAvailabilityLookupImpl(fn) {
  lookupImpl = typeof fn === 'function' ? fn : null;
}

export function resetAvailabilityLookupImpl() {
  lookupImpl = null;
}

export function resetAvailabilityLookupCounters() {
  dailyLookupCount = 0;
  dailyLookupDate = '';
  lookupInFlight = false;
}

async function getWhatsAppServiceLazy() {
  const mod = await import('./whatsapp.service.js');
  return mod.default;
}

/**
 * Default live lookup: only if WhatsAppService exposes checkOnWhatsApp.
 * Chat is not modified in this feature — missing method => METHOD_UNSUPPORTED (UNKNOWN/CHECK_FAILED).
 * Never treats UNKNOWN as NOT_ON_WHATSAPP.
 */
function mapRowFromChatLookup(row, fallbackNumber) {
  const n = row?.normalizedNumber || row?.jid || row?.number || fallbackNumber;
  const code = row?.errorCode || null;
  if (code === 'METHOD_UNSUPPORTED') {
    return {
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.METHOD_UNSUPPORTED,
      errorCode: 'METHOD_UNSUPPORTED',
      checkSource: 'crm_whatsapp_adapter',
    };
  }
  if (code === 'SESSION_NOT_CONNECTED' || code === 'SESSION_DISCONNECTED') {
    return {
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED,
      errorCode: 'SESSION_NOT_CONNECTED',
      checkSource: 'crm_whatsapp_adapter',
    };
  }
  if (code === 'THROTTLED') {
    return {
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.RATE_LIMITED,
      errorCode: 'THROTTLED',
      checkSource: 'crm_whatsapp_adapter',
    };
  }
  if (code === 'CHECK_FAILED' || code === 'LOOKUP_ERROR') {
    return {
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.CHECK_FAILED,
      errorCode: code,
      checkSource: 'crm_whatsapp_adapter',
    };
  }
  const exists = row?.exists === true;
  const definiteNo = row?.exists === false && row?.definitive === true;
  let availabilityStatus = AVAILABILITY_STATUSES.UNKNOWN;
  if (exists) availabilityStatus = AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE;
  else if (definiteNo) availabilityStatus = AVAILABILITY_STATUSES.NOT_ON_WHATSAPP;
  return {
    normalizedNumber: n,
    availabilityStatus,
    errorCode: code,
    checkSource: 'crm_whatsapp_adapter',
  };
}

async function defaultLiveLookup(normalizedNumbers, { userId } = {}) {
  try {
    const WhatsAppService = await getWhatsAppServiceLazy();
    if (typeof WhatsAppService.checkOnWhatsApp !== 'function') {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.METHOD_UNSUPPORTED,
        errorCode: 'METHOD_UNSUPPORTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    // Prefer shared Chat session owner (same resolve used by Chat UI).
    const effective = WhatsAppService.getEffectiveStatus?.(userId) || WhatsAppService.getStatus?.(userId) || {};
    if (!(effective.status === 'CONNECTED' || effective.connected === true)) {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED,
        errorCode: 'SESSION_NOT_CONNECTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    const rows = await WhatsAppService.checkOnWhatsApp(userId, normalizedNumbers);
    return (normalizedNumbers || []).map((n, idx) => {
      const row = (rows || []).find((r) => String(r?.normalizedNumber || '') === String(n)) || (rows || [])[idx] || { normalizedNumber: n };
      return mapRowFromChatLookup(row, n);
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    const code = err?.code || '';
    if (code === 'METHOD_UNSUPPORTED' || /METHOD_UNSUPPORTED/i.test(msg)) {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.METHOD_UNSUPPORTED,
        errorCode: 'METHOD_UNSUPPORTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    if (code === 'SESSION_NOT_CONNECTED' || /SESSION_NOT_CONNECTED/i.test(msg)) {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED,
        errorCode: 'SESSION_NOT_CONNECTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    const throttled = code === 'THROTTLED' || /rate|throttl|too many|429/i.test(msg);
    return normalizedNumbers.map((n) => ({
      normalizedNumber: n,
      availabilityStatus: throttled ? AVAILABILITY_STATUSES.RATE_LIMITED : AVAILABILITY_STATUSES.CHECK_FAILED,
      errorCode: throttled ? 'THROTTLED' : 'LOOKUP_ERROR',
      checkSource: 'crm_whatsapp_adapter',
    }));
  }
}

/**
 * Sequential availability check for valid normalized numbers only.
 */
export async function checkWhatsAppAvailabilitySequential(normalizedNumbers, settings = {}, options = {}) {
  const numbers = [...new Set((normalizedNumbers || []).map(String).filter(Boolean))];
  if (!numbers.length) return { results: [], stoppedReason: null, lookedUp: 0 };

  if (settings.whatsappAvailabilityCheckEnabled !== true && options.force !== true) {
    return {
      results: numbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.NOT_CHECKED,
        errorCode: 'LOOKUP_DISABLED',
        checkSource: 'disabled',
      })),
      stoppedReason: 'LOOKUP_DISABLED',
      lookedUp: 0,
    };
  }

  if (lookupInFlight) {
    return {
      results: numbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.CHECK_FAILED,
        errorCode: 'PARALLEL_BLOCKED',
        checkSource: 'safety',
      })),
      stoppedReason: 'PARALLEL_BLOCKED',
      lookedUp: 0,
    };
  }

  lookupInFlight = true;
  resetDailyIfNeeded();
  const dailyLimit = Number(settings.availabilityLookupDailyLimit || 50);
  const minDelay = Math.max(1, Number(settings.availabilityLookupMinDelaySeconds || 2)) * 1000;
  const maxDelay = Math.max(minDelay, Number(settings.availabilityLookupMaxDelaySeconds || 5)) * 1000;
  const stopOnThrottle = settings.stopOnThrottle !== false;
  const stopOnSessionError = settings.stopOnSessionError !== false;
  const impl = lookupImpl || defaultLiveLookup;
  const results = [];
  let stoppedReason = null;
  let lookedUp = 0;

  try {
    for (let i = 0; i < numbers.length; i += 1) {
      if (dailyLookupCount >= dailyLimit) {
        stoppedReason = 'DAILY_LIMIT';
        for (let j = i; j < numbers.length; j += 1) {
          results.push({
            normalizedNumber: numbers[j],
            availabilityStatus: AVAILABILITY_STATUSES.RATE_LIMITED,
            errorCode: 'DAILY_LIMIT',
            checkSource: 'safety',
          });
        }
        break;
      }

      const one = numbers[i];
      const batch = await impl([one], options);
      const row = batch?.[0] || {
        normalizedNumber: one,
        availabilityStatus: AVAILABILITY_STATUSES.UNKNOWN,
        errorCode: 'EMPTY_RESPONSE',
        checkSource: 'adapter',
      };
      results.push(row);
      lookedUp += 1;
      dailyLookupCount += 1;

      if (stopOnThrottle && row.availabilityStatus === AVAILABILITY_STATUSES.RATE_LIMITED) {
        stoppedReason = 'THROTTLED';
        for (let j = i + 1; j < numbers.length; j += 1) {
          results.push({
            normalizedNumber: numbers[j],
            availabilityStatus: AVAILABILITY_STATUSES.RATE_LIMITED,
            errorCode: 'STOPPED_ON_THROTTLE',
            checkSource: 'safety',
          });
        }
        break;
      }
      if (
        stopOnSessionError &&
        (row.availabilityStatus === AVAILABILITY_STATUSES.SESSION_UNAVAILABLE ||
          row.availabilityStatus === AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED ||
          row.availabilityStatus === AVAILABILITY_STATUSES.METHOD_UNSUPPORTED ||
          row.errorCode === 'SESSION_DISCONNECTED' ||
          row.errorCode === 'SESSION_NOT_CONNECTED' ||
          row.errorCode === 'METHOD_UNSUPPORTED')
      ) {
        stoppedReason = 'SESSION_ERROR';
        for (let j = i + 1; j < numbers.length; j += 1) {
          results.push({
            normalizedNumber: numbers[j],
            availabilityStatus: row.availabilityStatus === AVAILABILITY_STATUSES.METHOD_UNSUPPORTED
              ? AVAILABILITY_STATUSES.METHOD_UNSUPPORTED
              : AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED,
            errorCode: 'STOPPED_ON_SESSION',
            checkSource: 'safety',
          });
        }
        break;
      }

      if (i < numbers.length - 1) {
        await bulkSendDelay(randomBulkDelayMs(minDelay, maxDelay));
      }
    }
  } finally {
    lookupInFlight = false;
  }

  return { results, stoppedReason, lookedUp };
}
