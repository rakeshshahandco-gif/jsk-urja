import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, RefreshCw, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import styles from './CompanySwitcher.module.scss';

export const CompanySwitcher = () => {
    const { companies, selectedCompany, switchCompany, loading } = useCompany();
    const [open, setOpen] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                setConfirmTarget(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (loading) {
        return (
            <div className={styles.singleCompany} title="Loading companies">
                <Building2 size={13} className={styles.icon} />
                <div className={styles.singleInfo}>
                    <span className={styles.singleLabel}>Active Company</span>
                    <span className={styles.singleName}>Loading…</span>
                </div>
            </div>
        );
    }

    if (!selectedCompany) {
        return (
            <div className={styles.singleCompany} title="No active company">
                <Building2 size={13} className={styles.icon} />
                <div className={styles.singleInfo}>
                    <span className={styles.singleLabel}>Active Company</span>
                    <span className={styles.singleName}>Not set — open Company Master</span>
                </div>
            </div>
        );
    }

    // Only one company → show static label (no dropdown)
    if (companies.length <= 1) {
        return (
            <div className={styles.singleCompany} title={selectedCompany.companyName}>
                <Building2 size={13} className={styles.icon} />
                <div className={styles.singleInfo}>
                    <span className={styles.singleLabel}>Active Company</span>
                    <span className={styles.singleName}>{selectedCompany.companyName}</span>
                </div>
            </div>
        );
    }

    // Multiple companies → show dropdown switcher
    const handleSelect = (company) => {
        if (company._id === selectedCompany._id) {
            setOpen(false);
            return;
        }
        setConfirmTarget(company);
    };

    const handleConfirm = () => {
        switchCompany(confirmTarget);
        setConfirmTarget(null);
        setOpen(false);
        // Reload page to refresh all module data for new company
        window.location.reload();
    };

    return (
        <div className={styles.wrapper} ref={ref}>
            <button
                className={styles.trigger}
                onClick={() => { setOpen(o => !o); setConfirmTarget(null); }}
                title="Click to change company"
            >
                <Building2 size={13} className={styles.icon} />
                <div className={styles.triggerText}>
                    <span className={styles.label}>Active Company</span>
                    <span className={styles.name}>{selectedCompany.companyName}</span>
                </div>
                <ArrowRightLeft size={12} className={styles.switchIcon} title="Switch Company" />
                <ChevronDown size={12} className={`${styles.chevron} ${open ? styles.open : ''}`} />
            </button>

            {open && (
                <div className={styles.dropdown}>
                    {confirmTarget ? (
                        /* Confirmation Dialog */
                        <div className={styles.confirmBox}>
                            <div className={styles.confirmHeader}>
                                <RefreshCw size={15} />
                                <span>Switch Company?</span>
                            </div>
                            <div className={styles.confirmDetail}>
                                <div className={styles.companyChange}>
                                    <span className={styles.fromCompany}>{selectedCompany.companyName}</span>
                                    <ArrowRightLeft size={14} className={styles.arrowIcon} />
                                    <span className={styles.toCompany}>{confirmTarget.companyName}</span>
                                </div>
                            </div>
                            <p className={styles.confirmNote}>
                                All data (Sales, Purchase, Accounts, Reports) will switch to <strong>{confirmTarget.companyName}</strong>.
                                The page will reload.
                            </p>
                            <div className={styles.confirmActions}>
                                <button className={styles.btnNo} onClick={() => setConfirmTarget(null)}>Cancel</button>
                                <button className={styles.btnYes} onClick={handleConfirm}>Yes, Switch</button>
                            </div>
                        </div>
                    ) : (
                        /* Company List */
                        <>
                            <div className={styles.dropdownHeader}>
                                <ArrowRightLeft size={12} /> Change Company
                            </div>
                            {companies.map(company => (
                                <button
                                    key={company._id}
                                    className={`${styles.companyItem} ${company._id === selectedCompany._id ? styles.selected : ''}`}
                                    onClick={() => handleSelect(company)}
                                >
                                    <div className={styles.companyItemLeft}>
                                        {company.logoUrl ? (
                                            <img src={company.logoUrl} alt="" className={styles.itemLogo} />
                                        ) : (
                                            <div className={styles.itemLogoPlaceholder}>
                                                <Building2 size={13} />
                                            </div>
                                        )}
                                        <div>
                                            <div className={styles.itemName}>{company.companyName}</div>
                                            <div className={styles.itemType}>{company.companyType}</div>
                                        </div>
                                    </div>
                                    {company._id === selectedCompany._id && (
                                        <span className={styles.activePill}>
                                            <CheckCircle size={12} /> Active
                                        </span>
                                    )}
                                </button>
                            ))}
                            <div className={styles.dropdownFooter}>
                                <a href="/admin/companies" className={styles.manageLink}>
                                    ⚙️ Manage Companies
                                </a>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
