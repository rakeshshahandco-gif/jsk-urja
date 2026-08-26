/**
 * Contactable prospect / outreach queue on existing Company Identity.
 * Does not create a new collection. Does not auto-create CRM Leads.
 */
import { ExtractorCompanyIdentity } from '../../../../models/extractorCompanyIdentity.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { AuditLog } from '../../../../models/auditLog.model.js';
import {
    OUTREACH_STATUSES,
    presentContactableProspect,
} from '../phase5/contactability.util.js';
import {
    matchesContactableSource,
    matchesParentGroup,
} from '../../socialSources/facebookGroupProspect.util.js';

function baseFilter(companyId) {
    return { companyId, isDeleted: { $ne: true }, mergedIntoId: null, testOnly: { $ne: true } };
}

function matchesText(row, q) {
    if (!q) return true;
    const blob = `${row.companyName} ${row.contactPersonName} ${row.city} ${(row.keywords || []).join(' ')}`.toLowerCase();
    return blob.includes(String(q).toLowerCase());
}

export async function listContactableProspects(companyId, query = {}) {
    const docs = await ExtractorCompanyIdentity.find(baseFilter(companyId)).sort({ lastSeenAt: -1 }).limit(800).lean();
    let rows = docs.map(presentContactableProspect);
    const parentGroups = [];
    const seenGroups = new Set();
    for (const row of rows) {
        const key = row.parentGroupId || row.parentGroup;
        if (!key || seenGroups.has(key)) continue;
        seenGroups.add(key);
        parentGroups.push({ id: row.parentGroupId || '', name: row.parentGroup || '' });
    }
    const discoveryHiddenCount = rows.filter((r) => r.discoveryOnly).length;
    if (query.hideDiscovery !== 'false' && query.source !== 'facebook_group_member') {
        rows = rows.filter((r) => !r.discoveryOnly);
    }
    if (query.source === 'facebook_group_member') {
        rows = rows.filter((r) => r.sourceKind === 'facebook_group_member');
    }
    if (query.q) rows = rows.filter((r) => matchesText(r, query.q));
    if (query.city) {
        const loc = String(query.city).toLowerCase();
        rows = rows.filter((r) => `${r.city} ${r.state}`.toLowerCase().includes(loc));
    }
    if (query.source) rows = rows.filter((r) => matchesContactableSource(r, query.source));
    if (query.parentGroupId || query.parentGroup) {
        rows = rows.filter((r) => matchesParentGroup(r, query.parentGroupId, query.parentGroup));
    }
    if (query.qualificationCategory) rows = rows.filter((r) => r.qualification === query.qualificationCategory);
    if (query.hasPhone === 'true') rows = rows.filter((r) => r.hasPhone);
    if (query.hasWhatsApp === 'true') rows = rows.filter((r) => r.hasWhatsApp);
    if (query.hasEmail === 'true') rows = rows.filter((r) => r.hasEmail);
    if (query.hasWebsite === 'true') rows = rows.filter((r) => r.hasWebsite);
    if (query.facebookOnly === 'true') rows = rows.filter((r) => r.hasFacebook && !r.hasPhone && !r.hasEmail);
    if (query.instagramOnly === 'true') rows = rows.filter((r) => r.hasInstagram && !r.hasPhone && !r.hasEmail);
    if (query.highlyRelevant === 'true') rows = rows.filter((r) => /highly/i.test(r.qualification));
    if (query.notContacted === 'true') rows = rows.filter((r) => r.outreachStatus === 'Not Contacted');
    if (query.followUp === 'true') rows = rows.filter((r) => r.outreachStatus === 'Follow-up Required');
    if (query.interested === 'true') rows = rows.filter((r) => r.outreachStatus === 'Interested');
    if (query.outreachStatus) rows = rows.filter((r) => r.outreachStatus === query.outreachStatus);
    if (query.priority) rows = rows.filter((r) => r.priority === query.priority);
    if (query.newOnly === 'true') rows = rows.filter((r) => r.crmStatus === 'New' && r.outreachStatus === 'Not Contacted');

    const rank = { A: 0, B: 1, C: 2, D: 3 };
    rows.sort((a, b) => {
        const pr = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
        if (pr) return pr;
        if (b.contactability !== a.contactability) return b.contactability - a.contactability;
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const total = rows.length;
    const results = rows.slice((page - 1) * limit, page * limit);
    const summary = {
        listed: total,
        hasPhone: rows.filter((r) => r.hasPhone).length,
        hasWhatsApp: rows.filter((r) => r.hasWhatsApp).length,
        hasEmail: rows.filter((r) => r.hasEmail).length,
        hasWebsite: rows.filter((r) => r.hasWebsite).length,
        hasFacebook: rows.filter((r) => r.hasFacebook).length,
        hasInstagram: rows.filter((r) => r.hasInstagram).length,
        discoveryHidden: query.hideDiscovery !== 'false' && query.source !== 'facebook_group_member' ? discoveryHiddenCount : 0,
        facebookGroupMembers: rows.filter((r) => r.sourceKind === 'facebook_group_member').length,
    };
    return { results, total, page, limit, summary, parentGroups };
}

export async function getContactableProspect(companyId, id) {
    const doc = await ExtractorCompanyIdentity.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Prospect not found');
    return presentContactableProspect(doc);
}

export async function recordProspectOutreach(companyId, user, id, body = {}) {
    const doc = await ExtractorCompanyIdentity.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Prospect not found');
    const outreach = {
        status: 'Not Contacted',
        doNotContact: false,
        log: [],
        ...(doc.outreach || {}),
    };
    if (outreach.doNotContact && body.status !== 'Not Contacted' && body.clearDoNotContact !== true) {
        throw new ApiError(400, 'This prospect is marked Do Not Contact');
    }
    if (body.clearDoNotContact === true) outreach.doNotContact = false;
    if (body.doNotContact === true) {
        outreach.doNotContact = true;
        outreach.status = 'Do Not Contact';
    }
    const nextStatus = String(body.status || outreach.status || 'Not Contacted');
    if (nextStatus && !OUTREACH_STATUSES.includes(nextStatus)) {
        throw new ApiError(400, 'Invalid outreach status');
    }
    outreach.status = nextStatus;
    const entry = {
        at: new Date().toISOString(),
        by: String(user?._id || user?.id || ''),
        channel: String(body.channel || '').slice(0, 40),
        status: outreach.status,
        note: String(body.note || '').slice(0, 500),
    };
    outreach.log = [...(outreach.log || []), entry].slice(-40);
    outreach.lastAt = entry.at;
    outreach.lastBy = entry.by;
    outreach.lastChannel = entry.channel;
    doc.outreach = outreach;
    doc.updatedBy = user?._id || user?.id || null;
    await doc.save();
    try {
        await AuditLog.create({
            user: user?._id || user?.id,
            action: 'UPDATE',
            module: 'data_extractor',
            description: 'prospect outreach',
            details: { identityId: String(doc._id), status: outreach.status, channel: entry.channel },
        });
    } catch {
        /* audit must not block */
    }
    return presentContactableProspect(doc.toObject());
}

export function defaultOutreachMessage(prospect = {}, productNote = '') {
    const name = prospect.contactPersonName || prospect.companyName || 'there';
    const product = String(productNote || '').trim();
    return [
        `Hello ${name},`,
        'This is JSK URJA. We manufacture DALI / lighting automation products and would like to share relevant product details.',
        product ? `Product: ${product}` : '',
        'Please let us know a convenient time to connect.',
    ].filter(Boolean).join('\n');
}
