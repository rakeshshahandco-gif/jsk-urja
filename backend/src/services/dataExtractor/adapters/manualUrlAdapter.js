import {
    extractEmailsFromText,
    extractJsonLdBlocks,
    extractOrgFromJsonLd,
    extractPhonesFromText,
    extractProductsFromHtml,
    normalizeExtractorUrl,
    parseMetaDescription,
    parseMetaKeywords,
    parseTitleFromHtml,
    scoreExtractorConfidence,
} from '../extractor.utils.js';
import { isUrlAllowedByRobots } from '../robotsCheck.js';

const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT = 'CRM-Data-Extractor/1.0 (+https://localhost; public-business-data-only)';

async function fetchPublicHtml(url) {
    const allowed = await isUrlAllowedByRobots(url, 5000);
    if (!allowed) {
        return { ok: false, error: 'Blocked by robots.txt', html: '' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': USER_AGENT,
            },
            redirect: 'follow',
        });
        if (!res.ok) {
            return { ok: false, error: `HTTP ${res.status}`, html: '' };
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return { ok: false, error: 'Non-HTML response', html: '' };
        }
        const html = await res.text();
        if (html.length > 2_000_000) {
            return { ok: false, error: 'Response too large', html: '' };
        }
        return { ok: true, html, error: '' };
    } catch (err) {
        return { ok: false, error: err?.message || 'Fetch failed', html: '' };
    } finally {
        clearTimeout(timer);
    }
}

function deriveCompanyName(title, url, domain) {
    if (title) {
        const cleaned = title.split('|')[0].split('-')[0].trim();
        if (cleaned.length >= 2 && cleaned.length <= 120) return cleaned;
    }
    if (domain) {
        const base = domain.split('.')[0];
        return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return url;
}

function fieldsFromJsonLd(org) {
    if (!org) return {};
    const addr = org.address || {};
    const street = typeof addr === 'string' ? addr : [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ');
    return {
        companyName: org.name || org.legalName || '',
        email: org.email || '',
        phone: org.telephone || '',
        address: street || '',
        city: typeof addr === 'object' ? (addr.addressLocality || '') : '',
        stateProvince: typeof addr === 'object' ? (addr.addressRegion || '') : '',
        country: typeof addr === 'object' ? (addr.addressCountry || '') : '',
        pincode: typeof addr === 'object' ? (addr.postalCode || '') : '',
        businessDescription: org.description || '',
    };
}

/** Public HTML only — respects robots.txt, no JS rendering. */
export async function runManualUrlAdapter(urls = []) {
    const records = [];
    const errors = [];

    for (const raw of urls) {
        const { url, domain } = normalizeExtractorUrl(raw);
        if (!url) {
            errors.push(`Invalid URL: ${raw}`);
            continue;
        }

        const fetched = await fetchPublicHtml(url);
        if (!fetched.ok) {
            errors.push(`${url}: ${fetched.error}`);
            records.push({
                companyName: deriveCompanyName('', url, domain),
                website: url,
                normalizedDomain: domain,
                sourcePlatform: 'manual_url',
                sourceUrl: url,
                confidenceScore: 15,
                rawExtractedData: { fetchError: fetched.error },
            });
            continue;
        }

        const html = fetched.html;
        const title = parseTitleFromHtml(html);
        const description = parseMetaDescription(html);
        const keywords = parseMetaKeywords(html);
        const products = extractProductsFromHtml(html);
        const jsonLd = extractOrgFromJsonLd(extractJsonLdBlocks(html));
        const ldFields = fieldsFromJsonLd(jsonLd);
        const emails = extractEmailsFromText(html);
        const phones = extractPhonesFromText(html);
        const companyName = ldFields.companyName || deriveCompanyName(title, url, domain);

        const fields = {
            companyName,
            website: url,
            email: ldFields.email || emails[0] || '',
            phone: ldFields.phone || phones[0] || '',
            mobile: phones[1] || '',
            address: ldFields.address || '',
            city: ldFields.city || '',
            stateProvince: ldFields.stateProvince || '',
            country: ldFields.country || '',
            pincode: ldFields.pincode || '',
            businessDescription: ldFields.businessDescription || description || '',
            keywords,
            productCategories: products,
        };

        records.push({
            ...fields,
            normalizedDomain: domain,
            sourcePlatform: 'manual_url',
            sourceUrl: url,
            extractedAt: new Date(),
            confidenceScore: scoreExtractorConfidence(fields),
            rawExtractedData: {
                title,
                emailsFound: emails.slice(0, 5),
                phonesFound: phones.slice(0, 5),
                keywordsFound: keywords.slice(0, 10),
            },
        });
    }

    return { records, errors };
}
