export function normalizePhone(raw = '') {
    const original = String(raw || '').trim();
    const digits = original.replace(/[^\d+]/g, '');
    let countryCode = '';
    let normalized = digits;
    if (digits.startsWith('+')) {
        const m = digits.match(/^\+(\d{1,3})(\d+)$/);
        if (m) {
            countryCode = `+${m[1]}`;
            normalized = m[2];
        }
    } else if (digits.length === 12 && digits.startsWith('91')) {
        countryCode = '+91';
        normalized = digits.slice(2);
    } else if (digits.length === 10) {
        countryCode = '+91';
        normalized = digits;
    }
    return { original, normalized, countryCode, display: countryCode ? `${countryCode}${normalized}` : original };
}

export function classifyPhone(rawPhone = '', hints = {}) {
    const norm = normalizePhone(rawPhone);
    if (!norm.original) {
        return {
            phone: '',
            phoneNormalized: '',
            phoneType: 'Unknown',
            phoneCategory: 'Unknown',
            countryCode: '',
            confidence: 0,
            verificationStatus: 'INVALID',
            evidence: [],
            warnings: ['Empty phone'],
        };
    }

    const hay = `${norm.original} ${hints.label || ''} ${hints.context || ''}`.toLowerCase();
    let phoneCategory = 'Unknown';
    let phoneType = 'Unknown';
    if (/toll[\s-]?free|1800|1-800/.test(hay)) phoneCategory = 'Toll-free';
    else if (/sales/.test(hay)) phoneCategory = 'Sales';
    else if (/purchase|procurement|sourcing/.test(hay)) phoneCategory = 'Purchase';
    else if (/support|service|helpdesk/.test(hay)) phoneCategory = 'Support';
    else if (/accounts|finance/.test(hay)) phoneCategory = 'Accounts';
    else if (/\bmain\b|reception|front desk|front-desk/.test(hay)) phoneCategory = 'Main company';
    else if (/office|landline|board/.test(hay)) phoneCategory = 'Office';
    else phoneCategory = 'Unknown';

    const digitLen = String(norm.normalized || '').length;
    if (/mobile|cell|whatsapp/.test(hay) || digitLen === 10) phoneType = 'Mobile';
    else if (/landline|office|board/.test(hay)) phoneType = 'Landline';
    else if (phoneCategory === 'Toll-free') phoneType = 'Toll-free';
    else phoneType = digitLen >= 10 ? 'Mobile' : 'Landline';

    return {
        phone: norm.original,
        phoneNormalized: norm.normalized,
        phoneType,
        phoneCategory,
        countryCode: norm.countryCode,
        confidence: phoneCategory === 'Unknown' ? 55 : 75,
        verificationStatus: hints.imported ? 'IMPORTED_UNVERIFIED' : 'PUBLIC_UNVERIFIED',
        evidence: [`phone_category=${phoneCategory}`, `phone_type=${phoneType}`],
        warnings: [],
        whatsappCapable: hints.whatsappCapable === true,
    };
}
