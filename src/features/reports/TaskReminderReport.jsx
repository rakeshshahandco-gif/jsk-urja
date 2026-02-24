import React, { useState, useEffect, useCallback } from 'react';
import {
    LayoutGrid, Calendar, CalendarDays, TriangleAlert, CheckSquare,
    Search, Loader2, AlertCircle, RefreshCw, Filter
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { TaskReportTable } from './components/TaskReportTable';

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
        <div className="p-6 bg-gray-50 min-h-screen">

            {/* ── Line 1: Title + Tabs ─────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-xl font-bold text-gray-900 mr-2">Tasks</h1>

                <div className="flex bg-white p-0.5 rounded-lg border border-gray-200 shadow-sm">
                    <button
                        onClick={() => setActiveTab('today')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'today' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setActiveTab('upcoming')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'upcoming' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Upcoming
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'all' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        All Tasks <span className="ml-1 text-xs px-1.5 py-0.5 bg-gray-100 rounded-full text-gray-500">{pagination.total}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('recurring')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'recurring' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Recurring
                    </button>
                    <button
                        onClick={() => setActiveTab('closed')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'closed' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Closed
                    </button>
                </div>
            </div>


            {/* ── Line 2: All filters in one compact row ────────────── */}
            <div className="flex flex-wrap items-center gap-2 mb-3 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 24px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' }}
                >
                    <option value="">All Types</option>
                    {(options?.taskCategories || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>

                <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 24px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' }}
                >
                    <option value="">All Groups</option>
                    {(options?.taskGroups || []).map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>

                <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 24px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 110, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' }}
                >
                    <option value="">All Assignees</option>
                    {(options?.users || []).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>

                <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{ height: 28, fontSize: 12, padding: '0 24px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 100, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' }}
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
                    style={{ height: 28, fontSize: 12, padding: '0 24px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', minWidth: 100, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' }}
                >
                    <option value="">All Status</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="OVERDUE">Overdue</option>
                </select>

                <div className="relative flex-1 min-w-[140px]">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ height: 28, fontSize: 12, paddingLeft: 24, paddingRight: 8, border: '1px solid #d1d5db', borderRadius: 6, width: '100%', outline: 'none' }}
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
                        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                        <p className="font-medium">Loading your tasks...</p>
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

            {/* Pagination rudimentary */}
            {!loading && tasks.length > 0 && pagination.total > pagination.limit && (
                <div className="mt-8 flex justify-center">
                    <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                            className="h-8 w-8 p-0"
                        >
                            &larr;
                        </Button>
                        <div className="flex gap-1 mx-2">
                            {[...Array(Math.ceil(pagination.total / pagination.limit))].map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setPagination(p => ({ ...p, page: i + 1 }))}
                                    className={`w-8 h-8 rounded-md text-sm font-bold transition-all ${pagination.page === i + 1 ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                            className="h-8 w-8 p-0"
                        >
                            &rarr;
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
