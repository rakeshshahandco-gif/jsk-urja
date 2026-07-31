/**
 * Deduplicate recipients by normalized email / phone / company / CRM entity.
 */
export function dedupeRecipients(rows = [], { duplicatePolicy = 'KEEP_PRIMARY' } = {}) {
    const seenEmail = new Map();
    const seenPhone = new Map();
    const seenCompany = new Map();
    const seenCrm = new Map();
    const out = [];

    for (const row of rows) {
        let duplicateStatus = 'UNIQUE';
        let duplicateGroupKey = '';
        let keep = true;

        const email = row.normalizedEmail || '';
        const phone = row.normalizedPhone || '';
        const companyKey = String(row.extractedLeadId || row.companyName || '').toLowerCase();
        const crmKey = row.crmLeadId ? `lead:${row.crmLeadId}` : (row.crmCustomerId ? `cust:${row.crmCustomerId}` : '');

        if (email && seenEmail.has(email)) {
            duplicateStatus = 'SAME_CONTACT_DUPLICATE';
            duplicateGroupKey = `email:${email}`;
            keep = duplicatePolicy === 'KEEP_ALL_DISTINCT';
        } else if (phone && seenPhone.has(phone)) {
            duplicateStatus = 'SAME_CONTACT_DUPLICATE';
            duplicateGroupKey = `phone:${phone}`;
            keep = duplicatePolicy === 'KEEP_ALL_DISTINCT';
        } else if (crmKey && seenCrm.has(crmKey)) {
            duplicateStatus = 'CROSS_SOURCE_DUPLICATE';
            duplicateGroupKey = crmKey;
            keep = false;
        } else if (companyKey && seenCompany.has(companyKey) && duplicatePolicy === 'KEEP_PRIMARY') {
            // Same company second contact — allow if distinct contact unless policy says primary-only company
            duplicateStatus = 'SAME_COMPANY_DUPLICATE';
            duplicateGroupKey = `company:${companyKey}`;
            // Keep distinct contacts for same company by default when emails differ
            keep = true;
        }

        if (row.relatedCompanyReview) {
            duplicateStatus = 'POSSIBLE_RELATED_COMPANY_DUPLICATE';
            keep = false;
        }
        if (row.branchReview) {
            duplicateStatus = 'MANUAL_REVIEW_REQUIRED';
            keep = false;
        }

        const next = {
            ...row,
            duplicateStatus,
            duplicateGroupKey,
            included: keep && row.included !== false && !['OPTED_OUT', 'BLACKLISTED', 'INVALID_EMAIL', 'INVALID_PHONE', 'REJECTED_LEAD', 'BLOCKED_ENTITY'].includes(row.eligibilityStatus),
        };

        if (duplicateStatus !== 'UNIQUE' && !keep) {
            next.included = false;
            next.eligibilityStatus = next.eligibilityStatus === 'ELIGIBLE'
                || String(next.eligibilityStatus || '').startsWith('ELIGIBLE')
                ? 'DUPLICATE_CONTACT'
                : next.eligibilityStatus;
            next.exclusionReason = next.exclusionReason || duplicateStatus;
        }

        if (email && !seenEmail.has(email)) seenEmail.set(email, true);
        if (phone && !seenPhone.has(phone)) seenPhone.set(phone, true);
        if (crmKey && !seenCrm.has(crmKey)) seenCrm.set(crmKey, true);
        if (companyKey && !seenCompany.has(companyKey)) seenCompany.set(companyKey, true);

        out.push(next);
    }
    return out;
}
