import EmailTemplate from '../../../models/emailTemplate.model.js';
import WhatsAppBulkMatter from '../../../models/whatsappBulkMatter.model.js';
import { assertNoSecrets } from './normalize.util.js';
import { ENGINE_VERSION } from './constants.js';

const SAFE_VARS = [
    'contactFirstName', 'companyName', 'industry', 'city',
    'productCategory', 'recommendedProduct', 'salespersonName',
    'brandName', 'website', 'contactEmail', 'contactPhone',
];

export function resolvePersonalization(templateText = '', values = {}) {
    let out = String(templateText || '');
    for (const key of SAFE_VARS) {
        const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        const val = values[key];
        out = out.replace(re, val != null && String(val).trim() !== '' ? String(val) : '');
    }
    // Strip any remaining unknown placeholders rather than leaving broken tokens
    out = out.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '');
    return out.replace(/\s{2,}/g, ' ').trim();
}

function ruleMessage({ campaignType, channelDraftType, productName, companyName }) {
    const product = productName || 'our products';
    const who = companyName || 'your team';
    if (String(channelDraftType).includes('WHATSAPP')) {
        return `Hello, we would like to share information about ${product} relevant to ${who}. Please reply if you would like more details.`;
    }
    return {
        subject: `${String(campaignType || 'Product').replace(/_/g, ' ')} — ${product}`,
        body: `Dear Sir/Madam,\n\nWe are sharing approved product information about ${product} that may be relevant for ${who}.\n\nThis is a draft message and has not been sent.\n\nRegards`,
    };
}

/**
 * Generate message draft — RULE/TEMPLATE only by default.
 * AI is optional soft-fail (never invents prices/specs).
 * Message is always NOT_SENT + REVIEW_REQUIRED.
 */
export async function generateMessageDraft(companyId, {
    campaignType,
    channelDraftType,
    language = 'en',
    productReferences = [],
    templateId = null,
    personalizationValues = {},
    settings = {},
} = {}) {
    const productName = productReferences?.[0]?.productName || '';
    let engine = 'RULE';
    let templateReference = null;
    let subject = '';
    let body = '';

    try {
        if (templateId && String(channelDraftType).includes('EMAIL')) {
            const t = await EmailTemplate.findOne({ _id: templateId, companyId, isActive: { $ne: false } }).lean();
            if (t) {
                engine = 'TEMPLATE';
                templateReference = {
                    templateId: t._id,
                    templateName: t.templateName,
                    category: t.category,
                    source: 'EmailTemplate',
                };
                subject = t.subject || '';
                body = t.bodyText || t.bodyHtml || '';
            }
        } else if (templateId && String(channelDraftType).includes('WHATSAPP')) {
            const t = await WhatsAppBulkMatter.findOne({ _id: templateId, companyId, isActive: { $ne: false } }).lean();
            if (t) {
                engine = 'TEMPLATE';
                templateReference = {
                    templateId: t._id,
                    templateName: t.matterName,
                    category: t.category,
                    source: 'WhatsAppBulkMatter',
                };
                body = t.messageBody || '';
            }
        }
    } catch {
        engine = 'RULE';
    }

    if (!body) {
        const ruled = ruleMessage({
            campaignType,
            channelDraftType,
            productName,
            companyName: personalizationValues.companyName,
        });
        if (typeof ruled === 'string') body = ruled;
        else {
            subject = ruled.subject;
            body = ruled.body;
        }
        engine = engine === 'TEMPLATE' ? 'TEMPLATE' : 'RULE';
    }

    // Optional AI — soft-fail, never invent product facts
    let aiNote = null;
    if (settings.AIMessageDraftEnabled === true) {
        aiNote = 'AI unavailable — continued with rule/template draft';
        engine = engine === 'TEMPLATE' ? 'HYBRID' : 'RULE';
    }

    const resolvedBody = resolvePersonalization(body, personalizationValues);
    const resolvedSubject = resolvePersonalization(subject, personalizationValues);

    const draft = {
        engine,
        language,
        subject: resolvedSubject,
        body: resolvedBody,
        sourceSubject: subject,
        sourceBody: body,
        templateReference,
        personalizationValues: Object.fromEntries(
            Object.entries(personalizationValues || {}).filter(([k]) => SAFE_VARS.includes(k)),
        ),
        personalizationPreview: resolvePersonalization(
            'Hello {{contactFirstName}} at {{companyName}} — {{recommendedProduct}} ({{city}})',
            personalizationValues,
        ),
        status: engine === 'TEMPLATE' ? 'TEMPLATE_BASED' : 'DRAFT',
        notSent: true,
        reviewRequired: true,
        messageFlags: {
            NOT_SENT: true,
            REVIEW_REQUIRED: true,
            noInventedPricing: true,
            noInventedSpecs: true,
            noInventedDelivery: true,
        },
        aiNote,
        engineVersion: ENGINE_VERSION,
    };
    assertNoSecrets(draft);
    return draft;
}
