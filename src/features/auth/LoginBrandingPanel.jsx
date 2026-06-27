import React from 'react';
import { useLoginBranding } from '@/hooks/useLoginBranding';
import styles from '@/features/auth/LoginPage.module.scss';

const DEFAULT_SUBTITLE = 'Elevating your business efficiency with modern CRM solutions.';

/**
 * Left-side login branding panel (logo + company name + tagline).
 * Used on login, forgot-password, and reset-password pages.
 */
export function LoginBrandingPanel({ className = '' }) {
    const { branding, loading, nameParts } = useLoginBranding();
    const accentColor = branding.primaryColor || '#2563eb';

    return (
        <div className={`${styles.brandingSection} ${className}`.trim()}>
            <div className={styles.logoWrapper}>
                {branding.logoUrl ? (
                    <img
                        src={branding.logoUrl}
                        alt={branding.displayName}
                        className={styles.clientLogo}
                        style={{ maxHeight: 72, maxWidth: 220, objectFit: 'contain' }}
                    />
                ) : (
                    <div className={styles.brandText}>
                        <span className={styles.focus}>
                            {nameParts.primary}
                            {nameParts.accent ? (
                                <>
                                    {' '}
                                    <span className={styles.one} style={{ color: accentColor }}>
                                        {nameParts.accent}
                                    </span>
                                </>
                            ) : null}
                        </span>
                        <span className={styles.tagline}>{branding.tagline || 'CRM Application'}</span>
                    </div>
                )}
            </div>

            <div className={styles.heroText}>
                <h1 className={styles.mainHeading}>
                    Login into
                    <br />
                    {' '}
                    your account
                </h1>
                <p className={styles.subHeading}>
                    {loading ? 'Loading…' : (branding.subtitle || DEFAULT_SUBTITLE)}
                </p>
            </div>
        </div>
    );
}

/** Compact header for forgot/reset password cards */
export function LoginBrandingHeader() {
    const { branding, nameParts } = useLoginBranding();
    const accentColor = branding.primaryColor || '#2563eb';

    if (branding.logoUrl) {
        return (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img
                    src={branding.logoUrl}
                    alt={branding.displayName}
                    style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain' }}
                />
            </div>
        );
    }

    return (
        <h1 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
            {nameParts.primary}
            {nameParts.accent ? (
                <span style={{ color: accentColor }}>{` ${nameParts.accent}`}</span>
            ) : null}
        </h1>
    );
}
