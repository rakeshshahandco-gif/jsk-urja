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
            {/* Header section */}
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 uppercase">Rakesh Shah</span>
                        <span className="px-2 py-0.5 bg-yellow-400 rounded-full text-[10px] font-bold text-black border border-yellow-500 ring-2 ring-yellow-400 ring-offset-1">MANAGER</span>
                    </div>
                </div>
            </div>

            {/* Tabs & Top Filters bar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
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

            {/* Advanced Filters Grid */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                    <div className="lg:col-span-1">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Task Type</label>
                        <Select
                            value={categoryFilter}
                            onChange={(val) => setCategoryFilter(val)}
                            className="h-9 text-sm"
                            options={[
                                { label: 'All Types', value: '' },
                                ...(options?.taskCategories || []).map(c => ({ label: c.name, value: c._id }))
                            ]}
                        />
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Group</label>
                        <Select
                            value={groupFilter}
                            onChange={(val) => setGroupFilter(val)}
                            className="h-9 text-sm"
                            options={[
                                { label: 'All Groups', value: '' },
                                ...(options?.taskGroups || []).map(g => ({ label: g.name, value: g._id }))
                            ]}
                        />
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Assigned To</label>
                        <Select
                            value={assigneeFilter}
                            onChange={(val) => setAssigneeFilter(val)}
                            className="h-9 text-sm"
                            options={[
                                { label: 'All Users', value: '' },
                                ...(options?.users || []).map(u => ({ label: u.name, value: u._id }))
                            ]}
                        />
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Priority</label>
                        <Select
                            value={priorityFilter}
                            onChange={(val) => setPriorityFilter(val)}
                            className="h-9 text-sm"
                            options={[
                                { label: 'All Priority', value: '' },
                                { label: 'Low', value: 'LOW' },
                                { label: 'Medium', value: 'MEDIUM' },
                                { label: 'High', value: 'HIGH' },
                                { label: 'Urgent', value: 'URGENT' },
                            ]}
                        />
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Status</label>
                        <Select
                            value={statusFilter}
                            onChange={(val) => setStatusFilter(val)}
                            className="h-9 text-sm"
                            options={[
                                { label: 'All Status', value: '' },
                                { label: 'Open', value: 'OPEN' },
                                { label: 'In Progress', value: 'IN_PROGRESS' },
                                { label: 'Completed', value: 'COMPLETED' },
                                { label: 'Cancelled', value: 'CANCELLED' },
                                { label: 'Overdue', value: 'OVERDUE' },
                            ]}
                        />
                    </div>

                    <div className="lg:col-span-1 relative">
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Search</label>
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9 text-sm"
                            />
                        </div>
                    </div>
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
