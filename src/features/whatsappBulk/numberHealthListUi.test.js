/**
 * Number Health frontend list/filter + availability helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  DEFAULT_NUMBER_HEALTH_FILTER,
  EMPTY_FILTER_NO_MATCH,
  EMPTY_NEVER_VALIDATED,
  FILTER_ALL,
  applyAvailabilityResultsToRows,
  applyNumberHealthFilters,
  applyValidateDataset,
  emptyStateMessage,
  lookupButtonState,
  normalizeHealthRow,
  numbersForAvailabilityLookup,
  parseNumberHealthTextarea,
  summaryFromValidateResponse,
  toNumberHealthListParams,
} from './numberHealthListUi.js';

const sampleRows = [
  { displayName: 'A', validationStatus: 'VALID', availabilityStatus: 'NOT_CHECKED', riskLevel: 'LOW', originalNumber: '+91 99207 30373', normalizedNumber: '919920730373', duplicateCount: 2, eligible: false },
  { displayName: 'B', validationStatus: 'VALID', availabilityStatus: 'NOT_CHECKED', riskLevel: 'LOW', originalNumber: '09920730373', normalizedNumber: '919920730373', duplicateCount: 2, eligible: false },
  { displayName: 'C', validationStatus: 'VALID', availabilityStatus: 'WHATSAPP_AVAILABLE', riskLevel: 'LOW', originalNumber: '9876543210', normalizedNumber: '919876543210', duplicateCount: 1, eligible: true },
  { displayName: 'D', validationStatus: 'INVALID', availabilityStatus: 'NOT_CHECKED', riskLevel: 'HIGH', originalNumber: 'abc', normalizedNumber: '', duplicateCount: 0, eligible: false },
];

describe('Number Health list UI helpers', () => {
  it('defaults validation filter to ALL', () => {
    assert.equal(DEFAULT_NUMBER_HEALTH_FILTER.validationStatus, FILTER_ALL);
  });

  it('textarea values reach API payload shape with actual strings', () => {
    const items = parseNumberHealthTextarea('+91 99207 30373\n09920730373\n9920730373\n\n');
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((i) => i.mobile), ['+91 99207 30373', '09920730373', '9920730373']);
    assert.ok(items.every((i) => i.sourceType === 'manual'));
  });

  it('normalizeHealthRow fills Original/Normalized display fields', () => {
    const row = normalizeHealthRow({
      originalNumber: '+91 99207 30373',
      normalizedNumber: '919920730373',
      validationStatus: 'VALID',
    });
    assert.equal(row.originalNumberSample, '+91 99207 30373');
    assert.equal(row.normalizedNumber, '919920730373');
    assert.notEqual(row.originalNumberSample, '');
  });

  it('successful validation populates table from results immediately without blank Original', () => {
    const data = {
      summary: { total: 3, valid: 3, invalid: 0, duplicates: 3, eligible: 0 },
      results: [
        { originalNumber: '+91 99207 30373', normalizedNumber: '919920730373', validationStatus: 'VALID', duplicateCount: 3 },
        { originalNumber: '09920730373', normalizedNumber: '919920730373', validationStatus: 'VALID', duplicateCount: 3 },
        { originalNumber: '9920730373', normalizedNumber: '919920730373', validationStatus: 'VALID', duplicateCount: 3 },
      ],
    };
    const next = applyValidateDataset(data);
    assert.equal(next.sourceRows.length, 3);
    assert.ok(next.sourceRows.every((r) => r.originalNumberSample && r.normalizedNumber));
    assert.equal(next.filter.validationStatus, 'ALL');
  });

  it('ALL / VALID / INVALID filters and empty messages', () => {
    assert.equal(applyNumberHealthFilters(sampleRows, DEFAULT_NUMBER_HEALTH_FILTER).length, 4);
    assert.equal(applyNumberHealthFilters(sampleRows, { ...DEFAULT_NUMBER_HEALTH_FILTER, validationStatus: 'VALID' }).length, 3);
    const onlyValid = sampleRows.filter((r) => r.validationStatus === 'VALID');
    const inv = applyNumberHealthFilters(onlyValid, { ...DEFAULT_NUMBER_HEALTH_FILTER, validationStatus: 'INVALID' });
    assert.equal(inv.length, 0);
    assert.equal(emptyStateMessage({ sourceRowCount: onlyValid.length, visibleRowCount: 0 }), EMPTY_FILTER_NO_MATCH);
    assert.equal(emptyStateMessage({ sourceRowCount: 0, visibleRowCount: 0 }), EMPTY_NEVER_VALIDATED);
  });

  it('duplicate valid rows remain visible and lookup checks unique normalized once', () => {
    const valid = applyNumberHealthFilters(sampleRows, { ...DEFAULT_NUMBER_HEALTH_FILTER, validationStatus: 'VALID' });
    assert.equal(valid.filter((r) => r.normalizedNumber === '919920730373').length, 2);
    const nums = numbersForAvailabilityLookup(sampleRows, 20);
    assert.equal(nums.filter((n) => n === '919920730373').length, 1);
    assert.equal(nums.length, 2);
  });

  it('propagates availability results to all duplicate rows', () => {
    const updated = applyAvailabilityResultsToRows(sampleRows, [
      { normalizedNumber: '919920730373', availabilityStatus: 'WHATSAPP_AVAILABLE' },
    ]);
    const dups = updated.filter((r) => r.normalizedNumber === '919920730373');
    assert.equal(dups.length, 2);
    assert.ok(dups.every((r) => r.availabilityStatus === 'WHATSAPP_AVAILABLE'));
  });

  it('lookup button disabled reasons', () => {
    assert.match(lookupButtonState({ lookupEnabled: false, eligibleCount: 2 }).reason, /disabled/i);
    assert.match(lookupButtonState({ lookupEnabled: true, hasPermission: false, eligibleCount: 2 }).reason, /permission/i);
    assert.match(lookupButtonState({ lookupEnabled: true, eligibleCount: 0 }).reason, /No valid normalized/i);
    assert.equal(lookupButtonState({ lookupEnabled: true, eligibleCount: 2 }).disabled, false);
  });

  it('summary and table use same validate dataset', () => {
    const data = { summary: { total: 4, valid: 3, invalid: 1, duplicates: 2, eligible: 1 }, results: sampleRows };
    const next = applyValidateDataset(data);
    assert.equal(next.summary.total, summaryFromValidateResponse(data).total);
    assert.equal(next.sourceRows.length, 4);
  });

  it('Apply Filters / combined filters work', () => {
    const rows = applyNumberHealthFilters(sampleRows, {
      validationStatus: 'VALID',
      availabilityStatus: 'WHATSAPP_AVAILABLE',
      riskLevel: 'LOW',
    });
    assert.equal(rows.length, 1);
  });

  it('toNumberHealthListParams omits ALL', () => {
    assert.deepEqual(toNumberHealthListParams(DEFAULT_NUMBER_HEALTH_FILTER), {});
  });

  it('helper module does not include WhatsApp Chat send or Bulk send logic', () => {
    const mod = fs.readFileSync(new URL('./numberHealthListUi.js', import.meta.url), 'utf8');
    assert.ok(!mod.includes('sendMessage'));
    assert.ok(!mod.includes('sendCampaign'));
  });
});