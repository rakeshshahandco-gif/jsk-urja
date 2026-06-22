import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Customer from '../models/customer.model.js';
import Lead from '../models/lead.model.js';
import { Supplier } from '../models/supplier.model.js';
import EmailBlacklist from '../models/emailBlacklist.model.js';
import EmailCampaignRecipient from '../models/emailCampaignRecipient.model.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeEmail(raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return null;
    return email;
}

export async function getBlacklistedSet(companyId) {
    const rows = await EmailBlacklist.find({ companyId, isActive: true }).select('email').lean();
    return new Set(rows.map((r) => r.email));
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
        .select('customerName companyEmail contactPersons state city customerType')
        .lean();

    const out = [];
    const seen = new Set();
    for (const c of customers) {
        const emails = [];
        if (c.companyEmail) emails.push(c.companyEmail);
        for (const cp of c.contactPersons || []) {
            if (cp.email) emails.push(cp.email);
        }
        for (const raw of emails) {
            const email = normalizeEmail(raw);
            if (!email || seen.has(email) || blacklist.has(email)) continue;
            seen.add(email);
            out.push({
                email,
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
    const leads = await Lead.find(query).select('customerName customerEmail').lean();
    const out = [];
    const seen = new Set();
    for (const l of leads) {
        const email = normalizeEmail(l.customerEmail);
        if (!email || seen.has(email) || blacklist.has(email)) continue;
        seen.add(email);
        out.push({
            email,
            displayName: l.customerName || '',
            sourceRef: String(l._id),
        });
    }
    return out;
}

export async function buildRecipientsFromSuppliers(companyId, filters = {}, blacklist = new Set()) {
    const query = { isDeleted: { $ne: true } };
    if (filters.activeOnly) query.isActive = true;
    if (filters.selectedSupplierIds?.length) query._id = { $in: filters.selectedSupplierIds };
    const suppliers = await Supplier.find(query).select('supplierName email').lean();
    const out = [];
    const seen = new Set();
    for (const s of suppliers) {
        const email = normalizeEmail(s.email);
        if (!email || seen.has(email) || blacklist.has(email)) continue;
        seen.add(email);
        out.push({
            email,
            displayName: s.supplierName || '',
            sourceRef: String(s._id),
        });
    }
    return out;
}

export function parseTxtEmails(content) {
    return String(content || '')
        .split(/[\n,;\t]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function parseCsvEmails(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const emails = [];
    for (const line of lines) {
        const cols = line.split(/,|;|\t/);
        for (const col of cols) {
            const v = col.trim().replace(/^"|"$/g, '');
            if (v) emails.push(v);
        }
    }
    return emails;
}

export async function parseExcelEmails(filePath) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    const emails = [];
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            const v = cell?.text?.trim?.() || String(cell.value || '').trim();
            if (v) emails.push(v);
        });
    });
    return emails;
}

export function dedupeRecipients(list, blacklist = new Set()) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const email = normalizeEmail(item.email || item);
        if (!email || seen.has(email)) continue;
        if (blacklist.has(email)) {
            seen.add(email);
            out.push({ email, displayName: item.displayName || '', sourceRef: item.sourceRef || '', status: 'blacklisted' });
            continue;
        }
        seen.add(email);
        out.push({ email, displayName: item.displayName || '', sourceRef: item.sourceRef || '', status: 'pending' });
    }
    return out;
}

export async function persistCampaignRecipients(companyId, campaignId, recipients) {
    if (!recipients.length) return 0;
    const docs = recipients.map((r) => ({
        companyId,
        campaignId,
        email: r.email,
        displayName: r.displayName || '',
        sourceRef: r.sourceRef || '',
        status: r.status === 'blacklisted' ? 'blacklisted' : 'pending',
    }));
    await EmailCampaignRecipient.insertMany(docs, { ordered: false }).catch(() => {});
    return docs.length;
}
