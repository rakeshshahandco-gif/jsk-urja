import crypto from 'crypto';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { ExtractorSettings } from '../../../models/extractorSettings.model.js';

export function isJustdialConfigured(settings) {
    const token = getJustdialWebhookToken(settings);
    return !!token;
}

export function getJustdialConfigMessage(settings, baseUrl = '') {
    const token = getJustdialWebhookToken(settings);
    if (token) {
        const url = buildJustdialWebhookUrl(baseUrl, token);
        return url
            ? `Justdial webhook is ready. Share this URL with your Justdial account manager: ${url}`
            : 'Justdial webhook token is set. Open Settings to copy the webhook URL for your Justdial account manager.';
    }
    return 'Justdial is not configured. Enable Data Extractor and open Settings to generate your webhook URL, then share it with your Justdial account manager.';
}

export function getJustdialWebhookToken(settings) {
    const connectors = settings?.sourceConnectors || {};
    const jd = connectors.justdial || {};
    return String(jd.webhookToken || '').trim();
}

export function buildJustdialWebhookUrl(baseUrl, token) {
    const base = String(baseUrl || process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, '');
    if (!base || !token) return '';
    return `${base}/api/v1/data-extractor/webhooks/justdial/${token}`;
}

export async function ensureJustdialWebhookToken(companyId) {
    let settings = await ExtractorSettings.findOne({ companyId });
    if (!settings) {
        settings = await ExtractorSettings.create({ companyId, moduleEnabled: false });
    }
    const existing = getJustdialWebhookToken(settings.toObject ? settings.toObject() : settings);
    if (existing) return existing;

    const token = crypto.randomBytes(24).toString('hex');
    settings.sourceConnectors = {
        ...(settings.sourceConnectors || {}),
        justdial: {
            ...(settings.sourceConnectors?.justdial || {}),
            webhookToken: token,
            configuredAt: new Date(),
        },
    };
    await settings.save();
    return token;
}

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function pickField(payload, keys) {
    for (const key of keys) {
        const val = payload[key];
        if (val !== undefined && val !== null && String(val).trim()) {
            return normalizeText(val);
        }
    }
    return '';
}

export function mapJustdialWebhookLead(payload, searchKeyword = '') {
    const companyName = pickField(payload, [
        'company', 'company_name', 'Company', 'business_name', 'sender_company', 'name', 'Name',
    ]) || 'Justdial Lead';
    const product = pickField(payload, ['category', 'Category', 'product', 'service', 'query']);

    return {
        companyName,
        website: pickField(payload, ['website', 'Website', 'url']),
        normalizedDomain: '',
        sourcePlatform: 'justdial',
        sourceUrl: 'https://www.justdial.com/',
        sourceReference: pickField(payload, ['lead_id', 'LeadId', 'id', 'docid', 'unique_id']),
        email: pickField(payload, ['email', 'Email', 'sender_email']),
        phone: pickField(payload, ['phone', 'Phone', 'mobile', 'Mobile', 'contact_number']),
        mobile: pickField(payload, ['mobile', 'Mobile', 'phone', 'Phone']),
        address: pickField(payload, ['address', 'Address', 'locality']),
        city: pickField(payload, ['city', 'City']),
        stateProvince: pickField(payload, ['state', 'State']),
        country: pickField(payload, ['country', 'Country']) || 'India',
        pincode: pickField(payload, ['pincode', 'Pincode', 'zip']),
        businessDescription: pickField(payload, ['message', 'Message', 'query', 'requirement', 'comments']),
        productCategories: product ? [product] : [],
        keywords: [searchKeyword, product].filter(Boolean),
        natureOfBusiness: 'buyer_inquiry',
        extractedAt: new Date(),
        confidenceScore: 72,
        rawExtractedData: {
            adapter: 'justdial_webhook',
            payload,
        },
    };
}

function flattenPayload(body = {}, query = {}) {
    return { ...query, ...body };
}

export async function ingestJustdialWebhook(token, body, query, reqMeta = {}) {
    const settings = await ExtractorSettings.findOne({ 'sourceConnectors.justdial.webhookToken': token }).lean();
    if (!settings) {
        return { ok: false, status: 404, message: 'Invalid Justdial webhook token' };
    }
    if (!settings.moduleEnabled) {
        return { ok: false, status: 403, message: 'Data Extractor is not enabled for this company' };
    }

    const payload = flattenPayload(body, query);
    const hasContact = pickField(payload, ['phone', 'Phone', 'mobile', 'Mobile', 'email', 'Email', 'name', 'Name']);
    if (!hasContact) {
        return { ok: false, status: 400, message: 'No lead fields found in webhook payload' };
    }

    const mapped = mapJustdialWebhookLead(payload);
    const ref = mapped.sourceReference;
    if (ref) {
        const dup = await ExtractedLead.findOne({
            companyId: settings.companyId,
            sourcePlatform: 'justdial',
            sourceReference: ref,
        }).select('_id').lean();
        if (dup) {
            return { ok: true, status: 200, message: 'Lead already received', duplicate: true, recordId: dup._id };
        }
    }

    const fy = new Date().getFullYear().toString();
    const doc = await ExtractedLead.create({
        ...mapped,
        companyId: settings.companyId,
        financialYear: fy,
        status: 'draft',
        rawExtractedData: {
            ...mapped.rawExtractedData,
            webhookIp: reqMeta.ip || '',
            receivedAt: new Date(),
        },
    });

    return {
        ok: true,
        status: 200,
        message: 'Lead received',
        recordId: doc._id,
        duplicate: false,
    };
}

function matchesKeyword(record, keyword) {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    const hay = [
        record.companyName,
        record.businessDescription,
        ...(record.keywords || []),
        ...(record.productCategories || []),
    ].map((x) => normalizeText(x).toLowerCase()).join(' ');
    return hay.includes(k);
}

function matchesCity(record, city) {
    if (!city) return true;
    return normalizeText(record.city).toLowerCase().includes(city.toLowerCase());
}

function matchesState(record, state) {
    if (!state) return true;
    return normalizeText(record.stateProvince).toLowerCase().includes(state.toLowerCase());
}

export async function testJustdialConnection(settings, companyId) {
    const token = await ensureJustdialWebhookToken(companyId);
    const baseUrl = process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || 'http://localhost:5000';
    const url = buildJustdialWebhookUrl(baseUrl, token);
    const count = await ExtractedLead.countDocuments({
        companyId,
        sourcePlatform: 'justdial',
    });
    return {
        ok: true,
        message: `Webhook ready — ${count} Justdial lead(s) received so far. Share URL with Justdial account manager.`,
        webhookUrl: url,
        sampleCount: count,
    };
}

export async function searchJustdial(input, settings, companyId) {
    const token = await ensureJustdialWebhookToken(companyId);
    const baseUrl = process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || 'http://localhost:5000';
    const webhookUrl = buildJustdialWebhookUrl(baseUrl, token);

    const keyword = String(input.keyword || '').trim();
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim();
    const maxResults = Math.min(50, Math.max(1, Number(input.maxResults) || 10));

    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await ExtractedLead.find({
        companyId,
        sourcePlatform: 'justdial',
        createdAt: { $gte: since },
    }).sort({ createdAt: -1 }).limit(200).lean();

    const records = [];
    for (const row of rows) {
        if (!matchesKeyword(row, keyword)) continue;
        if (!matchesCity(row, city)) continue;
        if (!matchesState(row, state)) continue;
        records.push({
            companyName: row.companyName,
            website: row.website,
            normalizedDomain: row.normalizedDomain,
            sourcePlatform: row.sourcePlatform,
            sourceUrl: row.sourceUrl,
            sourceReference: row.sourceReference,
            email: row.email,
            phone: row.phone,
            mobile: row.mobile,
            address: row.address,
            city: row.city,
            stateProvince: row.stateProvince,
            country: row.country,
            pincode: row.pincode,
            businessDescription: row.businessDescription,
            productCategories: row.productCategories || [],
            keywords: [...new Set([...(row.keywords || []), keyword].filter(Boolean))],
            natureOfBusiness: row.natureOfBusiness,
            extractedAt: row.extractedAt || row.createdAt,
            confidenceScore: row.confidenceScore || 72,
            rawExtractedData: row.rawExtractedData,
        });
        if (records.length >= maxResults) break;
    }

    const note = records.length
        ? 'Showing Justdial leads received via webhook in the last 30 days.'
        : 'No Justdial leads yet. Share the webhook URL with your Justdial account manager — leads appear here after Justdial configures the push.';

    return {
        records,
        errors: [],
        metadata: {
            sourceStatus: records.length ? 'ok' : 'no_results',
            adapterId: 'justdial',
            apiType: 'webhook_push',
            note,
            webhookUrl,
            fetchedCount: rows.length,
            filteredCount: records.length,
            previewOnly: true,
        },
    };
}
