import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchPublicBranding } from '@/services/publicBrandingApi';

export const DEFAULT_LOGIN_BRANDING = {
    slug: '',
    displayName: 'JSK URJA',
    tagline: 'CRM Application',
    subtitle: 'Elevating your business efficiency with modern CRM solutions.',
    logoUrl: '',
    primaryColor: '#2563eb',
};

export function splitDisplayName(displayName) {
    const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
        return { primary: parts[0] || 'CRM', accent: '' };
    }
    const accent = parts.pop();
    return { primary: parts.join(' '), accent };
}

export function useLoginBranding() {
    const { slug: routeSlug } = useParams();
    const [searchParams] = useSearchParams();
    const slug = useMemo(
        () => routeSlug || searchParams.get('tenant') || searchParams.get('slug') || '',
        [routeSlug, searchParams],
    );

    const [branding, setBranding] = useState(DEFAULT_LOGIN_BRANDING);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await fetchPublicBranding(slug);
                if (!cancelled && data) {
                    setBranding({ ...DEFAULT_LOGIN_BRANDING, ...data });
                }
            } catch {
                if (!cancelled) {
                    setBranding(DEFAULT_LOGIN_BRANDING);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [slug]);

    useEffect(() => {
        const title = branding?.displayName
            ? `${branding.displayName} — Login`
            : 'CRM Login';
        document.title = title;
    }, [branding?.displayName]);

    const nameParts = useMemo(
        () => splitDisplayName(branding.displayName),
        [branding.displayName],
    );

    return { branding, loading, slug, nameParts };
}
