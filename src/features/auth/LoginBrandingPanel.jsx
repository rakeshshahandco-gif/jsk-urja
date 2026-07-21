import React from 'react';
import { Users, TrendingUp, ShieldCheck, Settings2 } from 'lucide-react';
import { getLoginBranding } from '@/config/loginBranding';
import styles from '@/features/auth/LoginPage.module.scss';

const brand = getLoginBranding();

const FEATURES = [
    { label: 'Customer Centric', Icon: Users, tone: 'maroon' },
    { label: 'Performance Driven', Icon: TrendingUp, tone: 'orange' },
    { label: 'Secure & Reliable', Icon: ShieldCheck, tone: 'maroon' },
    { label: 'Integrated Solutions', Icon: Settings2, tone: 'orange' },
];

/**
 * Left-side login branding panel (platform logo + product messaging).
 * Used on login, forgot-password, and reset-password pages.
 */
export function LoginBrandingPanel({ className = '' }) {
    return (
        <div className={`${styles.brandingSection} ${className}`.trim()}>
            <div className={styles.brandingTop}>
                <div className={styles.logoWrapper}>
                    <img
                        src={brand.platformLogo}
                        alt={`${brand.platformName} — ${brand.platformTagline}`}
                        className={styles.platformLogo}
                        onError={(e) => {
                            if (e.currentTarget.src.includes('-ui.png')) {
                                e.currentTarget.src = brand.platformLogoFallback;
                            }
                        }}
                    />
                </div>
                {brand.showPlatformTaglineText ? (
                    <p className={styles.platformTagline}>{brand.platformTagline}</p>
                ) : null}
                <div className={styles.brandDivider} aria-hidden>
                    <span className={styles.flourish} />
                </div>
                <h1 className={styles.productHeading}>{brand.companySubtitle}</h1>
                {brand.companySupportingText ? (
                    <p className={styles.productSupport}>{brand.companySupportingText}</p>
                ) : null}
            </div>

            <div className={styles.brandingArt} aria-hidden>
                <div className={styles.sunriseGlow} />
                <div className={styles.dashboardMock}>
                    <div className={styles.dashboardMockTitle}>Dashboard Overview</div>
                    <div className={styles.dashboardMockGrid}>
                        <div className={styles.dashboardStat}>
                            <span className={styles.dashboardStatLabel}>Leads</span>
                            <div className={`${styles.dashboardStatBar} ${styles.barLong}`} />
                        </div>
                        <div className={styles.dashboardStat}>
                            <span className={styles.dashboardStatLabel}>Pipeline</span>
                            <div className={`${styles.dashboardStatBar} ${styles.barMid}`} />
                        </div>
                        <div className={styles.dashboardStat}>
                            <span className={styles.dashboardStatLabel}>Customers</span>
                            <div className={`${styles.dashboardStatBar} ${styles.barShort}`} />
                        </div>
                        <div className={styles.dashboardStat}>
                            <span className={styles.dashboardStatLabel}>Tasks</span>
                            <div className={styles.dashboardStatBar} />
                        </div>
                    </div>
                    <div className={styles.dashboardCharts}>
                        <div>
                            <div className={styles.donut} />
                            <div className={styles.chartCaption}>Pipeline</div>
                        </div>
                        <div>
                            <div className={styles.sparkline} />
                            <div className={styles.chartCaption}>Monthly trend</div>
                        </div>
                    </div>
                </div>
                <div className={styles.citySilhouette} />
                <div className={styles.waveDecor} />
            </div>

            <div className={styles.featureRow}>
                {FEATURES.map(({ label, Icon, tone }) => (
                    <div key={label} className={styles.featureItem}>
                        <div className={`${styles.featureIcon} ${styles[tone]}`}>
                            <Icon size={22} strokeWidth={2.25} />
                        </div>
                        <span className={styles.featureLabel}>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Compact header for forgot/reset password cards — company logo from branding config */
export function LoginBrandingHeader() {
    return (
        <div className={styles.cardLogoWrap}>
            <img
                src={brand.companyLogo}
                alt={brand.companyName}
                className={styles.companyLogo}
                onError={(e) => {
                    if (e.currentTarget.src.includes('-ui.png') && brand.companyLogoFallback) {
                        e.currentTarget.src = brand.companyLogoFallback;
                    }
                }}
            />
        </div>
    );
}

export const PLATFORM_LOGO_URL = brand.platformLogo;
export const JSK_URJA_LOGO_URL = brand.companyLogo;
