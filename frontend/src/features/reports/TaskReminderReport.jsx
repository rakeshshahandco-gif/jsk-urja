import React, { useState, useEffect, useCallback } from 'react';
import {
    LayoutGrid, Calendar, CalendarDays, TriangleAlert, CheckSquare,
    Search, Loader2, AlertCircle, RefreshCw, Filter
} from 'lucide-react';
import { Button, Input, Select, BrandedLoader } from '@/components/ui';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { TaskReportTable } from './components/TaskReportTable';
import styles from './CustomerMasterReport.module.scss';

import { getReportOptions } from '@/services/reportApi';
import { ExtendTaskModal } from './components/ExtendTaskModal';
import { extendTask, closeTask } from '@/services/taskApi';

const TaskReminderReport = () => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('today');
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [options, setOptions] = useState({
        taskCategories: [],
        taskGroups: [],
        users: []
    });

    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const optData = await getReportOptions();
                setOptions({
                    taskCategories: optData.taskCategories || [],
                    taskGroups: optData.taskGroups || [],
                    users: optData.users || []
                });
            } catch (error) {
                console.error('Failed to fetch filter options:', error);
            }
        };
        fetchOptions();
    }, []);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            let params = {
                page: pagination.page,
                limit: pagination.limit,
                search: searchTerm,
                priority: priorityFilter || undefined,
                status: statusFilter || undefined,
                taskCategoryId: categoryFilter || undefined,
                groupId: groupFilter || undefined,
                assigneeId: assigneeFilter || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            };

            if (activeTab === 'today') {
                params.tab = 'TODAY';
            } else if (activeTab === 'upcoming') {
                params.tab = 'UPCOMING';
            } else if (activeTab === 'overdue') {
                params.tab = 'OVERDUE';
            } else if (activeTab === 'closed') {
                params.tab = 'CLOSED';
            } else if (activeTab === 'all') {
                params.tab = 'ALL';
            } else if (activeTab === 'recurring') {
                params.tab = 'RECURRING';
            }

            const response = await api.get('/reports/task-reminders', { params });

            setTasks(response.data.data || []);
            setPagination(prev => ({
                ...prev,
                total: response.data.meta?.total || 0
            }));

        } catch (error) {
            console.error('Failed to fetch task report:', error);
            addToast('Failed to load tasks. Please try again.', 'error');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, pagination.page, pagination.limit, searchTerm, priorityFilter, statusFilter, categoryFilter, groupFilter, assigneeFilter, dateFrom, dateTo, addToast]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const handleExtendConfirm = async (taskId, data) => {
        try {
            await extendTask(taskId, data);
            addToast('Task due date extended successfully!', 'success');
            fetchTasks();
        } catch (error) {
            addToast('Failed to extend task.', 'error');
            throw error;
        }
    };

    const handleCloseTask = async (taskId) => {
        if (!window.confirm('Are you sure you want to close this task?')) return;
        try {
            await closeTask(taskId);
            addToast('Task closed successfully!', 'success');
            fetchTasks();
        } catch (error) {
            addToast('Failed to close task.', 'error');
        }
    };

    return (
        <div className={styles.container}>

            {/* ── Line 1: Title + Tabs ─────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Tasks</h1>

                <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #e2e8f0', gap: 2 }}>
                    {[
                        { key: 'today', label: 'Today' },
                        { key: 'upcoming', label: 'Upcoming' },
                        { key: 'all', label: 'All Tasks' },
                        { key: 'recurring', label: 'Recurring' },
                        { key: 'closed', label: 'Closed' },
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            style={{
                                padding: '5px 14px',
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 6,
                                cursor: 'pointer',
                                border: 'none',
                                background: activeTab === key ? '#fff' : 'transparent',
                                color: activeTab === key ? '#0d9488' : '#64748b',
                                boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            {label}
                            {key === 'all' && <span style={{ marginLeft: 4, fontSize: 11, padding: '1px 6px', background: '#f1f5f9', borderRadius: 999, color: '#64748b' }}>{pagination.total}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Line 2: All filters in one compact row ────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, background: '#fff', padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em', color: '#374151', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">All Types</option>
                    {(options?.taskCategories || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>

                <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    style={{ height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em', color: '#374151', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">All Groups</option>
                    {(options?.taskGroups || []).map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>

                <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    style={{ height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em', color: '#374151', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">All Assignees</option>
                    {(options?.users || []).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>

                <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{ height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 100, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em', color: '#374151', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">All Priority</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 100, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em', color: '#374151', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">All Status</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="OVERDUE">Overdue</option>
                </select>

                <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                    <input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ height: 32, fontSize: 13, paddingLeft: 28, paddingRight: 8, border: '1px solid #d1d5db', borderRadius: 6, width: '100%', outline: 'none', color: '#374151' }}
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <div className={styles.reportContent} style={{ minHeight: 400 }}>
                {loading ? (
                    <div className={styles.loaderContainer}>
                        <BrandedLoader size={120} />
                    </div>
                ) : (
                    <TaskReportTable
                        tasks={tasks}
                        loading={loading}
                        onExtend={(task) => {
                            setSelectedTask(task);
                            setIsExtendModalOpen(true);
                        }}
                        onCloseTask={handleCloseTask}
                        onRefresh={fetchTasks}
                    />
                )}
            </div>

            {/* Pagination */}
            {!loading && tasks.length > 0 && pagination.total > pagination.limit && (
                <div className={styles.pagination}>
                    <div className={styles.paginationInfo}>
                        Showing page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                    </div>
                    <div className={styles.paginationControls}>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        >
                            ← Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        >
                            Next →
                        </Button>
                    </div>
                </div>
            )}

            <ExtendTaskModal
                task={selectedTask}
                isOpen={isExtendModalOpen}
                onClose={() => setIsExtendModalOpen(false)}
                onConfirm={handleExtendConfirm}
            />
        </div>
    );

};

export default TaskReminderReport;
