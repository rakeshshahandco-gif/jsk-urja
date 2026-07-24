/**
 * Pure Number Health list/filter helpers (frontend).
 * Keeps validation-status default ALL and maps validate API fields without guessing.
 */

export const FILTER_ALL = 'ALL';

export const DEFAULT_NUMBER_HEALTH_FILTER = Object.freeze({
  validationStatus: FILTER_ALL,
  availabilityStatus: FILTER_ALL,
  riskLevel: FILTER_ALL,
});

export const EMPTY_NEVER_VALIDATED =
  'No Number Health records yet. Enter numbers above and click Validate Selected.';

export const EMPTY_FILTER_NO_MATCH = 'No records match the selected filters.';

function isAll(value) {
  return value == null || value === '' || value === FILTER_ALL;
}

/** Split textarea into API items: one trimmed non-empty string per line/token. */
export function parseNumberHealthTextarea(rawText = '') {
  return String(rawText || '')
    .split(/[\n\r,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((mobile) => ({ mobile, sourceType: 'manual' }));
}

/** Align validate/list row field names for table display. */
export function normalizeHealthRow(row = {}) {
  const original = row.originalNumberSample || row.originalNumber || '';
  return {
    ...row,
    originalNumber: original,
    originalNumberSample: original,
    normalizedNumber: row.normalizedNumber || '',
  };
}

/** Build GET /number-health query params; omit ALL/empty so backend returns the full set. */
export function toNumberHealthListParams(filter = {}) {
  const params = {};
  if (!isAll(filter.validationStatus)) params.validationStatus = filter.validationStatus;
  if (!isAll(filter.availabilityStatus)) params.availabilityStatus = filter.availabilityStatus;
  if (!isAll(filter.riskLevel)) params.riskLevel = filter.riskLevel;
  return params;
}

/** Client-side filter over the latest validation/list dataset. */
export function applyNumberHealthFilters(rows = [], filter = DEFAULT_NUMBER_HEALTH_FILTER) {
  return (rows || []).filter((r) => {
    if (!isAll(filter.validationStatus) && r.validationStatus !== filter.validationStatus) return false;
    if (!isAll(filter.availabilityStatus) && r.availabilityStatus !== filter.availabilityStatus) return false;
    if (!isAll(filter.riskLevel) && (r.riskLevel || 'UNKNOWN') !== filter.riskLevel) return false;
    return true;
  });
}

/**
 * Map POST /number-health/validate response (canonical: summary, results, duplicates, warning)
 * into summary-card shape used by the page.
 */
export function summaryFromValidateResponse(data) {
  const s = data?.summary || {};
  const results = (data?.results || []).map(normalizeHealthRow);
  return {
    total: s.total ?? results.length,
    valid: s.valid ?? 0,
    invalid: s.invalid ?? 0,
    unknown: s.unknown ?? 0,
    duplicates: s.duplicates ?? 0,
    eligible: s.eligible ?? 0,
    whatsappAvailable: results.filter((r) => r.availabilityStatus === 'WHATSAPP_AVAILABLE').length,
    notOnWhatsApp: results.filter((r) => r.availabilityStatus === 'NOT_ON_WHATSAPP').length,
    checkFailed: results.filter((r) => r.availabilityStatus === 'CHECK_FAILED').length,
    blacklisted: results.filter((r) => r.blacklisted).length,
    optedOut: results.filter((r) => r.optedOut).length,
    possibleDeliveryRisk: results.filter((r) => r.riskLevel === 'HIGH' || r.possibleDeliveryRisk).length,
    warning: data?.warning,
  };
}

export function emptyStateMessage({ sourceRowCount = 0, visibleRowCount = 0 } = {}) {
  if (sourceRowCount <= 0) return EMPTY_NEVER_VALIDATED;
  if (visibleRowCount <= 0) return EMPTY_FILTER_NO_MATCH;
  return null;
}

/**
 * Unique VALID normalized numbers from latest dataset (max limit).
 * Skips blanks/invalid; checks each normalized number once for duplicates.
 */
export function numbersForAvailabilityLookup(sourceRows = [], limit = 20) {
  const seen = new Set();
  const out = [];
  for (const r of sourceRows || []) {
    const n = r?.normalizedNumber;
    if (!n || r.validationStatus !== 'VALID') continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

/** Propagate lookup statuses onto all rows sharing a normalized number. */
export function applyAvailabilityResultsToRows(sourceRows = [], lookupResults = []) {
  const map = new Map();
  for (const r of lookupResults || []) {
    if (r?.normalizedNumber) map.set(r.normalizedNumber, r);
  }
  return (sourceRows || []).map((row) => {
    const hit = map.get(row.normalizedNumber);
    if (!hit) return normalizeHealthRow(row);
    return normalizeHealthRow({
      ...row,
      availabilityStatus: hit.availabilityStatus || row.availabilityStatus,
      checkedAt: hit.checkedAt || row.checkedAt || new Date().toISOString(),
      lastErrorCode: hit.errorCode || row.lastErrorCode || null,
    });
  });
}

export function lookupButtonState({
  lookupEnabled = false,
  hasPermission = true,
  busy = false,
  eligibleCount = 0,
} = {}) {
  if (busy) return { disabled: true, reason: 'Availability check is running…' };
  if (!hasPermission) return { disabled: true, reason: 'Missing permission: whatsapp_bulk.number_health.lookup' };
  if (!lookupEnabled) return { disabled: true, reason: 'WhatsApp availability lookup is disabled for this company' };
  if (eligibleCount <= 0) return { disabled: true, reason: 'No valid normalized numbers to check' };
  return { disabled: false, reason: '' };
}

/** After Validate Selected: reset filters to ALL and bind summary+table to the same response. */
export function applyValidateDataset(data) {
  const results = (Array.isArray(data?.results) ? data.results : []).map(normalizeHealthRow);
  return {
    filter: { ...DEFAULT_NUMBER_HEALTH_FILTER },
    sourceRows: results,
    summary: summaryFromValidateResponse({ ...data, results }),
  };
}