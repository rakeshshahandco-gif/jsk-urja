export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    // Avoid false positives on normal business text/ISO dates; require clear secret patterns.
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key)\b|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,|\"[a-z0-9+\/]{80,}={0,2}\"/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
        throw err;
    }
}

export function normText(s = '') {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function addWorkingDays(fromDate, days, { skipWeekends = true } = {}) {
    const d = new Date(fromDate);
    d.setHours(9, 0, 0, 0);
    let left = Math.max(0, Number(days) || 0);
    if (left === 0) {
        if (skipWeekends) {
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        }
        return d;
    }
    while (left > 0) {
        d.setDate(d.getDate() + 1);
        if (skipWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
        left -= 1;
    }
    return d;
}

export function isPastDate(date) {
    const d = new Date(date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return d < now;
}
