import React from 'react';
import styles from './Card.module.scss';

export const Card = ({ children, title, className = '', noPadding = false, ...props }) => {
    return (
        <div className={`${styles.card} ${className}`} {...props}>
            {title && (
                <div className={styles.header}>
                    <h3 className={styles.title}>{title}</h3>
                </div>
            )}
            <div className={`${styles.content} ${noPadding ? styles.noPadding : ''}`}>
                {children}
            </div>
        </div>
    );
};

export default Card;
