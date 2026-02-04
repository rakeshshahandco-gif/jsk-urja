import React, { useState, useEffect, useCallback } from 'react';
import {
    Calendar, CalendarDays, TriangleAlert, CheckSquare,
    Search, Loader2, AlertCircle
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { getOpenRemindersReport } from '@/services/reportApi'; // reportApi calls backend
import { useModal } from '@/components/ui/Modal';
import { CloseReminderModal } from './components/CloseReminderModal';
import { ChangeDateModal } from './components/ChangeDateModal';
import { ConversationHistoryModal } from './components/ConversationHistoryModal';
import { OpenReminderTable } from './components/OpenReminderTable';
import { useToast } from '@/components/ui/Toast';
import styles from './CustomerMasterReport.module.scss';
import { closeReminder, rescheduleReminder } from '@/services/reminderApi';

export const OpenRemindersReport = () => {
    const { openModal, closeModal } = useModal();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('today');
    const [loading, setLoading] = useState(true);
    const [reminders, setReminders] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            let params = {
                page: pagination.page,
                limit: pagination.limit,
                search: searchTerm,
                sortBy: 'reminderDate',
                sortOrder: 'asc'
            };

            if (activeTab === 'today') {
                params.tab = 'TODAY';
            } else if (activeTab === 'upcoming') {
                params.tab = 'UPCOMING';
            } else if (activeTab === 'overdue') {
                params.tab = 'OVERDUE';
            } else if (activeTab === 'closed') {
                params.tab = 'COMPLETED';
            }

            console.log('Fetching open reminders with params:', params);
            const response = await getOpenRemindersReport(params);
            console.log('Open Reminders API Response:', response);

            // Safe Data Mapping
            let results = [];
            let total = 0;

            if (response) {
                // Case 1: Response has { data: [...], meta: ... } (Standard API)
                if (response.data && Array.isArray(response.data)) {
                    results = response.data;
                    total = response.meta?.total || response.totalResults || results.length;
                }
                // Case 2: Response IS the array (Direct return)
                else if (Array.isArray(response)) {
                    results = response;
                    total = response.length;
                }
                // Case 3: Response.data is the array (Axios wrapper case sometimes)
                else if (response.data && response.data.data && Array.isArray(response.data.data)) {
                    results = response.data.data;
                    total = response.data.meta?.total || 0;
                }
            }

            setReminders(results || []);
            setPagination(prev => ({ ...prev, total }));

        } catch (error) {
            console.error('Failed to fetch open reminders:', error);
            addToast('Failed to load reminders. Please try again.', 'error');
            setReminders([]); // Ensure valid state even on error
        } finally {
            setLoading(false);
        }
    }, [activeTab, pagination.page, pagination.limit, searchTerm, addToast]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const handleAction = async (action, reminder) => {
        if (action === 'close') {
            const modalId = openModal(CloseReminderModal, {
                reminder: reminder,
                onConfirm: async (id, notes) => {
                    try {
                        await closeReminder(id);
                        closeModal(modalId);
                        addToast('Task closed successfully', 'success');
                        fetchReports();
                    } catch (err) {
                        addToast('Failed to close task', 'error');
                    }
                }
            });
        } else if (action === 'edit') {
            const modalId = openModal(ChangeDateModal, {
                reminder: reminder,
                title: "Change Reminder Date",
                onSave: async (id, data) => {
                    try {
                        await rescheduleReminder(id, data);
                        closeModal(modalId);
                        addToast('Date rescheduling successfully', 'success');
                        fetchReports();
                    } catch (err) {
                        addToast('Failed to update date', 'error');
                    }
                }
            });
        } else if (action === 'history') {
            // reminder.customerId might be populated object or ID string. 
            // In OpenReminderTable we saw it's populated (company, customerName).
            const customerObj = typeof reminder.customerId === 'object' ? reminder.customerId : {};
            const customerId = customerObj._id || customerObj.id || (typeof reminder.customerId === 'string' ? reminder.customerId : null);

            console.log('🔍 View History Clicked. Reminder:', reminder);
            console.log('🔍 Extracted Customer ID:', customerId);

            if (!customerId) {
                console.error('❌ Customer ID missing in reminder object');
                addToast('Customer information missing', 'error');
                return;
            }

            openModal(ConversationHistoryModal, {
                customerId: customerId,
                customerName: customerObj.customerName || customerObj.company || 'Customer',
                // onClose is passed automatically/handled by Modal wrapper but we can pass explicit if needed.
                // context passes closeModal as prop to component but component uses onClose
            });
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Reminder Tasks</h1>
                <p className={styles.subtitle}>Manage pending and overdue tasks</p>

                {/* Search Bar */}
                <div style={{ marginTop: '16px', maxWidth: '400px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <Input
                        placeholder="Search company, name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
                <TabButton
                    active={activeTab === 'today'}
                    onClick={() => setActiveTab('today')}
                    icon={<Calendar size={18} />}
                    label="Today"
                    color="#3b82f6"
                />
                <TabButton
                    active={activeTab === 'upcoming'}
                    onClick={() => setActiveTab('upcoming')}
                    icon={<CalendarDays size={18} />}
                    label="Upcoming"
                    color="#8b5cf6"
                />
                <TabButton
                    active={activeTab === 'overdue'}
                    onClick={() => setActiveTab('overdue')}
                    icon={<TriangleAlert size={18} />}
                    label="Overdue"
                    color="#ef4444"
                />
                <TabButton
                    active={activeTab === 'closed'}
                    onClick={() => setActiveTab('closed')}
                    icon={<CheckSquare size={18} />}
                    label="Completed"
                    color="#10b981"
                />
            </div>

            {/* Content */}
            <div className={styles.reportContent}>
                {loading ? (
                    <div className={styles.loaderContainer}>
                        <Loader2 className={styles.spinner} />
                        <p>Loading reminders...</p>
                    </div>
                ) : reminders.length === 0 ? (
                    <div className={styles.emptyState}>
                        <AlertCircle size={40} style={{ margin: '0 auto 16px', color: '#9ca3af' }} />
                        <p>No {activeTab} reminders found.</p>
                    </div>
                ) : (
                    <OpenReminderTable
                        reminders={reminders} // Pass as reminders prop
                        onAction={handleAction}
                    />
                )}
            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon, label, count, color }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: 'transparent',
            border: 'none',
            borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
            color: active ? color : '#6b7280',
            fontWeight: active ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
        }}
    >
        {icon}
        {label}
    </button>
);

export default OpenRemindersReport;
