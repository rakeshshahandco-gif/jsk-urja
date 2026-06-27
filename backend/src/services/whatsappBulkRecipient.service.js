import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Customer from '../models/customer.model.js';
import Lead from '../models/lead.model.js';
import WhatsAppBulkBlacklist from '../models/whatsappBulkBlacklist.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';
import {
    applyBusinessCategoryFilter,
    applyLeadBusinessCategoryFilter,
} from './whatsappBulkBusinessCategory.service.js';

export async function syncCampaignSendStats(campaignId, companyId) {
    const [sentCount, failedCount, pendingCount] = await Promise.all([
        WhatsAppBulkCampaignRecipient.countDocuments({ campaignId, companyId, status: 'sent' }),
        WhatsAppBulkCampaignRecipient.countDocuments({ campaignId, companyId, status: 'failed' }),
        WhatsAppBulkCampaignRecipient.countDocuments({ campaignId, companyId, status: 'pending' }),
    ]);
    await WhatsAppBulkCampaign.updateOne(
        { _id: campaignId, companyId },
        { $set: { sentCount, failedCount } },
    );
    return { sentCount, failedCount, pendingCount };
}

export function normalizeMobile(raw, defaultCountryCode = '91') {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `${defaultCountryCode}${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length >= 11 && digits.length <= 15) return digits;
    return null;
}

export async function getBlacklistedSet(companyId) {
    const rows = await WhatsAppBulkBlacklist.find({ companyId, isActive: true }).select('mobile').lean();
    return new Set(rows.map((r) => r.mobile));
}

export function extractCustomerMobiles(customer) {
    const rows = [];
    for (const cp of customer.contactPersons || []) {
        const displayName = cp.name || customer.customerName || '';
        for (const key of ['mobile', 'mobile2', 'mobile3', 'mobile4', 'mobile5', 'whatsApp']) {
            if (cp[key]) rows.push({ raw: cp[key], displayName });
        }
    }
    return rows;
}

export function extractLeadMobiles(lead) {
    const rows = [];
    const displayName = lead.customerName || '';
    for (const raw of [
        lead.customerMobile,
        lead.whatsapp?.normalizedMobile,
        lead.mobile,
        lead.phone,
        lead.whatsappNumber,
    ]) {
        if (raw) rows.push({ raw, displayName });
    }
    return rows;
}

export function buildCustomerQuery(filters = {}) {
    const query = { isDeleted: { $ne: true } };
    if (filters.activeOnly) query.status = { $ne: 'inactive' };
    if (filters.inactiveOnly) query.status = 'inactive';
    const category = filters.businessCategory
        || (filters.customerTypes?.length === 1 ? filters.customerTypes[0] : '');
    applyBusinessCategoryFilter(query, category);
    if (filters.customerTypes?.length > 1) query.customerType = { $in: filters.customerTypes };
    if (filters.states?.length) query.state = { $in: filters.states };
    if (filters.cities?.length) query.city = { $in: filters.cities };
    if (filters.selectedCustomerIds?.length) query._id = { $in: filters.selectedCustomerIds };
    return query;
}

export function buildLeadQuery(filters = {}) {
    const query = {};
    const category = filters.businessCategory
        || (filters.customerTypes?.length === 1 ? filters.customerTypes[0] : '');
    applyLeadBusinessCategoryFilter(query, category);
    if (filters.selectedCustomerIds?.length) query._id = { $in: filters.selectedCustomerIds };
    return query;
}

export function resolveEntityCategory(entity, sourceType) {
    if (sourceType === 'lead') {
        return entity.businessCategory || '';
    }
    return entity.customerType || entity.businessCategory || '';
}

/**
 * Process raw mobile candidates into preview rows with dedupe, invalid, and opt-out stats.
 */
export function processRecipientCandidates(candidates = [], blacklist = new Set(), options = {}) {
    const selectedKeys = options.selectedRecipientKeys;
    const hasExplicitSelection = Array.isArray(selectedKeys) && selectedKeys.length > 0;
    const selectedSet = hasExplicitSelection ? new Set(selectedKeys) : null;

    const seenMobiles = new Set();
    let duplicateSkipped = 0;
    let invalidSkipped = 0;
    let optOutSkipped = 0;
    const recipients = [];

    for (const candidate of candidates) {
        const mobile = normalizeMobile(candidate.mobile);
        if (!mobile) {
            invalidSkipped += 1;
            continue;
        }
        const recipientKey = candidate.recipientKey || `${candidate.sourceRef || 'manual'}:${mobile}`;
        if (seenMobiles.has(mobile)) {
            duplicateSkipped += 1;
            continue;
        }
        seenMobiles.add(mobile);

        const base = {
            recipientKey,
            mobile,
            displayName: candidate.displayName || '',
            city: candidate.city || '',
            state: candidate.state || '',
            category: candidate.category || '',
            entityStatus: candidate.entityStatus || '',
            sourceRef: candidate.sourceRef || '',
            sourceType: candidate.sourceType || '',
        };

        if (blacklist.has(mobile)) {
            optOutSkipped += 1;
            recipients.push({ ...base, status: 'blacklisted', selected: false });
            continue;
        }

        const selected = !selectedSet || selectedSet.has(recipientKey) || selectedSet.has(mobile);
        recipients.push({ ...base, status: 'pending', selected });
    }

    const validNumbers = recipients.filter((r) => r.status === 'pending').length;
    const finalSelected = recipients.filter((r) => r.status === 'pending' && r.selected).length;

    return {
        totalFound: candidates.length,
        validNumbers,
        duplicateSkipped,
        invalidSkipped,
        optOutSkipped,
        finalSelected,
        recipients,
        total: finalSelected || validNumbers,
        valid: validNumbers,
        blacklisted: optOutSkipped,
    };
}

export async function buildRecipientsFromCustomers(companyId, filters = {}, blacklist = new Set()) {
    const query = buildCustomerQuery(filters);
    const customers = await Customer.find(query)
        .select('customerName contactPersons state city customerType businessCategory status')
        .lean();

    const candidates = [];
    for (const c of customers) {
        const category = resolveEntityCategory(c, 'customer');
        const entityStatus = c.status || '';
        for (const { raw, displayName } of extractCustomerMobiles(c)) {
            candidates.push({
                mobile: raw,
                displayName: displayName || c.customerName || '',
                city: c.city || '',
                state: c.state || '',
                category,
                entityStatus,
                sourceRef: String(c._id),
                sourceType: 'customer',
                recipientKey: `${c._id}:${normalizeMobile(raw) || raw}`,
            });
        }
    }

    return processRecipientCandidates(candidates, blacklist, {
        selectedRecipientKeys: filters.selectedRecipientKeys,
    });
}

export async function buildRecipientsFromLeads(companyId, filters = {}, blacklist = new Set()) {
    const query = buildLeadQuery(filters);
    const leads = await Lead.find(query)
        .select('customerName customerMobile whatsapp status businessCategory city state mobile phone whatsappNumber')
        .lean();

    const candidates = [];
    for (const l of leads) {
        const category = resolveEntityCategory(l, 'lead');
        const entityStatus = l.status || '';
        for (const { raw, displayName } of extractLeadMobiles(l)) {
            candidates.push({
                mobile: raw,
                displayName: displayName || l.customerName || '',
                city: l.city || '',
                state: l.state || '',
                category,
                entityStatus,
                sourceRef: String(l._id),
                sourceType: 'lead',
                recipientKey: `${l._id}:${normalizeMobile(raw) || raw}`,
            });
        }
    }

    return processRecipientCandidates(candidates, blacklist, {
        selectedRecipientKeys: filters.selectedRecipientKeys,
    });
}

export function parseTxtNumbers(content) {
    return String(content || '')
        .split(/[\n,;\t]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function parseCsvNumbers(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const numbers = [];
    for (const line of lines) {
        const cols = line.split(/,|;|\t/);
        for (const col of cols) {
            const v = col.trim().replace(/^"|"$/g, '');
            if (v) numbers.push(v);
        }
    }
    return numbers;
}

export async function parseExcelNumbers(filePath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    const numbers = [];
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            const v = cell?.text?.trim?.() || String(cell.value || '').trim();
            if (v) numbers.push(v);
        });
    });
    return numbers;
}

export function dedupeRecipients(list, blacklist = new Set()) {
    const candidates = (list || []).map((item) => ({
        mobile: item.mobile || item,
        displayName: item.displayName || '',
        sourceRef: item.sourceRef || '',
        recipientKey: item.recipientKey || normalizeMobile(item.mobile || item) || '',
        category: item.category || '',
        city: item.city || '',
        state: item.state || '',
        entityStatus: item.entityStatus || '',
    }));
    return processRecipientCandidates(candidates, blacklist).recipients;
}

export async function persistCampaignRecipients(companyId, campaignId, recipients) {
    const rows = (recipients || []).filter((r) => r.status === 'pending' && r.selected !== false);
    if (!rows.length) return 0;
    const docs = rows.map((r) => ({
        companyId,
        campaignId,
        mobile: r.mobile,
        displayName: r.displayName || '',
        sourceRef: r.sourceRef || '',
        status: 'pending',
    }));
    await WhatsAppBulkCampaignRecipient.insertMany(docs, { ordered: false }).catch(() => {});
    return docs.length;
}
