import React from 'react';
import styles from './BrandedLoading.module.scss';
import logo from '@/assets/branding/logo.jpg';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';

export const BrandedLoader = ({ size = 100, className = '', inline = false }) => {
    const { isFeatureEnabled } = useFeatureSettings();
    const branded = isFeatureEnabled('ui.brandedLoaderEnabled');

    if (!branded) {
        return inline
            ? <span className={`${styles.simpleLoaderInline} ${className}`}>…</span>
            : <div className={`${styles.simpleLoader} ${className}`}>Loading…</div>;
    }

    return (
        <div className={`${inline ? styles.inlineLoaderSimple : styles.inlineLoader} ${className}`}>
            <div className={styles.logoWrapper} style={{ maxWidth: size }}>
                <img
                    src={logo}
                    alt="Loading..."
                    className={styles.inlineLogo}
                />
            </div>
        </div>
    );
};
