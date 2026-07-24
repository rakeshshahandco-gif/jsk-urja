/**
 * WhatsApp Bulk Number Health service
 */
import ExcelJS from 'exceljs';
import WhatsAppBulkNumberHealth from '../models/whatsappBulkNumberHealth.model.js';
import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import { getSettings, assertModuleEnabled } from './whatsappBulkSettings.service.js';
import { getBlacklistedSet, normalizeMobile } from './whatsappBulkRecipient.service.js';
import { analyzeMobileNumber, VALIDATION_STATUSES } from './whatsappBulkNumberNormalize.util.js';
import {
  checkWhatsAppAvailabilitySequential,
  AVAILABILITY_STATUSES,
} from './whatsappBulkAvailability.adapter.js';
import {
  estimatePossibleBlockOrUnreachable,
  POSSIBLE_BLOCK_WARNING,
} from './whatsappBulkDeliveryRisk.util.js';
import { ApiError } from '../utils/ApiError.js';

function cacheExpiry(days) {
  const d = Math.max(1, Number(days) || 7);
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

export function buildHealthRowFromAnalysis(analysis, extra = {}) {
  const eligible =
    analysis.validationStatus === VALIDATION_STATUSES.VALID &&
    !extra.blacklisted &&
    !extra.optedOut &&
    extra.availabilityStatus !== AVAILABILITY_STATUSES.NOT_ON_WHATSAPP;
  return {
    originalNumber: analysis.originalNumber,
    originalNumberSample: analysis.originalNumber,
    normalizedNumber: analysis.normalizedNumber,
    countryCode: analysis.countryCode,
    nationalNumber: analysis.nationalNumber,
    validationStatus: analysis.validationStatus,
    reasonCode: analysis.reasonCode,
    validationReason: analysis.validationReason,
    suggestedCorrection: analysis.suggestedCorrection,
    availabilityStatus: extra.availabilityStatus || AVAILABILITY_STATUSES.NOT_CHECKED,
    duplicateCount: extra.duplicateCount || 0,
    blacklisted: !!extra.blacklisted,
    optedOut: !!extra.optedOut,
    riskLevel: extra.riskLevel || 'UNKNOWN',
    riskMeta: extra.riskMeta || null,
    displayName: extra.displayName || '',
    sourceType: extra.sourceType || '',
    sourceRef: extra.sourceRef || '',
    sourceRow: extra.sourceRow ?? null,
    eligible: eligible && analysis.eligibleForCampaign,
    warning: POSSIBLE_BLOCK_WARNING,
  };
}

export function validateNumberList(rawItems = [], options = {}) {
  const countryDefault = options.countryDefault || '91';
  const rows = [];
  let valid = 0;
  let invalid = 0;
  let unknown = 0;
  rawItems.forEach((item, idx) => {
    const original = typeof item === 'string' ? item : item?.mobile || item?.originalNumber || '';
    const analysis = analyzeMobileNumber(original, { countryDefault });
    if (analysis.validationStatus === VALIDATION_STATUSES.VALID) valid += 1;
    else if (analysis.validationStatus === VALIDATION_STATUSES.UNKNOWN) unknown += 1;
    else invalid += 1;
    rows.push(buildHealthRowFromAnalysis(analysis, {
      displayName: item?.displayName || '',
      sourceType: item?.sourceType || item?.source || 'manual',
      sourceRef: item?.sourceRef || '',
      sourceRow: item?.sourceRow ?? idx + 1,
    }));
  });
  const counts = new Map();
  for (const r of rows) {
    if (!r.normalizedNumber) continue;
    counts.set(r.normalizedNumber, (counts.get(r.normalizedNumber) || 0) + 1);
  }
  let duplicates = 0;
  for (const r of rows) {
    if (r.normalizedNumber && counts.get(r.normalizedNumber) > 1) {
      r.duplicateCount = counts.get(r.normalizedNumber);
      duplicates += 1;
      r.eligible = false;
    }
  }
  return {
    summary: {
      total: rows.length,
      valid,
      invalid,
      unknown,
      duplicates,
      eligible: rows.filter((r) => r.eligible && (r.duplicateCount || 0) <= 1).length,
    },
    results: rows,
  };
}

export function findDuplicates(rows = []) {
  const byNorm = new Map();
  for (const r of rows) {
    if (!r.normalizedNumber) continue;
    if (!byNorm.has(r.normalizedNumber)) byNorm.set(r.normalizedNumber, []);
    byNorm.get(r.normalizedNumber).push(r);
  }
  const groups = [];
  for (const [normalizedNumber, list] of byNorm.entries()) {
    if (list.length < 2) continue;
    groups.push({
      normalizedNumber,
      duplicateCount: list.length,
      originals: list.map((x) => x.originalNumber),
      names: list.map((x) => x.displayName || ''),
      sources: list.map((x) => ({ sourceType: x.sourceType, sourceRef: x.sourceRef, sourceRow: x.sourceRow })),
      recommendedPrimary: list[0],
      actionOptions: ['Keep First', 'Keep Selected', 'Skip Duplicate', 'Review Manually', 'Export Duplicate Report'],
    });
  }
  return groups;
}

export async function upsertHealthRecords(companyId, rows, userId) {
  const ops = [];
  for (const r of rows) {
    if (!r.normalizedNumber) continue;
    ops.push({
      updateOne: {
        filter: { companyId, normalizedNumber: r.normalizedNumber },
        update: {
          $set: {
            originalNumberSample: r.originalNumber || '',
            countryCode: r.countryCode || '',
            nationalNumber: r.nationalNumber || '',
            validationStatus: r.validationStatus,
            reasonCode: r.reasonCode,
            validationReason: r.validationReason,
            availabilityStatus: r.availabilityStatus || AVAILABILITY_STATUSES.NOT_CHECKED,
            duplicateCount: r.duplicateCount || 0,
            blacklisted: !!r.blacklisted,
            optedOut: !!r.optedOut,
            riskLevel: r.riskLevel || 'UNKNOWN',
            riskMeta: r.riskMeta || null,
            displayName: r.displayName || '',
            sourceType: r.sourceType || '',
            sourceRef: r.sourceRef || '',
            eligible: !!r.eligible,
            checkedBy: userId || null,
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await WhatsAppBulkNumberHealth.bulkWrite(ops, { ordered: false });
  return ops.length;
}

export async function getNumberHealthSummary(companyId) {
  await assertModuleEnabled(companyId);
  const settings = await getSettings(companyId);
  if (settings.numberHealthEnabled === false) {
    throw new ApiError(403, 'Number Health is disabled for this company');
  }
  const rows = await WhatsAppBulkNumberHealth.find({ companyId }).lean();
  return {
    total: rows.length,
    valid: rows.filter((r) => r.validationStatus === 'VALID').length,
    invalid: rows.filter((r) => r.validationStatus === 'INVALID').length,
    duplicates: rows.filter((r) => (r.duplicateCount || 0) > 1).length,
    whatsappAvailable: rows.filter((r) => r.availabilityStatus === 'WHATSAPP_AVAILABLE').length,
    notOnWhatsApp: rows.filter((r) => r.availabilityStatus === 'NOT_ON_WHATSAPP').length,
    unknown: rows.filter((r) => r.availabilityStatus === 'UNKNOWN' || r.validationStatus === 'UNKNOWN').length,
    checkFailed: rows.filter((r) => r.availabilityStatus === 'CHECK_FAILED').length,
    blacklisted: rows.filter((r) => r.blacklisted).length,
    optedOut: rows.filter((r) => r.optedOut).length,
    possibleDeliveryRisk: rows.filter((r) => ['MEDIUM', 'HIGH'].includes(r.riskLevel)).length,
    eligible: rows.filter((r) => r.eligible).length,
    warning: POSSIBLE_BLOCK_WARNING,
  };
}

export async function listNumberHealth(companyId, query = {}) {
  await assertModuleEnabled(companyId);
  const filter = { companyId };
  if (query.validationStatus) filter.validationStatus = query.validationStatus;
  if (query.reasonCode) filter.reasonCode = query.reasonCode;
  if (query.availabilityStatus) filter.availabilityStatus = query.availabilityStatus;
  if (query.riskLevel) filter.riskLevel = query.riskLevel;
  if (query.blacklisted === 'true' || query.blacklisted === true) filter.blacklisted = true;
  if (query.optedOut === 'true' || query.optedOut === true) filter.optedOut = true;
  if (query.eligible === 'true' || query.eligible === true) filter.eligible = true;
  if (query.eligible === 'false' || query.eligible === false) filter.eligible = false;
  if (query.duplicate === 'true' || query.duplicate === true) filter.duplicateCount = { $gt: 1 };
  if (query.sourceType) filter.sourceType = query.sourceType;
  const limit = Math.min(Number(query.limit) || 200, 500);
  const results = await WhatsAppBulkNumberHealth.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
  return { results, warning: POSSIBLE_BLOCK_WARNING };
}

export async function validateAndStore(companyId, items, userId) {
  await assertModuleEnabled(companyId);
  const settings = await getSettings(companyId);
  const blacklist = await getBlacklistedSet(companyId);
  const validated = validateNumberList(items, { countryDefault: settings.countryDefault || '91' });
  for (const r of validated.results) {
    const mobile = r.normalizedNumber || normalizeMobile(r.originalNumber);
    if (mobile && blacklist.has(mobile)) {
      r.blacklisted = true;
      r.optedOut = true;
      r.eligible = false;
    }
  }
  await upsertHealthRecords(companyId, validated.results, userId);
  return { ...validated, duplicates: findDuplicates(validated.results), warning: POSSIBLE_BLOCK_WARNING };
}

export async function runAvailabilityLookup(companyId, normalizedNumbers, userId, { recheckUnknownOnly = false } = {}) {
  await assertModuleEnabled(companyId);
  const settings = await getSettings(companyId);
  if (settings.whatsappAvailabilityCheckEnabled !== true) {
    throw new ApiError(403, 'WhatsApp availability lookup is disabled for this company');
  }
  let numbers = [...new Set((normalizedNumbers || []).map(String).filter(Boolean))].slice(0, 20);
  if (recheckUnknownOnly) {
    const q = { companyId, availabilityStatus: { $in: ['UNKNOWN', 'NOT_CHECKED', 'CHECK_FAILED'] } };
    if (numbers.length) q.normalizedNumber = { $in: numbers };
    const unknownRows = await WhatsAppBulkNumberHealth.find(q).select('normalizedNumber').lean();
    numbers = unknownRows.map((r) => r.normalizedNumber);
  }
  const cached = await WhatsAppBulkNumberHealth.find({ companyId, normalizedNumber: { $in: numbers } }).lean();
  const cacheMap = new Map(cached.map((c) => [c.normalizedNumber, c]));
  const toCheck = [];
  let reused = 0;
  const now = Date.now();
  for (const n of numbers) {
    const c = cacheMap.get(n);
    if (c && c.availabilityStatus && !['UNKNOWN', 'NOT_CHECKED', 'CHECK_FAILED'].includes(c.availabilityStatus) && c.cacheExpiresAt && new Date(c.cacheExpiresAt).getTime() > now) {
      reused += 1;
    } else {
      toCheck.push(n);
    }
  }
  const lookup = await checkWhatsAppAvailabilitySequential(toCheck, settings, { userId });
  const expires = cacheExpiry(settings.availabilityCacheDays || 7);
  for (const row of lookup.results) {
    await WhatsAppBulkNumberHealth.findOneAndUpdate(
      { companyId, normalizedNumber: row.normalizedNumber },
      { $set: { availabilityStatus: row.availabilityStatus, checkedAt: new Date(), cacheExpiresAt: expires, checkSource: row.checkSource || 'crm_whatsapp_adapter', errorCode: row.errorCode || '', checkedBy: userId || null } },
      { upsert: true },
    );
  }
  return { lookedUp: lookup.lookedUp, stoppedReason: lookup.stoppedReason, reusedCache: reused, results: lookup.results, warning: POSSIBLE_BLOCK_WARNING };
}

export async function campaignPrecheck(companyId, campaignId) {
  await assertModuleEnabled(companyId);
  const campaign = await WhatsAppBulkCampaign.findOne({ _id: campaignId, companyId }).lean();
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  const recipients = await WhatsAppBulkCampaignRecipient.find({ companyId, campaignId }).lean();
  const blacklist = await getBlacklistedSet(companyId);
  const settings = await getSettings(companyId);
  let invalid = 0, duplicate = 0, blacklisted = 0, optedOut = 0, notOnWhatsApp = 0, unknownWa = 0, eligible = 0, requiringReview = 0;
  const seen = new Set();
  const healthDocs = await WhatsAppBulkNumberHealth.find({ companyId, normalizedNumber: { $in: recipients.map((r) => r.mobile).filter(Boolean) } }).lean();
  const healthMap = new Map(healthDocs.map((h) => [h.normalizedNumber, h]));
  for (const r of recipients) {
    const analysis = analyzeMobileNumber(r.mobile, { countryDefault: settings.countryDefault || '91' });
    if (analysis.validationStatus !== VALIDATION_STATUSES.VALID) { invalid += 1; requiringReview += 1; continue; }
    const n = analysis.normalizedNumber;
    if (seen.has(n)) { duplicate += 1; requiringReview += 1; continue; }
    seen.add(n);
    if (blacklist.has(n) || r.status === 'blacklisted') { blacklisted += 1; optedOut += 1; continue; }
    const h = healthMap.get(n);
    if (h?.availabilityStatus === 'NOT_ON_WHATSAPP') { notOnWhatsApp += 1; continue; }
    if (!h?.availabilityStatus || ['UNKNOWN', 'NOT_CHECKED', 'CHECK_FAILED'].includes(h.availabilityStatus)) {
      unknownWa += 1;
      if (settings.excludeUnknownWhatsAppStatus === true) { requiringReview += 1; continue; }
    }
    if (r.status === 'pending') eligible += 1;
  }
  const blockers = [];
  if (!String(campaign.messageBody || '').trim() && !campaign.matterId) blockers.push('EMPTY_MESSAGE');
  if (eligible <= 0) blockers.push('NO_ELIGIBLE_RECIPIENTS');
  if (settings.requireManualApproval !== false && !campaign.manualApprovedAt) blockers.push('APPROVAL_MISSING');
  if (settings.mandatoryTestSend !== false && !campaign.testSendCompletedAt) blockers.push('TEST_SEND_MISSING');
  if (settings.enabled === false) blockers.push('MODULE_DISABLED');
  return {
    campaignId,
    campaignName: campaign.campaignName,
    status: campaign.status,
    summary: { totalImported: recipients.length, normalized: seen.size, valid: recipients.length - invalid, invalid, duplicate, blacklisted, optedOut, notOnWhatsApp, unknownWhatsAppStatus: unknownWa, recentlyContacted: 0, eligible, requiringReview },
    canQueue: blockers.length === 0 && eligible > 0,
    blockers,
    warning: POSSIBLE_BLOCK_WARNING,
    note: 'UNKNOWN WhatsApp status is not auto-excluded unless excludeUnknownWhatsAppStatus is enabled.',
  };
}

export async function computeRiskForNumber(companyId, normalizedNumber) {
  const history = await WhatsAppBulkCampaignRecipient.find({ companyId, mobile: normalizedNumber }).select('status sentAt errorMessage updatedAt createdAt').lean();
  const failed = history.filter((h) => h.status === 'failed');
  const sent = history.filter((h) => h.status === 'sent');
  const failureDays = new Set(failed.map((f) => (f.updatedAt || f.createdAt ? new Date(f.updatedAt || f.createdAt).toISOString().slice(0, 10) : '')).filter(Boolean));
  const health = await WhatsAppBulkNumberHealth.findOne({ companyId, normalizedNumber }).lean();
  const risk = estimatePossibleBlockOrUnreachable({
    failedAttempts: failed.length,
    distinctFailureDays: failureDays.size,
    hadPriorSuccessfulDelivery: sent.length > 0,
    whatsappAvailable: health?.availabilityStatus === 'WHATSAPP_AVAILABLE',
    campaignPeersDeliveredNormally: true,
    sessionWasHealthy: true,
    broadCampaignFailure: false,
  });
  await WhatsAppBulkNumberHealth.findOneAndUpdate(
    { companyId, normalizedNumber },
    { $set: { riskLevel: risk.riskLevel, riskMeta: risk, lastDeliveryStatus: sent.length ? 'sent' : failed.length ? 'failed' : '' } },
    { upsert: true },
  );
  const failDates = failed.map((f) => f.updatedAt || f.createdAt).filter(Boolean).sort();
  return {
    normalizedNumber,
    ...risk,
    lastSuccessfulDelivery: sent.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0))[0]?.sentAt || null,
    failedAttemptsCount: failed.length,
    firstFailedDate: failDates[0] || null,
    latestFailedDate: failDates.length ? failDates[failDates.length - 1] : null,
    whatsappAvailabilityStatus: health?.availabilityStatus || 'NOT_CHECKED',
  };
}

export async function exportNumberHealthExcel(companyId, query = {}) {
  const { results } = await listNumberHealth(companyId, { ...query, limit: 500 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Number Health');
  ws.columns = [
    { header: 'Name', key: 'displayName', width: 24 },
    { header: 'Source', key: 'sourceType', width: 14 },
    { header: 'Original Number', key: 'originalNumberSample', width: 18 },
    { header: 'Normalized Number', key: 'normalizedNumber', width: 18 },
    { header: 'Country', key: 'countryCode', width: 10 },
    { header: 'Validation Status', key: 'validationStatus', width: 14 },
    { header: 'Reason Code', key: 'reasonCode', width: 18 },
    { header: 'WhatsApp Status', key: 'availabilityStatus', width: 18 },
    { header: 'Duplicate Count', key: 'duplicateCount', width: 12 },
    { header: 'Blacklist', key: 'blacklisted', width: 10 },
    { header: 'Opt-out', key: 'optedOut', width: 10 },
    { header: 'Risk Level', key: 'riskLevel', width: 12 },
    { header: 'Eligible', key: 'eligible', width: 10 },
    { header: 'Last Checked', key: 'checkedAt', width: 20 },
  ];
  for (const r of results) {
    ws.addRow({ ...r, blacklisted: r.blacklisted ? 'Yes' : 'No', optedOut: r.optedOut ? 'Yes' : 'No', eligible: r.eligible ? 'Yes' : 'No', checkedAt: r.checkedAt ? new Date(r.checkedAt).toISOString() : '' });
  }
  ws.addRow([]);
  ws.addRow({ displayName: POSSIBLE_BLOCK_WARNING });
  return wb.xlsx.writeBuffer();
}
