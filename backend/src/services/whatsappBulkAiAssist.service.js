/**
 * WhatsApp Bulk — optional AI Campaign Assistant (isolated).
 * Disabled by default. Uses deterministic/null templates only — no paid provider.
 * Never sends WhatsApp messages or starts a campaign queue.
 */
import { ApiError } from '../utils/ApiError.js';
import { getSettings } from './whatsappBulkSettings.service.js';
import { getBlacklistedSet, normalizeMobile, processRecipientCandidates } from './whatsappBulkRecipient.service.js';

const PROVIDER = 'null_template_v1';

function assertAssistEnabled(settings) {
  if (!settings.aiAssistantEnabled) {
    throw new ApiError(403, 'AI Campaign Assistant is disabled for this company');
  }
}

function personalize(template, { name = '', productInterest = '', category = '' } = {}) {
  return String(template || '')
    .replace(/\{\{name\}\}/gi, name || 'Customer')
    .replace(/\{\{product\}\}/gi, productInterest || 'our products')
    .replace(/\{\{category\}\}/gi, category || 'your industry');
}

const DRAFT_TEMPLATES = {
  en: 'Hello {{name}}, thank you for your interest in {{product}}. We would be happy to share details relevant to {{category}}. Reply STOP to opt out.',
  hi: 'नमस्ते {{name}}, {{product}} में आपकी रुचि के लिए धन्यवाद। {{category}} से जुड़े विवरण साझा कर सकते हैं। STOP लिखकर ऑप्ट-आउट करें।',
  gu: 'નમસ્તે {{name}}, {{product}} માં તમારી રુચિ બદલ આભાર. {{category}} માટે વિગતો શેર કરી શકીએ. STOP લખીને opt-out કરો.',
};

/**
 * @param {object} [options]
 * @param {object} [options.settings] — inject settings (unit tests); production omits this
 */
export async function runAiAssist(companyId, action, payload = {}, options = {}) {
  const settings = options.settings || await getSettings(companyId);
  assertAssistEnabled(settings);

  const language = String(payload.language || 'en').toLowerCase();
  const base = DRAFT_TEMPLATES[language] || DRAFT_TEMPLATES.en;

  switch (action) {
    case 'draft_message':
    case 'rewrite_message':
    case 'multilingual':
    case 'personalize':
    case 'follow_up_draft': {
      const draftText = personalize(payload.seedText || base, payload);
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        status: 'DRAFT',
        requiresHumanReview: true,
        draftText,
        warnings: ['AI assistance is template-based only. Human review required before any send.'],
      };
    }
    case 'segmentation_suggestions':
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        suggestions: [
          { filter: 'customerTypes', value: payload.category || 'Dealer', reason: 'Focus on one business category' },
          { filter: 'activeOnly', value: true, reason: 'Prefer active customers' },
          { filter: 'cities', value: payload.city ? [payload.city] : [], reason: 'Optional city focus' },
        ],
        status: 'DRAFT',
        requiresHumanReview: true,
      };
    case 'validate_recipients': {
      const blacklist = options.blacklist || await getBlacklistedSet(companyId);
      const candidates = (payload.mobiles || []).map((m) => ({
        mobile: m,
        sourceType: 'manual',
        recipientKey: normalizeMobile(m) || String(m),
      }));
      const result = processRecipientCandidates(candidates, blacklist, {});
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        ...result,
        spamWarning: /free|winner|urgent|click here|lottery/i.test(String(payload.messageBody || ''))
          ? 'Message may look spam-like — rewrite before approval'
          : null,
        suggestedBatchSize: settings.defaultBatchSize,
        suggestedDailyLimit: settings.dailyLimit,
        suggestedSendWindow: { start: settings.sendWindowStart, end: settings.sendWindowEnd, timezone: settings.defaultTimezone },
        status: 'DRAFT',
        requiresHumanReview: true,
      };
    }
    case 'campaign_summary':
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        summary: {
          campaignName: payload.campaignName || '',
          recipientCount: payload.recipientCount || 0,
          sendMode: payload.sendMode || 'SAFE',
          nextSteps: ['HUMAN REVIEW', 'TEST SEND', 'FINAL CONFIRMATION', 'QUEUE'],
        },
        status: 'DRAFT',
        requiresHumanReview: true,
      };
    case 'classify_reply': {
      const text = String(payload.text || '').toLowerCase();
      let tag = 'unknown';
      if (/not interested|no thanks|stop|unsubscribe/.test(text)) tag = 'not_interested';
      else if (/call later|later|busy/.test(text)) tag = 'call_later';
      else if (/quote|quotation|price|rate/.test(text)) tag = 'quotation_required';
      else if (/interested|yes|please send|details/.test(text)) tag = 'interested';
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        tag,
        status: 'DRAFT',
        requiresHumanReview: true,
      };
    }
    case 'explain_invalid_numbers':
    case 'summarize_duplicates':
    case 'campaign_report_summary':
    case 'explain_delivery_risk':
    case 'number_health_management_summary': {
      const language = String(payload.language || 'en').toLowerCase();
      const riskNote = 'Possible delivery risk; blocking cannot be confirmed.';
      const drafts = {
        en: `Number Health draft summary: invalid=${payload.invalidCount || 0}, duplicates=${payload.duplicateCount || 0}, eligible=${payload.eligibleCount || 0}. ${riskNote} Human review required before any campaign action.`,
        hi: `नंबर हेल्थ ड्राफ्ट सारांश: अमान्य=${payload.invalidCount || 0}, डुप्लिकेट=${payload.duplicateCount || 0}, योग्य=${payload.eligibleCount || 0}. ${riskNote} किसी भी अभियान कार्रवाई से पहले मानव समीक्षा आवश्यक है।`,
        gu: `નંબર હેલ્થ ડ્રાફ્ટ સારાંશ: અમાન્ય=${payload.invalidCount || 0}, ડુપ્લિકેટ=${payload.duplicateCount || 0}, પાત્ર=${payload.eligibleCount || 0}. ${riskNote} કોઈપણ કેમ્પેન પગલાં પહેલાં માનવ સમીક્ષા જરૂરી છે.`,
      };
      return {
        success: true,
        action,
        provider: PROVIDER,
        networkCalled: false,
        outboundSent: false,
        status: 'DRAFT',
        requiresHumanReview: true,
        draftText: drafts[language] || drafts.en,
        blockingConfirmed: false,
        warning: riskNote,
        suggestions: [
          'Review invalid reason codes manually',
          'Keep first or selected duplicate only — do not merge masters',
          'Do not treat UNKNOWN WhatsApp status as NOT_ON_WHATSAPP',
          'Do not auto-blacklist from estimated delivery risk',
        ],
      };
    }
    default:
      throw new ApiError(400, 'Unknown AI assist action');
  }
}

export default { runAiAssist };
