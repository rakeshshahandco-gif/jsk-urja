import React from 'react';
import { Building2 } from 'lucide-react';
import styles from './TalkWithCustomerForm.module.scss';

const getStatusBadge = (status) => {
    const badges = {
        hot: { icon: '🔥', label: 'Hot', color: '#dc2626' },
        warm: { icon: '☀️', label: 'Warm', color: '#f59e0b' },
        cold: { icon: '❄️', label: 'Cold', color: '#3b82f6' },
        active: { icon: '✅', label: 'Active', color: '#10b981' },
        inactive: { icon: '⏸️', label: 'Inactive', color: '#6b7280' },
    };
    return badges[status] || badges.warm;
};

export const CustomerInfoDisplay = ({ customer }) => {
    const badge = getStatusBadge(customer.customerStatus);

    return (
        <div className={styles.customerInfo}>
            <div className={styles.sectionIconHeader}>
                <Building2 size={24} className={styles.sectionIcon} />
                <h3 className={styles.infoTitle}>Customer Information</h3>
            </div>
            <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Customer Name:</span>
                    <span className={styles.infoValue}>{customer.customerName || customer.name || 'Not Provided'}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>City:</span>
                    <span className={styles.infoValue}>{customer.city || '-'} {customer.pincode ? `(${customer.pincode})` : ''}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Company:</span>
                    <span className={styles.infoValue}>{customer.company || '-'}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Company Brand:</span>
                    <span className={styles.infoValue}>{customer.companyBrand || '-'}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Contact Person:</span>
                    <span className={styles.infoValue}>{customer.contactPerson || '-'}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Mobiles:</span>
                    <span className={styles.infoValue}>
                        {[
                            customer.mobile,
                            customer.mobile2,
                            customer.mobile3,
                            customer.mobile4,
                            customer.mobile5
                        ].filter(m => m).join(', ') || '-'}
                    </span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Status:</span>
                    <span
                        className={styles.statusBadge}
                        style={{ backgroundColor: badge.color }}
                    >
                        {badge.icon} {badge.label}
                    </span>
                </div>
            </div>
        </div>
    );
};
