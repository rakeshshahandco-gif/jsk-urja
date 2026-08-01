/**
 * Commercial document branding (JSK URJA company logo).
 * Same assets as login company logo above “Welcome Back”.
 * Do NOT use JSK E-SARTHI platform logos here.
 */

export const DOCUMENT_COMPANY_LOGO = {
    /** Primary — matches LoginPage brand.companyLogo (cache-busted for document print) */
    url: '/branding/companies/jsk-urja-logo-ui.png?v=urja-doc-1',
    /** Fallback — matches LoginPage brand.companyLogoFallback */
    fallbackUrl: '/branding/companies/jsk-urja-logo.jpg?v=urja-doc-1',
    companyTagline: 'Inspiring Innovations Always',
    defaultMaxHeight: 65,
    defaultMaxWidth: 140,
};

/** Intentional blank — no document logo (admin choice). */
export const DOCUMENT_LOGO_NONE = '__none__';

export function isJskUrjaDocumentCompany(company) {
    const name = String(company?.companyName || company?.name || '').toUpperCase();
    if (!name) return false;
    return name.includes('JSK') && (name.includes('INNOVATIVE') || name.includes('URJA'));
}

/**
 * Resolve logo for Sales Order / Sales Invoice / Purchase Order print & preview.
 * Priority: print logo → main logo → approved JSK URJA asset (JSK company only) → legacy /logo.jpeg.
 */
function isStaleRemoteUploadLogo(url) {
    return /\/uploads\//i.test(url) || (/onrender\.com/i.test(url) && /\/uploads\//i.test(url));
}

function withDocumentLogoCacheBust(url) {
    const u = String(url || '').trim();
    if (!u) return u;
    if (u.includes('jsk-urja-logo') && !u.includes('?')) return `${u}?v=urja-doc-1`;
    return u;
}

export function resolveDocumentLogoUrl(company) {
    const fromCompany = String(company?.printLogoUrl || company?.logoUrl || '').trim();
    if (fromCompany === DOCUMENT_LOGO_NONE) return '';
    if (fromCompany) {
        // JSK company: prefer approved Git asset over old Render/upload logos
        if (isJskUrjaDocumentCompany(company) && isStaleRemoteUploadLogo(fromCompany)) {
            return DOCUMENT_COMPANY_LOGO.url;
        }
        return withDocumentLogoCacheBust(fromCompany);
    }
    if (isJskUrjaDocumentCompany(company)) return DOCUMENT_COMPANY_LOGO.url;
    return '/logo.jpeg?v=urja-doc-1';
}

export function documentLogoImgProps(company = {}) {
    const maxHeight = Number(company?.logoHeight) > 0
        ? Number(company.logoHeight)
        : DOCUMENT_COMPANY_LOGO.defaultMaxHeight;
    return {
        src: resolveDocumentLogoUrl(company),
        alt: 'JSK URJA',
        style: {
            maxHeight: `${maxHeight}px`,
            maxWidth: `${DOCUMENT_COMPANY_LOGO.defaultMaxWidth}px`,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            display: 'block',
            background: '#fff',
        },
        onError: (e) => {
            const el = e?.currentTarget;
            if (!el) return;
            if (String(el.src || '').includes('jsk-urja-logo-ui.png')) {
                el.src = DOCUMENT_COMPANY_LOGO.fallbackUrl;
            }
        },
    };
}
