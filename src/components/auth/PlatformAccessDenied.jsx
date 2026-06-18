import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ShieldAlert } from 'lucide-react';
import styles from './PermissionDenied.module.scss';

export const PlatformAccessDenied = () => {
    const navigate = useNavigate();

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <ShieldAlert size={80} className={styles.icon} />
                <h1 className={styles.title}>Access Denied</h1>
                <p className={styles.message}>
                    Access denied. This page is available only to Platform Admin.
                </p>
                <div className={styles.actions}>
                    <Button onClick={() => navigate(-1)} variant="outline">
                        Go Back
                    </Button>
                    <Button onClick={() => navigate('/')}>
                        Go to Home
                    </Button>
                </div>
            </div>
        </div>
    );
};
