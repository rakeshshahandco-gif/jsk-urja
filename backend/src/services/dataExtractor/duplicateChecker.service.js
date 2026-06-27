import { ExtractedLead } from '../../models/extractedLead.model.js';
import { Lead } from '../../models/lead.model.js';
import Customer from '../../models/customer.model.js';
import { Supplier } from '../../models/supplier.model.js';

function domainFromWebsite(website) {
    try {
        const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export async function checkDuplicateForRecord(companyId, record) {
    const refs = [];
    const domain = record.normalizedDomain || domainFromWebsite(record.website);
    const email = String(record.email || '').trim().toLowerCase();
    const phone = String(record.phone || record.mobile || '').replace(/\D/g, '');

    if (domain) {
        const ext = await ExtractedLead.findOne({
            companyId,
            normalizedDomain: domain,
            status: { $nin: ['rejected'] },
        }).select('_id companyName').lean();
        if (ext) {
            refs.push({ type: 'extracted_lead', refId: ext._id, matchScore: 90, matchField: 'domain' });
        }
    }

    if (email) {
        const [extEmail, leadEmail] = await Promise.all([
            ExtractedLead.findOne({ companyId, email, status: { $nin: ['rejected'] } }).select('_id').lean(),
            Lead.findOne({ companyId, customerEmail: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean(),
        ]);
        if (extEmail) refs.push({ type: 'extracted_lead', refId: extEmail._id, matchScore: 85, matchField: 'email' });
        if (leadEmail) refs.push({ type: 'lead', refId: leadEmail._id, matchScore: 80, matchField: 'email' });

        const customer = await Customer.findOne({
            companyId,
            $or: [
                { companyEmail: email },
                { 'contactPersons.email': email },
            ],
        }).select('_id customerName').lean();
        if (customer) refs.push({ type: 'customer', refId: customer._id, matchScore: 80, matchField: 'email' });

        const supplier = await Supplier.findOne({ companyId, email, isDeleted: { $ne: true } }).select('_id supplierName').lean();
        if (supplier) refs.push({ type: 'supplier', refId: supplier._id, matchScore: 80, matchField: 'email' });
    }

    if (phone && phone.length >= 8) {
        const phoneTail = phone.slice(-8);
        const leadPhone = await Lead.findOne({
            companyId,
            customerMobile: new RegExp(phoneTail),
        }).select('_id').lean();
        if (leadPhone) refs.push({ type: 'lead', refId: leadPhone._id, matchScore: 70, matchField: 'phone' });
    }

    const maxScore = refs.reduce((m, r) => Math.max(m, r.matchScore || 0), 0);
    let duplicateStatus = 'none';
    if (maxScore >= 90) duplicateStatus = 'confirmed_duplicate';
    else if (refs.length) duplicateStatus = 'possible_duplicate';

    return { duplicateStatus, duplicateMatchRefs: refs };
}

export async function enrichRecordsWithDuplicates(companyId, records) {
    const enriched = [];
    for (const rec of records) {
        const dup = await checkDuplicateForRecord(companyId, rec);
        enriched.push({
            ...rec,
            duplicateStatus: dup.duplicateStatus,
            duplicateMatchRefs: dup.duplicateMatchRefs,
            _isDuplicate: rec._isDuplicate || dup.duplicateStatus !== 'none',
        });
    }
    return enriched;
}
