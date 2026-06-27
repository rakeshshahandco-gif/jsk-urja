import { Company } from '../models/company.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { normalizeLoginSlug, escapeRegex } from '../utils/loginSlug.utils.js';

const PLATFORM_DEFAULT = {
    slug: '',
    displayName: 'JSK URJA',
    tagline: 'CRM Application',
    subtitle: 'Elevating your business efficiency with modern CRM solutions.',
    logoUrl: '',
    primaryColor: '#2563eb',
    companyId: null,
};

function resolveAbsoluteLogoUrl(logoUrl, baseUrl) {
    const raw = String(logoUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!baseUrl) return raw;
    const base = String(baseUrl).replace(/\/$/, '');
    return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function formatBranding(company, profileLogo, baseUrl) {
    const displayName = String(company.brandName || company.companyName || 'CRM').trim();
    const logoUrl = resolveAbsoluteLogoUrl(profileLogo || company.logoUrl, baseUrl);
    const slug = normalizeLoginSlug(company.loginSlug || company.clientCode || '');

    return {
        slug,
        companyId: String(company._id),
        displayName,
        tagline: String(company.loginTagline || 'CRM Application').trim(),
        subtitle: PLATFORM_DEFAULT.subtitle,
        logoUrl,
        primaryColor: String(company.loginPrimaryColor || '#2563eb').trim() || '#2563eb',
    };
}

async function findProfileLogo(companyId) {
    const profile = await CompanyProfile.findOne({ companyId }).select('logoUrl').lean();
    return profile?.logoUrl || '';
}

async function findCompanyBySlug(normalizedSlug) {
    if (!normalizedSlug) return null;

    const byLoginSlug = await Company.findOne({
        isActive: true,
        loginSlug: normalizedSlug,
    }).lean();

    if (byLoginSlug) return byLoginSlug;

    const codePattern = new RegExp(`^${escapeRegex(normalizedSlug)}$`, 'i');
    return Company.findOne({
        isActive: true,
        clientCode: codePattern,
    }).lean();
}

export async function resolveLoginBranding({ slug, baseUrl } = {}) {
    const normalizedSlug = normalizeLoginSlug(slug);

    let company = null;
    if (normalizedSlug) {
        company = await findCompanyBySlug(normalizedSlug);
    } else {
        company = await Company.findOne({ isActive: true, isDefault: true }).lean()
            || await Company.findOne({ isActive: true }).sort({ createdAt: 1 }).lean();
    }

    if (!company) {
        return { ...PLATFORM_DEFAULT };
    }

    const profileLogo = await findProfileLogo(company._id);
    return formatBranding(company, profileLogo, baseUrl);
}
