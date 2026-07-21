/**
 * Frontend-only login branding config (no backend / MongoDB).
 * Swap companyLogo / companyName for future customer deployments.
 */

export const LOGIN_BRANDING = {
    platformName: 'JSK E-SARTHI',
    /** Tightly cropped transparent UI copy; originals remain untouched */
    platformLogo: '/branding/platform/jsk-e-sarthi-logo-ui.png',
    platformLogoFallback: '/branding/platform/jsk-e-sarthi-logo.png',
    platformTagline: 'Grow Your Business. We Simplify the Rest.',
    /** Tagline is already inside the platform logo artwork */
    showPlatformTaglineText: false,

    companyName: 'JSK URJA',
    companyLogo: '/branding/companies/jsk-urja-logo-ui.png',
    companyLogoFallback: '/branding/companies/jsk-urja-logo.jpg',
    /** Left-side product heading (not company name) */
    companySubtitle: 'AI-Ready CRM / ERP Platform',
    companySupportingText: '',

    primaryColour: '#A51F1F',
    primaryHoverColour: '#8B1A1A',
    secondaryColour: '#1e3a5f',
    accentOrange: '#e67e22',
    accentYellow: '#f5c542',
    pageBackground: '#f7f1e8',
};

export function getLoginBranding(overrides = {}) {
    return { ...LOGIN_BRANDING, ...overrides };
}