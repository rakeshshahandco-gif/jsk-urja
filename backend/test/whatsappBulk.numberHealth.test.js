import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMobileNumber,
  VALIDATION_STATUSES,
  VALIDATION_REASON_CODES,
  normalizeMobileStrict,
} from '../src/services/whatsappBulkNumberNormalize.util.js';
import {
  validateNumberList,
  findDuplicates,
} from '../src/services/whatsappBulkNumberHealth.service.js';
import {
  checkWhatsAppAvailabilitySequential,
  setAvailabilityLookupImpl,
  resetAvailabilityLookupImpl,
  resetAvailabilityLookupCounters,
  AVAILABILITY_STATUSES,
} from '../src/services/whatsappBulkAvailability.adapter.js';
import {
  estimatePossibleBlockOrUnreachable,
  POSSIBLE_BLOCK_WARNING,
  assertNoConfirmedBlockedStatus,
} from '../src/services/whatsappBulkDeliveryRisk.util.js';
import { isOptOutText } from '../src/services/whatsappBulkOptOut.util.js';
import { setBulkSendDelayImpl, resetBulkSendDelayImpl } from '../src/services/whatsappBulkSafeMode.util.js';
import { WHATSAPP_BULK_DEFAULT_SETTINGS } from '../src/constants/whatsappBulk.constants.js';
import { runAiAssist } from '../src/services/whatsappBulkAiAssist.service.js';
import fs from 'fs';
import path from 'path';

describe('number health normalization', () => {
  it('normalizes Indian formats to 919920730373', () => {
    for (const raw of ['+91 99207 30373', '09920730373', '9920730373', '91-9920730373', '91 99207-30373']) {
      const a = analyzeMobileNumber(raw);
      assert.equal(a.normalizedNumber, '919920730373');
      assert.equal(a.validationStatus, VALIDATION_STATUSES.VALID);
      assert.equal(a.originalNumber, raw);
    }
  });

  it('detects duplicate country code', () => {
    const a = analyzeMobileNumber('91919920730373');
    assert.equal(a.validationStatus, VALIDATION_STATUSES.INVALID);
    assert.equal(a.reasonCode, VALIDATION_REASON_CODES.DUPLICATE_COUNTRY_CODE);
  });

  it('detects invalid mobile prefix / landline', () => {
    const a = analyzeMobileNumber('912123456789');
    assert.equal(a.validationStatus, VALIDATION_STATUSES.INVALID);
    assert.ok([VALIDATION_REASON_CODES.LANDLINE_NOT_SUPPORTED, VALIDATION_REASON_CODES.INVALID_MOBILE_PREFIX].includes(a.reasonCode));
  });

  it('detects dummy number', () => {
    const a = analyzeMobileNumber('9999999999');
    assert.equal(a.reasonCode, VALIDATION_REASON_CODES.DUMMY_NUMBER);
  });

  it('preserves original number and strict helper', () => {
    const a = analyzeMobileNumber('+91 99207 30373');
    assert.equal(a.originalNumber, '+91 99207 30373');
    assert.equal(normalizeMobileStrict('9920730373'), '919920730373');
  });
});

describe('number health duplicates', () => {
  it('detects duplicates across formats in same list', () => {
    const out = validateNumberList([
      { mobile: '9920730373', displayName: 'A', sourceType: 'manual', sourceRow: 1 },
      { mobile: '+91 99207 30373', displayName: 'B', sourceType: 'customer', sourceRow: 2 },
      { mobile: '911111111111', displayName: 'C', sourceType: 'lead', sourceRow: 3 },
    ]);
    assert.ok(out.summary.duplicates >= 2);
    const groups = findDuplicates(out.results);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].normalizedNumber, '919920730373');
    assert.ok(groups[0].actionOptions.includes('Keep First'));
  });
});

describe('availability adapter safety', () => {
  afterEach(() => {
    resetAvailabilityLookupImpl();
    resetAvailabilityLookupCounters();
    resetBulkSendDelayImpl();
  });

  it('is disabled by default and does not call lookup', async () => {
    let called = 0;
    setAvailabilityLookupImpl(async () => { called += 1; return []; });
    const out = await checkWhatsAppAvailabilitySequential(['919920730373'], {
      whatsappAvailabilityCheckEnabled: false,
    });
    assert.equal(called, 0);
    assert.equal(out.results[0].availabilityStatus, AVAILABILITY_STATUSES.NOT_CHECKED);
  });

  it('runs sequential with injectable delay and daily limit', async () => {
    const calls = [];
    setBulkSendDelayImpl(async (ms) => { calls.push(['delay', ms]); });
    setAvailabilityLookupImpl(async ([n]) => {
      calls.push(['lookup', n]);
      return [{ normalizedNumber: n, availabilityStatus: AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE, checkSource: 'mock' }];
    });
    const out = await checkWhatsAppAvailabilitySequential(
      ['911111111111', '911111111112', '911111111113'],
      {
        whatsappAvailabilityCheckEnabled: true,
        availabilityLookupDailyLimit: 2,
        availabilityLookupMinDelaySeconds: 1,
        availabilityLookupMaxDelaySeconds: 1,
        stopOnThrottle: true,
      },
    );
    assert.equal(out.lookedUp, 2);
    assert.equal(out.stoppedReason, 'DAILY_LIMIT');
    assert.ok(calls.filter((c) => c[0] === 'lookup').length === 2);
  });

  it('never treats UNKNOWN as NOT_ON_WHATSAPP', async () => {
    setAvailabilityLookupImpl(async ([n]) => [{
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.UNKNOWN,
      checkSource: 'mock',
    }]);
    const out = await checkWhatsAppAvailabilitySequential(['911111111111'], {
      whatsappAvailabilityCheckEnabled: true,
      availabilityLookupMinDelaySeconds: 1,
      availabilityLookupMaxDelaySeconds: 1,
    });
    assert.equal(out.results[0].availabilityStatus, AVAILABILITY_STATUSES.UNKNOWN);
    assert.notEqual(out.results[0].availabilityStatus, AVAILABILITY_STATUSES.NOT_ON_WHATSAPP);
  });

  it('stops on throttle', async () => {
    setAvailabilityLookupImpl(async ([n]) => [{
      normalizedNumber: n,
      availabilityStatus: AVAILABILITY_STATUSES.RATE_LIMITED,
      errorCode: 'THROTTLED',
      checkSource: 'mock',
    }]);
    setBulkSendDelayImpl(async () => {});
    const out = await checkWhatsAppAvailabilitySequential(['911111111111', '911111111112'], {
      whatsappAvailabilityCheckEnabled: true,
      stopOnThrottle: true,
      availabilityLookupMinDelaySeconds: 1,
      availabilityLookupMaxDelaySeconds: 1,
    });
    assert.equal(out.stoppedReason, 'THROTTLED');
    assert.equal(out.results[1].availabilityStatus, AVAILABILITY_STATUSES.RATE_LIMITED);
  });

  it('adapter source has no eager baileys import and no sendMessage', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/services/whatsappBulkAvailability.adapter.js'), 'utf8');
    assert.doesNotMatch(src, /import\s+.*whatsapp\.service/);
    assert.match(src, /await import\('\.\/whatsapp\.service\.js'\)/);
    assert.doesNotMatch(src, /sendMessage\(/);
  });
});

describe('delivery risk estimation', () => {
  it('one failure does not mark high risk', () => {
    const r = estimatePossibleBlockOrUnreachable({ failedAttempts: 1, distinctFailureDays: 1 });
    assert.equal(r.riskLevel, 'LOW');
    assert.equal(r.blockingConfirmed, false);
    assert.match(r.warning, /estimated delivery risk/i);
  });

  it('repeated historical failures can raise estimated risk', () => {
    const r = estimatePossibleBlockOrUnreachable({
      failedAttempts: 3,
      distinctFailureDays: 3,
      whatsappAvailable: true,
      hadPriorSuccessfulDelivery: true,
      sessionWasHealthy: true,
      campaignPeersDeliveredNormally: true,
      broadCampaignFailure: false,
    });
    assert.ok(['MEDIUM', 'HIGH'].includes(r.riskLevel));
    assert.equal(assertNoConfirmedBlockedStatus(r.status), true);
  });

  it('rejects confirmed-block labels and keeps estimated status only', () => {
    assert.equal(assertNoConfirmedBlockedStatus('CONFIRMED_BLOCKED'), false);
    assert.equal(assertNoConfirmedBlockedStatus('BLOCKED_BY_CUSTOMER'), false);
    assert.equal(assertNoConfirmedBlockedStatus('DEFINITELY_BLOCKED'), false);
    assert.equal(assertNoConfirmedBlockedStatus('POSSIBLE_BLOCK_OR_UNREACHABLE'), true);
    assert.match(POSSIBLE_BLOCK_WARNING, /does not provide reliable confirmation/i);
    const src = fs.readFileSync(path.join(process.cwd(), 'src/services/whatsappBulkDeliveryRisk.util.js'), 'utf8');
    assert.match(src, /POSSIBLE_BLOCK_OR_UNREACHABLE/);
    assert.doesNotMatch(src, /status:\s*'CONFIRMED/);
  });
});

describe('opt-out wording', () => {
  it('detects English and Indic opt-out phrases', () => {
    assert.equal(isOptOutText('Please STOP messaging me'), true);
    assert.equal(isOptOutText('संदेश मत भेजो'), true);
    assert.equal(isOptOutText('Hello interested'), false);
  });
});

describe('number health defaults and AI report drafts', () => {
  it('availability lookup disabled by default; number health on', () => {
    assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.whatsappAvailabilityCheckEnabled, false);
    assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.numberHealthEnabled, true);
    assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.aiAssistantEnabled, false);
  });

  it('AI report draft is DRAFT only and cannot confirm blocking', async () => {
    const out = await runAiAssist('x', 'explain_delivery_risk', {
      language: 'en',
      invalidCount: 2,
      duplicateCount: 1,
      eligibleCount: 3,
    }, { settings: { aiAssistantEnabled: true } });
    assert.equal(out.status, 'DRAFT');
    assert.equal(out.requiresHumanReview, true);
    assert.equal(out.outboundSent, false);
    assert.equal(out.networkCalled, false);
    assert.equal(out.blockingConfirmed, false);
    assert.match(out.draftText, /blocking cannot be confirmed/i);
  });

  it('multilingual number health summaries', async () => {
    for (const language of ['en', 'hi', 'gu']) {
      const out = await runAiAssist('x', 'number_health_management_summary', { language }, { settings: { aiAssistantEnabled: true } });
      assert.equal(out.status, 'DRAFT');
      assert.ok(out.draftText);
    }
  });
});

describe('availability status mapping via injectable Chat-like impl', () => {
  afterEach(() => {
    resetAvailabilityLookupImpl();
    resetAvailabilityLookupCounters();
    resetBulkSendDelayImpl();
  });

  it('maps AVAILABLE / NOT_ON_WHATSAPP / UNKNOWN / CHECK_FAILED / METHOD_UNSUPPORTED / SESSION_NOT_CONNECTED', async () => {
    setBulkSendDelayImpl(async () => {});
    const seq = [
      { normalizedNumber: '911111111111', availabilityStatus: AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE },
      { normalizedNumber: '911111111112', availabilityStatus: AVAILABILITY_STATUSES.NOT_ON_WHATSAPP },
      { normalizedNumber: '911111111113', availabilityStatus: AVAILABILITY_STATUSES.UNKNOWN },
      { normalizedNumber: '911111111114', availabilityStatus: AVAILABILITY_STATUSES.CHECK_FAILED, errorCode: 'LOOKUP_ERROR' },
      { normalizedNumber: '911111111115', availabilityStatus: AVAILABILITY_STATUSES.METHOD_UNSUPPORTED, errorCode: 'METHOD_UNSUPPORTED' },
      { normalizedNumber: '911111111116', availabilityStatus: AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED, errorCode: 'SESSION_NOT_CONNECTED' },
    ];
    let i = 0;
    setAvailabilityLookupImpl(async ([n]) => {
      const row = { ...seq[i], normalizedNumber: n };
      i += 1;
      return [row];
    });
    const out = await checkWhatsAppAvailabilitySequential(seq.map((r) => r.normalizedNumber), {
      whatsappAvailabilityCheckEnabled: true,
      stopOnSessionError: false,
      stopOnThrottle: false,
      availabilityLookupMinDelaySeconds: 1,
      availabilityLookupMaxDelaySeconds: 1,
      availabilityLookupDailyLimit: 50,
    });
    assert.equal(out.results[0].availabilityStatus, AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE);
    assert.equal(out.results[1].availabilityStatus, AVAILABILITY_STATUSES.NOT_ON_WHATSAPP);
    assert.equal(out.results[2].availabilityStatus, AVAILABILITY_STATUSES.UNKNOWN);
    assert.equal(out.results[3].availabilityStatus, AVAILABILITY_STATUSES.CHECK_FAILED);
    assert.equal(out.results[4].availabilityStatus, AVAILABILITY_STATUSES.METHOD_UNSUPPORTED);
    assert.equal(out.results[5].availabilityStatus, AVAILABILITY_STATUSES.SESSION_NOT_CONNECTED);
  });

  it('dedupes normalized numbers before lookup', async () => {
    const calls = [];
    setBulkSendDelayImpl(async () => {});
    setAvailabilityLookupImpl(async ([n]) => {
      calls.push(n);
      return [{ normalizedNumber: n, availabilityStatus: AVAILABILITY_STATUSES.WHATSAPP_AVAILABLE }];
    });
    const out = await checkWhatsAppAvailabilitySequential(
      ['919920730373', '919920730373', '919920730373'],
      {
        whatsappAvailabilityCheckEnabled: true,
        availabilityLookupMinDelaySeconds: 1,
        availabilityLookupMaxDelaySeconds: 1,
      },
    );
    assert.equal(calls.length, 1);
    assert.equal(out.lookedUp, 1);
  });

  it('whatsapp.service exposes checkOnWhatsApp and does not add second session/QR in that method', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/services/whatsapp.service.js'), 'utf8');
    assert.match(src, /async checkOnWhatsApp\(/);
    assert.match(src, /sock\.onWhatsApp/);
    const start = src.indexOf('async checkOnWhatsApp(normalizedNumbers');
    const end = src.indexOf('class WhatsAppServiceManager');
    const method = src.slice(start, end);
    assert.ok(method.includes('sock.onWhatsApp'));
    assert.doesNotMatch(method, /makeWASocket/);
    assert.doesNotMatch(method, /requestPairingCode/);
    assert.doesNotMatch(method, /sendMessage\(/);
  });
});
