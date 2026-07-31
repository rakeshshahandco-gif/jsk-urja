import { EMAIL_PREFIX_MAP } from './constants.js';

const GENERIC_PREFIXES = new Set(Object.keys(EMAIL_PREFIX_MAP));

export function classifyEmail(rawEmail = '', { inferred = false } = {}) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const warnings = [];
    if (!email || !email.includes('@')) {
        return {
            email: '',
            emailCategory: 'unknown',
            emailType: 'unknown',
            isGenericEmail: false,
            isNamedEmail: false,
            confidence: 0,
            verificationStatus: 'INVALID',
            evidence: [],
            warnings: ['Invalid email format'],
        };
    }

    const [local] = email.split('@');
    const prefix = String(local || '').split(/[._+-]/)[0];
    let emailCategory = 'unknown';
    let isGenericEmail = false;
    let isNamedEmail = false;

    if (GENERIC_PREFIXES.has(prefix) || EMAIL_PREFIX_MAP[prefix]) {
        emailCategory = EMAIL_PREFIX_MAP[prefix] || prefix;
        isGenericEmail = true;
    } else if (/^[a-z]+[a-z0-9]*$/.test(local) && local.length >= 3) {
        emailCategory = 'personal-name';
        isNamedEmail = true;
    } else {
        emailCategory = 'unknown';
    }

    let verificationStatus = 'PUBLIC_UNVERIFIED';
    let confidence = isGenericEmail ? 78 : isNamedEmail ? 70 : 55;
    if (inferred) {
        verificationStatus = 'INFERRED_UNVERIFIED';
        confidence = Math.min(confidence, 40);
        warnings.push('Inferred email is not verified and must not be treated as verified');
    }

    return {
        email,
        emailCategory,
        emailType: isGenericEmail ? 'generic' : isNamedEmail ? 'named' : 'unknown',
        isGenericEmail,
        isNamedEmail,
        confidence,
        verificationStatus,
        evidence: [`email_local=${local}`, `email_category=${emailCategory}`],
        warnings,
    };
}
