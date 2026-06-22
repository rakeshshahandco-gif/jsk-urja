import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Customer from '../models/customer.model.js';
import Lead from '../models/lead.model.js';
import WhatsAppBulkBlacklist from '../models/whatsappBulkBlacklist.model.js';
import WhatsAppBulkCampaignRecipient from '../models/whatsappBulkCampaignRecipient.model.js';
import WhatsAppBulkCampaign from '../models/whatsappBulkCampaign.model.js';

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

export async function buildRecipientsFromCustomers(companyId, filters = {}, blacklist = new Set()) {
    const query = { isDeleted: { $ne: true } };
    if (filters.activeOnly) query.isActive = true;
    if (filters.inactiveOnly) query.isActive = false;
    if (filters.customerTypes?.length) query.customerType = { $in: filters.customerTypes };
    if (filters.states?.length) query.state = { $in: filters.states };
    if (filters.cities?.length) query.city = { $in: filters.cities };
    if (filters.selectedCustomerIds?.length) query._id = { $in: filters.selectedCustomerIds };

    const customers = await Customer.find(query)
        .select('customerName mobile contactPersons state city customerType')
        .lean();

    const out = [];
    const seen = new Set();
    for (const c of customers) {
        const mobiles = [];
        if (c.mobile) mobiles.push(c.mobile);
        for (const cp of c.contactPersons || []) {
            if (cp.mobile) mobiles.push(cp.mobile);
        }
        for (const raw of mobiles) {
            const mobile = normalizeMobile(raw);
            if (!mobile || seen.has(mobile) || blacklist.has(mobile)) continue;
            seen.add(mobile);
            out.push({
                mobile,
                displayName: c.customerName || '',
                sourceRef: String(c._id),
            });
        }
    }
    return out;
}

export async function buildRecipientsFromLeads(companyId, filters = {}, blacklist = new Set()) {
    const query = {};
    if (filters.selectedCustomerIds?.length) query._id = { $in: filters.selectedCustomerIds };
    const leads = await Lead.find(query).select('customerName mobile phone whatsappNumber').lean();
    const out = [];
    const seen = new Set();
    for (const l of leads) {
        for (const raw of [l.mobile, l.phone, l.whatsappNumber]) {
            const mobile = normalizeMobile(raw);
            if (!mobile || seen.has(mobile) || blacklist.has(mobile)) continue;
            seen.add(mobile);
            out.push({
                mobile,
                displayName: l.customerName || '',
                sourceRef: String(l._id),
            });
        }
    }
    return out;
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
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const mobile = normalizeMobile(item.mobile || item);
        if (!mobile || seen.has(mobile)) continue;
        if (blacklist.has(mobile)) {
            seen.add(mobile);
            out.push({ mobile, displayName: item.displayName || '', sourceRef: item.sourceRef || '', status: 'blacklisted' });
            continue;
        }
        seen.add(mobile);
        out.push({ mobile, displayName: item.displayName || '', sourceRef: item.sourceRef || '', status: 'pending' });
    }
    return out;
}

export async function persistCampaignRecipients(companyId, campaignId, recipients) {
    if (!recipients.length) return 0;
    const docs = recipients.map((r) => ({
        companyId,
        campaignId,
        mobile: r.mobile,
        displayName: r.displayName || '',
        sourceRef: r.sourceRef || '',
        status: r.status === 'blacklisted' ? 'blacklisted' : 'pending',
    }));
    await WhatsAppBulkCampaignRecipient.insertMany(docs, { ordered: false }).catch(() => {});
    return docs.length;
}
