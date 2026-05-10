import React from 'react';
import styles from './BrandedLoading.module.scss';
import logo from '@/assets/branding/logo.jpg';

export const BrandedSplashScreen = () => {
    return (
        <div className={styles.splashContainer}>
            <div className={styles.splashLogo}>
                <img src={logo} alt="SHREEJAL" className={styles.logoImage} />
            </div>
        </div>
    );
};
