import React from 'react';
import styles from './BrandedLoading.module.scss';
import { useLoadingStore } from '@/store/useLoadingStore';
import logo from '@/assets/branding/logo.jpg';

export const BrandedModuleLoader = () => {
    const showLoader = useLoadingStore(state => state.showLoader);

    if (!showLoader) return null;

    return (
        <div className={styles.moduleLoaderOverlay}>
            <div className={styles.moduleLoaderContent}>
                <div className={styles.logoWrapper} style={{ maxWidth: 140 }}>
                    <img src={logo} alt="Loading..." className={styles.inlineLogo} />
                </div>
            </div>
        </div>
    );
};
