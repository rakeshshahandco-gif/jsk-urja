import React from 'react';
import styles from './BrandedLoading.module.scss';
import logo from '@/assets/branding/logo.jpg';

export const BrandedLoader = ({ size = 100, className = '', inline = false }) => {
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
