import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import styles from '../CustomerMasterReport.module.scss';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

export const FollowUpReportTable = ({ data, loading, onSort, sortBy, sortOrder }) => {
    const navigate = useNavigate();
    if (loading) {
        return <TableSkeleton rows={15} cols={11} />;
    }

    if (data.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>No follow-ups found matching your criteria.</p>
            </div>
        );
    }

    const SortIcon = ({ column }) => {
        if (sortBy !== column) return <ChevronDown size={14} className={styles.sortIcon} />;
        return sortOrder === 'asc' ? <ChevronUp size={14} className={styles.sortIconActive} /> : <ChevronDown size={14} className={styles.sortIconActive} />;
    };

    const getStatusLabel = (r) => {
        if (!r?.reminderDate) return <span className={`${styles.statusBadge}`}>N/A</span>;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const reminderDate = new Date(r.reminderDate);
        if (isNaN(reminderDate.getTime())) return <span className={`${styles.statusBadge}`}>Invalid Date</span>;

        if (r.isClosed) return <span className={`${styles.statusBadge} ${styles.inactive}`}>Closed</span>;
        if (reminderDate < today) return <span className={`${styles.statusBadge} ${styles.running_high}`}>Overdue</span>;
        return <span className={`${styles.statusBadge} ${styles.lead}`}>Pending</span>;
    };

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.sortable} onClick={() => onSort('customer.customerName')}>
                            Customer Name <SortIcon column="customer.customerName" />
                        </th>
                        <th>Company</th>
                        <th className={styles.sortable} onClick={() => onSort('reminderDate')}>
                            Follow-up Date <SortIcon column="reminderDate" />
                        </th>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Priority</th>
                        <th>Summary / Next Action</th>
                        <th>Outcome</th>
                        <th>Created By</th>
                        <th>Reminder Status</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((r) => {
                        const customerId = r.customer?._id || r.customer?.id || r.customerId;
                        return (
                            <tr
                                key={r._id}
                                onClick={() => customerId && navigate(`/followup/${customerId}`)}
                                style={{ cursor: customerId ? 'pointer' : 'default' }}
                                title={customerId ? 'Click to open customer details' : ''}
                            >
                                <td className={styles.nameCell}>
                                    <div className={styles.customerColumn}>
                                        <span className={styles.customerName}>{r.customer?.customerName || r.customer?.name || 'N/A'}</span>
                                        <span className={styles.companyName}>{r.customer?.company || '-'}</span>
                                    </div>
                                </td>
                                <td>
                                    {r.customer?.contactPersons && r.customer.contactPersons.length > 0 ? (
                                        <div className={styles.contactInfo}>
                                            <div className={styles.primaryContact}>
                                                {r.customer.contactPersons.find(c => c.isPrimary)?.name || r.customer.contactPersons[0].name}
                                            </div>
                                            <div className={styles.mobileNumber}>
                                                {r.customer.contactPersons.find(c => c.isPrimary)?.mobile || r.customer.contactPersons[0].mobile}
                                            </div>
                                        </div>
                                    ) : 'N/A'}
                                </td>
                                <td>
                                    {(() => {
                                        const d = new Date(r.reminderDate);
                                        return !isNaN(d.getTime()) ? d.toLocaleDateString() : '—';
                                    })()}
                                </td>
                                <td>{r.reminderTime || '-'}</td>
                                <td>{r.followUpType === 'CALL' ? '📞 CALL' : '💬 WHATSAPP'}</td>
                                <td>
                                    {r.priority === 'high' && '🔴 High'}
                                    {r.priority === 'medium' && '🟡 Medium'}
                                    {r.priority === 'low' && '🟢 Low'}
                                </td>
                                <td style={{ maxWidth: '300px', whiteSpace: 'normal' }}>
                                    {r.conversation?.discussionDetails || r.taskNote || '-'}
                                </td>
                                <td style={{ maxWidth: '200px', whiteSpace: 'normal' }}>
                                    {r.conversation?.outcome || '-'}
                                </td>
                                <td>{r.createdBy?.name || r.creator?.name || '-'}</td>
                                <td>{getStatusLabel(r)}</td>
                                <td className={styles.dateCell}>
                                    {(() => {
                                        const d = new Date(r.createdAt);
                                        return !isNaN(d.getTime()) ? d.toLocaleDateString() : '—';
                                    })()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
