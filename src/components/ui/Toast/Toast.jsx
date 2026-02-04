import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.scss';

const ICONS = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle
};

export const Toast = ({ message, type = 'info', onClose }) => {
    const [isVisible, setIsVisible] = useState(false);
    const Icon = ICONS[type] || Info;

    useEffect(() => {
        // Trigger animation
        setTimeout(() => setIsVisible(true), 10);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for animation
    };

    return (
        <div className={`${styles.toast} ${styles[type]} ${isVisible ? styles.visible : ''}`}>
            <div className={styles.content}>
                <Icon size={20} className={styles.icon} />
                <span className={styles.message}>{message}</span>
            </div>
            <button className={styles.closeButton} onClick={handleClose}>
                <X size={18} />
            </button>
        </div>
    );
};
