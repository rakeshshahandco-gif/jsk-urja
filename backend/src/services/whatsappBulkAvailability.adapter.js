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
async function defaultLiveLookup(normalizedNumbers, { userId } = {}) {
  try {
    const WhatsAppService = await getWhatsAppServiceLazy();
    if (typeof WhatsAppService.checkOnWhatsApp !== 'function') {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.CHECK_FAILED,
        errorCode: 'METHOD_UNSUPPORTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    const status = WhatsAppService.getStatus?.(userId) || {};
    if (!(status.status === 'CONNECTED' || status.connected === true)) {
      return normalizedNumbers.map((n) => ({
        normalizedNumber: n,
        availabilityStatus: AVAILABILITY_STATUSES.SESSION_UNAVAILABLE,
        errorCode: 'SESSION_DISCONNECTED',
        checkSource: 'crm_whatsapp_adapter',
      }));
    }
    const rows = await WhatsAppService.checkOnWhatsApp(userId, normalizedNumbers);
    return (rows || []).map((row) => {
      const exists = row?.exists === true;
      const definiteNo = row?.exists === false && row?.definitive === true;
      let availabilityStatus = AVAILABILITY_STATUSES.UNKNOWN;
      if (exists) availabilityStatus = AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE;
      else if (definiteNo) availabilityStatus = AVAILABILITY_STATUSES.NOT_ON_WHATSAPP;
      return {
        normalizedNumber: row.normalizedNumber || row.jid || row.number,
        availabilityStatus,
        errorCode: row.errorCode || null,
        checkSource: 'crm_whatsapp_adapter',
      };
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    const throttled = /rate|throttl|too many|429/i.test(msg);
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
  const minDelay = Math.max(1, Number(settings.availabilityLookupMinDelaySeconds || 3)) * 1000;
  const maxDelay = Math.max(minDelay, Number(settings.availabilityLookupMaxDelaySeconds || 6)) * 1000;
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
          row.errorCode === 'SESSION_DISCONNECTED')
      ) {
        stoppedReason = 'SESSION_ERROR';
        for (let j = i + 1; j < numbers.length; j += 1) {
          results.push({
            normalizedNumber: numbers[j],
            availabilityStatus: AVAILABILITY_STATUSES.SESSION_UNAVAILABLE,
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
