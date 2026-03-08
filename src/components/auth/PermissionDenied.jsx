import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ShieldAlert } from 'lucide-react';
import styles from './PermissionDenied.module.scss';
import { ROLE_CONFIG, PERMISSION_LABELS } from '@/utils/permissions';

export const PermissionDenied = ({ requiredRole, requiredPermission }) => {
    const navigate = useNavigate();

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <ShieldAlert size={80} className={styles.icon} />
                <h1 className={styles.title}>Access Denied</h1>
                <p className={styles.message}>
                    You don't have permission to access this page.
                </p>

                {requiredRole && (
                    <div className={styles.requirement}>
                        <strong>Required Role:</strong> {(() => {
                            if (Array.isArray(requiredRole)) {
                                return requiredRole.map(r => ROLE_CONFIG[r]?.label || r).join(' / ');
                            }
                            return ROLE_CONFIG[requiredRole]?.label || requiredRole;
                        })()}
                    </div>
                )}

                {requiredPermission && (
                    <div className={styles.requirement}>
                        <strong>Required Permission:</strong> {PERMISSION_LABELS[requiredPermission] || requiredPermission}
                    </div>
                )}

                <div className={styles.actions}>
                    <Button onClick={() => navigate(-1)} variant="outline">
                        Go Back
                    </Button>
                    <Button onClick={() => navigate('/tasks/list')}>
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        </div>
    );
};
