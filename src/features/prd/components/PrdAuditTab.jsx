import React, { useState, useEffect } from 'react';
import { getPrdProjectAudits } from '@/services/prdApi';
import { Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdAuditTab.module.scss';
import clsx from 'clsx';
import moment from 'moment';

const PrdAuditTab = ({ projectId }) => {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAudits = async () => {
        setLoading(true);
        try {
            const data = await getPrdProjectAudits(projectId);
            setAudits(data);
        } catch (error) {
            toast.error('Failed to load audit trail');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchAudits();
    }, [projectId]);

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Security & Audit Trail</h3>
                    <p className={styles.tabDesc}>Immutable chronological record of all creations, modifications, and deletions for this product and its child entities.</p>
                </div>
                <div className={styles.badgeWrapper}>
                    <Activity size={20} className={styles.ico} /> Live Tracking
                </div>
            </div>

            {loading ? (
                <div className={styles.loader}>Loading immutable logs...</div>
            ) : audits.length === 0 ? (
                <div className={styles.emptyState}>No activities recorded yet.</div>
            ) : (
                <div className={styles.timeline}>
                    {audits.map((audit) => (
                        <div key={audit._id} className={styles.timelineItem}>
                            <div className={styles.tLine}></div>
                            <div className={clsx(styles.tDot, styles[`dot_${audit.action}`])}></div>
                            
                            <div className={styles.tContent}>
                                <div className={styles.tHeader}>
                                    <span className={clsx(styles.actionBadge, styles[`act_${audit.action}`])}>{audit.action}</span>
                                    <strong className={styles.entityTxt}>{audit.entityType.replace('Prd', '')} Record</strong>
                                    <span className={styles.tDate}>{moment(audit.date).format('DD MMM YYYY, HH:mm')}</span>
                                </div>
                                
                                <div className={styles.tBody}>
                                    <span className={styles.userTxt}>{audit.changedBy?.name || 'System'}</span> performed this action.
                                    <div className={styles.ipTxt}>IP: {audit.ipAddress}</div>
                                </div>

                                {audit.changes && audit.changes.length > 0 && audit.action === 'Update' && (
                                    <div className={styles.changesBox}>
                                        <table className={styles.diffTable}>
                                            <thead>
                                                <tr>
                                                    <th>Field</th>
                                                    <th>Old Value</th>
                                                    <th>New Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {audit.changes.map((ch, idx) => (
                                                    <tr key={idx}>
                                                        <td className={styles.fld}>{ch.field}</td>
                                                        <td className={styles.old}>{JSON.stringify(ch.oldValue).substring(0, 100)}</td>
                                                        <td className={styles.new}>{JSON.stringify(ch.newValue).substring(0, 100)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PrdAuditTab;
