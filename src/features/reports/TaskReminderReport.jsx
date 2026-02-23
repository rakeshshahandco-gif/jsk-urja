import React, { useState, useEffect, useCallback } from 'react';
import {
    LayoutGrid, Calendar, CalendarDays, TriangleAlert, CheckSquare,
    Search, Loader2, AlertCircle, RefreshCw, Filter
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { TaskReportTable } from './components/TaskReportTable';

const TaskReminderReport = () => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('today');
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            let params = {
                page: pagination.page,
                limit: pagination.limit,
                search: searchTerm,
                priority: priorityFilter || undefined,
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
    }, [activeTab, pagination.page, pagination.limit, searchTerm, priorityFilter, addToast]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* Header section */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <LayoutGrid className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Task Reminder Report</h1>
                </div>
                <p className="text-gray-500 ml-11">Monitor and manage your internal work tasks and deadlines.</p>
            </div>

            {/* Filters & Actions bar */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full relative">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Search Tasks</label>
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input
                                placeholder="Search by title, description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 bg-gray-50 border-gray-200 focus:bg-white transition-all"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Priority</label>
                        <Select
                            value={priorityFilter}
                            onChange={(val) => setPriorityFilter(val)}
                            className="bg-gray-50 border-gray-200"
                            options={[
                                { label: 'All Priorities', value: '' },
                                { label: 'Low', value: 'LOW' },
                                { label: 'Medium', value: 'MEDIUM' },
                                { label: 'High', value: 'HIGH' },
                                { label: 'Urgent', value: 'URGENT' },
                                { label: 'Critical', value: 'CRITICAL' },
                            ]}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={() => {
                                setSearchTerm('');
                                setPriorityFilter('');
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                            variant="outline"
                            className="h-10 border-gray-200 hover:bg-gray-100 px-4"
                        >
                            <RefreshCw size={18} className="mr-2" />
                            Reset
                        </Button>
                        <Button
                            onClick={fetchTasks}
                            className="h-10 px-6 font-semibold"
                        >
                            <Filter size={18} className="mr-2" />
                            Apply
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-1 mb-6 bg-white p-1 rounded-xl border border-gray-200 shadow-sm w-fit">
                <TabButton
                    active={activeTab === 'today'}
                    onClick={() => setActiveTab('today')}
                    icon={<Calendar size={18} />}
                    label="Today"
                    activeColor="text-blue-600 bg-blue-50"
                />
                <TabButton
                    active={activeTab === 'upcoming'}
                    onClick={() => setActiveTab('upcoming')}
                    icon={<CalendarDays size={18} />}
                    label="Upcoming"
                    activeColor="text-purple-600 bg-purple-50"
                />
                <TabButton
                    active={activeTab === 'overdue'}
                    onClick={() => setActiveTab('overdue')}
                    icon={<TriangleAlert size={18} />}
                    label="Overdue"
                    activeColor="text-red-600 bg-red-50"
                />
                <TabButton
                    active={activeTab === 'closed'}
                    onClick={() => setActiveTab('closed')}
                    icon={<CheckSquare size={18} />}
                    label="Completed"
                    activeColor="text-green-600 bg-green-50"
                />
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
                    />
                )}
            </div>

            {/* Pagination rudimentary */}
            {!loading && tasks.length > 0 && pagination.total > pagination.limit && (
                <div className="mt-8 flex justify-center">
                    <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        >
                            Previous
                        </Button>
                        <span className="px-4 text-sm font-medium border-x border-gray-100">
                            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

const TabButton = ({ active, onClick, icon, label, activeColor }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200
            ${active
                ? `${activeColor} shadow-sm`
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
    >
        {React.cloneElement(icon, { size: 18, className: active ? '' : 'text-gray-400' })}
        {label}
    </button>
);

export default TaskReminderReport;
