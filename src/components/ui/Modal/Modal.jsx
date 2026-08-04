import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './Modal.module.scss';
import clsx from 'clsx';

export const Modal = ({
    children,
    zIndex,
    onClose,
    title,
    footer,
    size = 'md', // sm, md, lg, xl
    closeOnOverlayClick = true
}) => {
    const overlayRef = useRef(null);

    const handleOverlayClick = (e) => {
        if (closeOnOverlayClick && e.target === overlayRef.current) {
            onClose();
        }
    };

    return (
        <div
            className={styles.overlay}
            style={{ zIndex }}
            ref={overlayRef}
            onClick={handleOverlayClick}
        >
            <div className={clsx(styles.container, styles[size])} role="dialog" aria-modal="true">
                {/* Optional Header */}
                {title && (
                    <div className={styles.header}>
                        <h3 className={styles.title}>{title}</h3>
                        <button
                            className={styles.closeButton}
                            onClick={onClose}
                            aria-label="Close modal"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Dynamic Content */}
                <div className={styles.content}>
                    {children}
                </div>

                {/* Optional Footer */}
                {footer && (
                    <div className={styles.footer}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

Modal.propTypes = {
    children: PropTypes.node,
    zIndex: PropTypes.number,
    onClose: PropTypes.func,
    title: PropTypes.string,
    footer: PropTypes.node,
    size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'wide', 'full']),
    closeOnOverlayClick: PropTypes.bool
};
