import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2, Calendar } from 'lucide-react';
import { Button, useModal } from '@/components/ui';
import reportApi from '@/services/reportApi';
import { extendReminder, closeReminder } from '@/services/reminderApi';
import { ReminderFilterPanel } from './components/ReminderFilterPanel';
import { ReminderTable } from './components/ReminderTable';
import { ChangeDateModal } from './components/ChangeDateModal';
import styles from './CustomerMasterReport.module.scss'; // Reuse report styles
import { useToast } from '@/components/ui/Toast';

export const ReminderReport = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { openModal, closeModal } = useModal();
    const { addToast } = useToast();

    // State
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalResults, setTotalResults] = useState(0);
    const [activeTab, setActiveTab] = useState('Today'); // Default to Today as per requirement "not general list"

    const [filters, setFilters] = useState({
        search: '',
        priority: '',
        followUpType: '',
        dateFrom: '',
        dateTo: '',
    });

    const [sorting, setSorting] = useState({
        sortBy: 'reminderDate',
        sortOrder: 'asc'
    });

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        totalPages: 1
    });

    // Debounce search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchReminders();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [filters, sorting, pagination.page, activeTab]);

    const fetchReminders = async () => {
        setLoading(true);
        try {
            // Map tab to status
            // Tabs: 1) TODAY 2) UPCOMING 3) OVERDUE 4) CLOSED 5) ALL
            // Backend status support: Pending, Overdue, Closed, Today, Upcoming
            let statusFilter = activeTab; // 'Today', 'Upcoming', 'Overdue', 'Closed' match backend
            if (activeTab === 'All') statusFilter = '';

            const params = {
                ...filters,
                status: statusFilter,
                sortBy: sorting.sortBy,
                sortOrder: sorting.sortOrder,
                page: pagination.page,
                limit: pagination.limit
            };

            const data = await reportApi.getReminderReport(params);
            setReminders(data.results);
            setTotalResults(data.totalResults);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages }));
        } catch (error) {
            console.error('Failed to fetch reminders:', error);
            addToast('Failed to load reminders', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleExport = async (type) => {
        try {
            let statusFilter = activeTab;
            if (activeTab === 'All') statusFilter = '';

            const params = { ...filters, status: statusFilter, sortBy: sorting.sortBy, sortOrder: sorting.sortOrder };

            let response;
            if (type === 'excel') {
                response = await reportApi.exportReminderExcelBlob(params);
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `reminder-report-${new Date().toISOString().split('T')[0]}.xlsx`);
                document.body.appendChild(link);
                link.click();
            } else {
                response = await reportApi.exportReminderPDFBlob(params);
                const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                window.open(url, '_blank');
            }
        } catch (error) {
            console.error('Export failed:', error);
            addToast('Export failed', 'error');
        }
    };

    const handleChangeDate = (reminder) => {
        openModal(
            <ChangeDateModal
                reminder={reminder}
                onClose={closeModal}
                onSave={async (id, data) => {
                    try {
                        await extendReminder(id, data);
                        addToast('Reminder rescheduled successfully', 'success');
                        closeModal();
                        fetchReminders(); // Refresh list
                    } catch (error) {
                        console.error('Failed to reschedule:', error);
                        addToast('Failed to reschedule', 'error');
                    }
                }}
            />
        );
    };

    const handleCloseTask = async (reminder) => {
        if (!window.confirm('Are you sure you want to close this task?')) return;
        try {
            await closeReminder(reminder._id);
            addToast('Task closed successfully', 'success');
            fetchReminders();
        } catch (error) {
            console.error('Failed to close task:', error);
            addToast('Failed to close task', 'error');
        }
    };

    const tabs = ['Today', 'Upcoming', 'Overdue', 'Closed', 'All'];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Reminder Report</h1>
                    <p className={styles.subtitle}>Manage your daily reminders and tasks</p>
                </div>
                <div className={styles.actions}>
                    <Button variant="outline" onClick={() => handleExport('excel')} className="gap-2">
                        <Download size={16} /> Export Excel
                    </Button>
                    <Button variant="outline" onClick={() => handleExport('pdf')} className="gap-2">
                        <Download size={16} /> Export PDF
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6 space-x-1 overflow-x-auto pb-1">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`
                            px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                            ${activeTab === tab
                                ? 'bg-white border-x border-t border-gray-200 text-blue-600 -mb-px'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}
                        `}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className={styles.content}>
                <ReminderFilterPanel
                    filters={filters}
                    onFilterChange={handleFilterChange}
                />

                <div className="flex justify-between items-center mb-4 px-4 text-sm text-gray-500">
                    <div>
                        Found <strong>{totalResults}</strong> reminders
                    </div>
                    {/* Could add pagination controls here or bottom */}
                </div>

                <div className={styles.tableWrapper}>
                    <ReminderTable
                        reminders={reminders}
                        onChangeDate={handleChangeDate}
                        onCloseTask={handleCloseTask}
                        loading={loading}
                    />
                </div>

                {/* Simple Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-4 pb-4">
                        <Button
                            variant="outline"
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        >
                            Previous
                        </Button>
                        <span className="flex items-center text-sm">
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            disabled={pagination.page >= pagination.totalPages}
                            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReminderReport;
