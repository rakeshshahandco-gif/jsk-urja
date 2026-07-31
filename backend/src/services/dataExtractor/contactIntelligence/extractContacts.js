import { classifyEmail } from './emailClassifier.js';
import { classifyPhone } from './phoneClassifier.js';

function uniqBy(list, keyFn) {
    const seen = new Set();
    const out = [];
    for (const item of list || []) {
        const k = keyFn(item);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(item);
    }
    return out;
}

function pushProv(list, field, value, sourceType, sourceUrl, verificationStatus, confidence) {
    if (!value) return;
    list.push({
        field,
        value: String(value),
        sourceType: sourceType || 'public',
        sourceUrl: sourceUrl || '',
        collectedAt: new Date(),
        confidence: confidence || 60,
        verificationStatus: verificationStatus || 'PUBLIC_UNVERIFIED',
    });
}

function contactKeyOf({ email, phoneNormalized, profileUrl, contactName, designation }) {
    if (email) return `email:${String(email).toLowerCase()}`;
    if (phoneNormalized) return `phone:${phoneNormalized}`;
    if (profileUrl) return `profile:${String(profileUrl).toLowerCase()}`;
    if (contactName && designation) return `name:${String(contactName).toLowerCase()}|${String(designation).toLowerCase()}`;
    if (contactName) return `name:${String(contactName).toLowerCase()}`;
    return '';
}

/**
 * Build public contact candidates from already-collected extractor fields only.
 * Does not invent emails/phones. Inferred candidates must be passed explicitly with inferred=true.
 */
export function extractPublicContacts(record = {}, options = {}) {
    const sourceUrl = record.sourceUrl || record.website || '';
    const sourceType = options.sourceType || record.sourcePlatform || 'public';
    const imported = options.imported === true || sourceType.includes('import');
    const contacts = [];

    const emails = [];
    if (record.email) emails.push({ value: record.email, label: '', inferred: false });
    for (const e of record.emails || record.publicEmails || []) {
        if (typeof e === 'string') emails.push({ value: e, inferred: false });
        else if (e?.value || e?.email) emails.push({ value: e.value || e.email, label: e.label || '', inferred: !!e.inferred, sourceUrl: e.sourceUrl });
    }
    for (const e of record.rawExtractedData?.emails || record.rawExtractedData?.discoveredEmails || []) {
        if (typeof e === 'string') emails.push({ value: e, inferred: false });
        else if (e?.value || e?.normalized || e?.email) {
            emails.push({
                value: e.value || e.normalized || e.email,
                inferred: e.inferred === true || e.verificationStatus === 'INFERRED_UNVERIFIED',
                sourceUrl: e.sourceUrl || sourceUrl,
            });
        }
    }
    for (const e of options.inferredEmails || []) {
        emails.push({ value: e.value || e, inferred: true, sourceUrl: e.sourceUrl || sourceUrl });
    }

    const emailBuckets = new Map();
    for (const item of emails) {
        const key = String(item.value || '').trim().toLowerCase();
        if (!key) continue;
        if (!emailBuckets.has(key)) emailBuckets.set(key, []);
        emailBuckets.get(key).push(item);
    }
    for (const [, items] of emailBuckets) {
        const inferred = items.some((x) => x.inferred);
        const classified = classifyEmail(items[0].value, { inferred });
        if (!classified.email) continue;
        const provenance = [];
        const sourceUrls = [];
        for (const item of items) {
            const url = item.sourceUrl || sourceUrl;
            if (url) sourceUrls.push(url);
            pushProv(provenance, 'email', classified.email, imported ? 'import' : sourceType, url, classified.verificationStatus, classified.confidence);
        }
        const uniqueSources = [...new Set(sourceUrls.filter(Boolean))];
        let verificationStatus = classified.verificationStatus;
        let confidence = classified.confidence;
        const evidence = [...(classified.evidence || [])];
        if (!inferred && uniqueSources.length >= 2) {
            verificationStatus = 'MULTIPLE_SOURCE_CONFIRMED';
            confidence = Math.min(95, confidence + 12);
            evidence.push(`multi_source_count=${uniqueSources.length}`);
        }
        contacts.push({
            contactName: classified.isNamedEmail ? classified.email.split('@')[0] : (classified.isGenericEmail ? `${classified.emailCategory} mailbox` : ''),
            email: classified.email,
            emailType: classified.emailType,
            emailCategory: classified.emailCategory,
            isGenericEmail: classified.isGenericEmail,
            isNamedEmail: classified.isNamedEmail,
            isGenericCompanyContact: classified.isGenericEmail,
            sourceUrl: uniqueSources[0] || sourceUrl,
            sourceType: imported ? 'import' : sourceType,
            sourceTimestamp: new Date(),
            verificationStatus,
            confidence,
            evidence,
            warnings: classified.warnings,
            provenance,
            designation: '',
            department: '',
        });
    }

    const phones = [];
    for (const field of ['phone', 'mobile', 'whatsappNumber']) {
        if (record[field]) phones.push({ value: record[field], label: field, whatsappCapable: field === 'whatsappNumber' });
    }
    for (const p of record.phones || record.publicPhones || []) {
        if (typeof p === 'string') phones.push({ value: p });
        else if (p?.value || p?.phone) phones.push({ value: p.value || p.phone, label: p.label || '', whatsappCapable: !!p.whatsappCapable, sourceUrl: p.sourceUrl });
    }
    for (const p of record.rawExtractedData?.phones || record.rawExtractedData?.discoveredPhones || []) {
        if (typeof p === 'string') phones.push({ value: p });
        else if (p?.value || p?.normalized || p?.phone) {
            phones.push({
                value: p.value || p.phone || p.normalized,
                label: p.label || p.matchField || '',
                sourceUrl: p.sourceUrl || sourceUrl,
                imported,
            });
        }
    }

    for (const item of uniqBy(phones, (x) => String(x.value || ''))) {
        const classified = classifyPhone(item.value, {
            label: item.label,
            imported: imported || item.imported,
            whatsappCapable: item.whatsappCapable,
        });
        if (!classified.phone) continue;
        const provenance = [];
        pushProv(provenance, 'phone', classified.phone, imported ? 'import' : sourceType, item.sourceUrl || sourceUrl, classified.verificationStatus, classified.confidence);
        contacts.push({
            contactName: classified.phoneCategory !== 'Unknown' ? `${classified.phoneCategory} line` : 'Company phone',
            phone: classified.phone,
            phoneNormalized: classified.phoneNormalized,
            phoneType: classified.phoneType,
            phoneCategory: classified.phoneCategory,
            countryCode: classified.countryCode,
            whatsappCapable: !!classified.whatsappCapable,
            isGenericCompanyContact: true,
            sourceUrl: item.sourceUrl || sourceUrl,
            sourceType: imported ? 'import' : sourceType,
            sourceTimestamp: new Date(),
            verificationStatus: classified.verificationStatus,
            confidence: classified.confidence,
            evidence: classified.evidence,
            warnings: classified.warnings,
            provenance,
        });
    }

    // Explicit public people from team/management pages already collected
    for (const person of record.contacts || record.teamMembers || record.publicContacts || record.rawExtractedData?.contacts || []) {
        const emailInfo = person.email ? classifyEmail(person.email, { inferred: !!person.inferred }) : null;
        const phoneInfo = person.phone ? classifyPhone(person.phone, { imported, label: person.designation || '' }) : null;
        const verificationStatus = person.manuallyVerified
            ? 'MANUALLY_VERIFIED'
            : (person.inferred || emailInfo?.verificationStatus === 'INFERRED_UNVERIFIED')
                ? 'INFERRED_UNVERIFIED'
                : (imported ? 'IMPORTED_UNVERIFIED' : (person.verificationStatus || 'PUBLIC_UNVERIFIED'));
        const provenance = [];
        pushProv(provenance, 'contactName', person.name || person.contactName, person.sourceType || sourceType, person.sourceUrl || sourceUrl, verificationStatus, 70);
        if (person.designation) pushProv(provenance, 'designation', person.designation, person.sourceType || sourceType, person.sourceUrl || sourceUrl, verificationStatus, 70);
        if (emailInfo?.email) pushProv(provenance, 'email', emailInfo.email, person.sourceType || sourceType, person.sourceUrl || sourceUrl, emailInfo.verificationStatus, emailInfo.confidence);
        if (phoneInfo?.phone) pushProv(provenance, 'phone', phoneInfo.phone, person.sourceType || sourceType, person.sourceUrl || sourceUrl, phoneInfo.verificationStatus, phoneInfo.confidence);
        contacts.push({
            contactName: person.name || person.contactName || '',
            firstName: person.firstName || '',
            lastName: person.lastName || '',
            designation: person.designation || person.title || '',
            department: person.department || '',
            email: emailInfo?.email || '',
            emailType: emailInfo?.emailType || '',
            emailCategory: emailInfo?.emailCategory || '',
            isGenericEmail: !!emailInfo?.isGenericEmail,
            isNamedEmail: !!emailInfo?.isNamedEmail,
            phone: phoneInfo?.phone || '',
            phoneNormalized: phoneInfo?.phoneNormalized || '',
            phoneType: phoneInfo?.phoneType || '',
            phoneCategory: phoneInfo?.phoneCategory || '',
            countryCode: phoneInfo?.countryCode || '',
            profileUrl: person.profileUrl || person.linkedinUrl || '',
            sourceUrl: person.sourceUrl || sourceUrl,
            sourceType: person.sourceType || sourceType,
            sourceTimestamp: person.sourceTimestamp ? new Date(person.sourceTimestamp) : new Date(),
            verificationStatus,
            confidence: Number(person.confidence) || emailInfo?.confidence || 65,
            evidence: [...(emailInfo?.evidence || []), ...(phoneInfo?.evidence || []), person.designation ? `title=${person.designation}` : ''].filter(Boolean),
            warnings: [...(emailInfo?.warnings || []), ...(phoneInfo?.warnings || [])],
            provenance,
            isGenericCompanyContact: false,
        });
    }

    // Attach keys and resolve duplicates
    const withKeys = contacts.map((c) => ({
        ...c,
        contactKey: contactKeyOf(c),
    })).filter((c) => c.contactKey);

    return resolveContactDuplicates(withKeys);
}

export function resolveContactDuplicates(contacts = []) {
    const byEmail = new Map();
    const byPhone = new Map();
    const out = [];
    for (const c of contacts) {
        const emailKey = c.email ? `email:${c.email.toLowerCase()}` : '';
        const phoneKey = c.phoneNormalized ? `phone:${c.phoneNormalized}` : '';
        let duplicateStatus = 'UNIQUE';
        let duplicateOfKey = '';
        if (emailKey && byEmail.has(emailKey)) {
            duplicateStatus = 'EXACT_DUPLICATE';
            duplicateOfKey = byEmail.get(emailKey);
        } else if (phoneKey && byPhone.has(phoneKey)) {
            duplicateStatus = 'EXACT_DUPLICATE';
            duplicateOfKey = byPhone.get(phoneKey);
        } else {
            // similar name alone is NOT auto-merged
            const similar = out.find((x) => x.contactName && c.contactName
                && x.contactName.toLowerCase() === c.contactName.toLowerCase()
                && x.designation && c.designation
                && x.designation.toLowerCase() !== c.designation.toLowerCase());
            if (similar) {
                duplicateStatus = 'POSSIBLE_DUPLICATE';
                duplicateOfKey = similar.contactKey;
            }
            const related = out.find((x) => x.contactName && c.contactName
                && x.contactName.toLowerCase() === c.contactName.toLowerCase()
                && !c.email && !c.phone && !x.email && !x.phone);
            if (related && duplicateStatus === 'UNIQUE') {
                duplicateStatus = 'RELATED_CONTACT';
                duplicateOfKey = related.contactKey;
            }
        }
        if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, c.contactKey);
        if (phoneKey && !byPhone.has(phoneKey)) byPhone.set(phoneKey, c.contactKey);
        out.push({ ...c, duplicateStatus, duplicateOfKey });
    }
    return out;
}
