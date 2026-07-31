export function normText(s = '') {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normEmail(s = '') {
    return String(s || '').toLowerCase().trim();
}

export function normPhone(s = '') {
    const digits = String(s || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length > 10) return digits.slice(-10);
    return digits;
}

export function normDomain(website = '') {
    let s = String(website || '').toLowerCase().trim();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
    return s;
}

export function normGstin(s = '') {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/password|cookie|authorization|bearer\s|sessiontoken|sk-[a-z0-9]|openai_api_key|data:image\/|base64,/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
        throw err;
    }
}

export function isGenericEmail(email = '') {
    const e = normEmail(email);
    if (!e) return false;
    const local = e.split('@')[0] || '';
    return /^(info|sales|contact|support|admin|office|enquiry|inquiry|hello|mail)$/i.test(local);
}
