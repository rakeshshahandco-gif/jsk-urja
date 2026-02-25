import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, CheckCircle, AlertCircle,
    MoreHorizontal, Check, ExternalLink, Loader2,
    CalendarDays, TriangleAlert, CheckSquare, History
} from 'lucide-react';
import { Button } from '@/components/ui';
import { getReminders, closeReminder, extendReminder, getReminderCounts } from '@/services/reminderApi';
import styles from './RemindersDashboard.module.scss';
import { useToast } from '@/components/ui/Toast';

export const RemindersDashboard = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();

    // Tabs: today, upcoming, overdue, closed
    const [activeTab, setActiveTab] = useState('today');
    const [loading, setLoading] = useState(true);
    const [reminders, setReminders] = useState([]);
    const [counts, setCounts] = useState({ today: 0, upcoming: 0, overdue: 0, closed: 0 });

    // Modal states
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [selectedReminder, setSelectedReminder] = useState(null);
    const [extendData, setExtendData] = useState({ date: '', time: '' });
    const [actionLoading, setActionLoading] = useState(false);

    const fetchCounts = useCallback(async () => {
        try {
            const countsData = await getReminderCounts();
            setCounts(countsData || { today: 0, upcoming: 0, overdue: 0, closed: 0 });
        } catch (error) {
            console.error('Error fetching counts:', error);
        }
    }, []);

    const fetchReminders = useCallback(async () => {
        setLoading(true);
        try {
            let params = {};
            if (activeTab === 'today') {
                params = { status: 'Today' };
            } else if (activeTab === 'upcoming') {
                params = { status: 'Upcoming' };
            } else if (activeTab === 'overdue') {
                params = { status: 'Overdue' };
            } else if (activeTab === 'closed') {
                params = { status: 'Closed' };
            }

            // Pass a high limit so all records are returned (dashboard needs to show all tasks)
            const data = await getReminders({ ...params, limit: 500, page: 1 });
            // Handle different data structures defensively
            const results = data.results || data.data || (Array.isArray(data) ? data : []);
            setReminders(results);
        } catch (error) {
            console.error('Error fetching reminders:', error);
            addToast('Failed to load tasks', 'error');
        } finally {
            setLoading(false);
        }
    }, [activeTab, addToast]);

    useEffect(() => {
        fetchCounts();
        fetchReminders();
    }, [fetchCounts, fetchReminders]);

    const handleCloseTask = async (id) => {
        if (!window.confirm('Are you sure you want to close this task?')) return;

        setActionLoading(true);
        try {
            await closeReminder(id);
            addToast('Task closed successfully', 'success');
            fetchCounts();
            fetchReminders();
        } catch (error) {
            console.error('Error closing task:', error);
            addToast('Failed to close task', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenExtendModal = (reminder) => {
        setSelectedReminder(reminder);
        setExtendData({
            date: new Date(reminder.reminderDate).toISOString().split('T')[0],
            time: reminder.reminderTime || ''
        });
        setIsExtendModalOpen(true);
    };

    const handleExtendTask = async () => {
        if (!extendData.date) {
            addToast('Please select a date', 'error');
            return;
        }

        setActionLoading(true);
        try {
            await extendReminder(selectedReminder._id, {
                reminderDate: extendData.date,
                reminderTime: extendData.time
            });
            addToast('Task date extended', 'success');
            setIsExtendModalOpen(false);
            fetchCounts();
            fetchReminders();
        } catch (error) {
            console.error('Error extending task:', error);
            addToast('Failed to extend task', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const getPriorityClass = (priority) => {
        switch (priority) {
            case 'high': return styles.high;
            case 'medium': return styles.medium;
            case 'low': return styles.low;
            default: return styles.medium;
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Reminder Tasks</h1>
                    <p className={styles.subtitle}>Manage your interaction schedule and follow-ups</p>
                </div>
            </header>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'today' ? styles.active : ''}`}
                    onClick={() => setActiveTab('today')}
                >
                    <Calendar size={18} />
                    Today
                    {counts.today > 0 && <span className={styles.count}>{counts.today}+</span>}
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'upcoming' ? styles.active : ''}`}
                    onClick={() => setActiveTab('upcoming')}
                >
                    <CalendarDays size={18} />
                    Upcoming
                    {counts.upcoming > 0 && <span className={styles.count}>{counts.upcoming}+</span>}
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'overdue' ? styles.active : ''}`}
                    onClick={() => setActiveTab('overdue')}
                >
                    <TriangleAlert size={18} />
                    Overdue
                    {counts.overdue > 0 && <span className={styles.count}>{counts.overdue}+</span>}
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'closed' ? styles.active : ''}`}
                    onClick={() => setActiveTab('closed')}
                >
                    <CheckSquare size={18} />
                    Closed
                </button>
            </div>

            <div className={styles.dashboardContent}>
                {loading ? (
                    <div className={styles.emptyState}>
                        <Loader2 size={40} className={styles.spin} />
                        <p>Loading your tasks...</p>
                    </div>
                ) : reminders.length === 0 ? (
                    <div className={styles.emptyState}>
                        <AlertCircle size={40} className={styles.icon} />
                        <p>No {activeTab} reminders found.</p>
                    </div>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Date & Time</th>
                                    <th>Type</th>
                                    <th>Priority</th>
                                    <th>Task Note</th>
                                    <th>Created By</th>
                                    {!['closed'].includes(activeTab) && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {reminders.map((r) => (
                                    <tr key={r._id}>
                                        <td className={styles.customerCell}>
                                            <span className={styles.customerName}>{r.customerId?.customerName || 'N/A'}</span>
                                            <span className={styles.company}>{r.customerId?.company || '-'}</span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Calendar size={14} />
                                                {new Date(r.reminderDate).toLocaleDateString()}
                                                {r.reminderTime && (
                                                    <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={14} /> {r.reminderTime}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{r.followUpType}</td>
                                        <td>
                                            <span className={`${styles.priorityBadge} ${getPriorityClass(r.priority)}`}>
                                                {r.priority === 'high' ? '🔴 High' : r.priority === 'medium' ? '🟡 Medium' : '🟢 Low'}
                                            </span>
                                        </td>
                                        <td>
                                            <p className={styles.note}>{r.taskNote || '-'}</p>
                                        </td>
                                        <td>
                                            <span className={styles.creatorName}>{r.createdBy?.name || '-'}</span>
                                        </td>
                                        {!['closed'].includes(activeTab) && (
                                            <td>
                                                <div className={styles.actions}>
                                                    <button
                                                        className={`${styles.btnAction} ${styles.close}`}
                                                        onClick={() => handleCloseTask(r._id)}
                                                    >
                                                        <Check size={14} /> Close
                                                    </button>
                                                    <button
                                                        className={`${styles.btnAction} ${styles.extend}`}
                                                        onClick={() => handleOpenExtendModal(r)}
                                                    >
                                                        <History size={14} /> Extend
                                                    </button>
                                                    <button
                                                        className={styles.btnAction}
                                                        onClick={() => navigate(`/followup/${r.customerId?._id}`)}
                                                    >
                                                        <ExternalLink size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Extend Modal */}
            {isExtendModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h3>Extend Task Date</h3>
                            <button onClick={() => setIsExtendModalOpen(false)}>×</button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.formGroup}>
                                <label>New Reminder Date</label>
                                <input
                                    type="date"
                                    value={extendData.date}
                                    onChange={(e) => setExtendData(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>New Reminder Time</label>
                                <input
                                    type="time"
                                    value={extendData.time}
                                    onChange={(e) => setExtendData(prev => ({ ...prev, time: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <Button variant="ghost" onClick={() => setIsExtendModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleExtendTask} isLoading={actionLoading}>Update Date</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
