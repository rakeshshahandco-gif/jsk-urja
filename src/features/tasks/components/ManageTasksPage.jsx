import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { ManageTasksTable } from './ManageTasksTable';
import { getReportOptions } from '@/services/reportApi';
import { ExtendTaskModal } from '@/features/reports/components/ExtendTaskModal';
import { extendTask, closeTask, deleteTask } from '@/services/taskApi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Shared compact styles
const s = {
    sel: {
        height: 28, fontSize: 11, padding: '0 22px 0 6px', border: '1px solid #334155',
        borderRadius: 5, background: '#0f172a', color: '#f1f5f9', outline: 'none', cursor: 'pointer',
        appearance: 'none', minWidth: 90,
        backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 3px center', backgroundSize: '0.9em'
    },
    inp: {
        height: 28, fontSize: 11, padding: '0 6px', border: '1px solid #334155', color: '#f1f5f9',
        borderRadius: 5, background: '#0f172a', outline: 'none', width: 88, colorScheme: 'dark'
    },
    tab: (active) => ({
        padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none',
        cursor: 'pointer', background: active ? '#2563eb' : 'transparent',
        color: active ? '#fff' : '#94a3b8', transition: 'all 0.15s'
    }),
    resetBtn: {
        height: 28, padding: '0 10px', fontSize: 11, fontWeight: 600,
        border: '1px solid #334155', borderRadius: 5, background: '#0f172a',
        color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
    }
};

const TABS = [
    { id: 'today', api: 'TODAY', label: 'Today' },
    { id: 'upcoming', api: 'UPCOMING', label: 'Upcoming' },
    { id: 'overdue', api: 'OVERDUE', label: 'Overdue' },
    { id: 'all', api: 'ALL', label: 'All Tasks' },
    { id: 'closed', api: 'CLOSED', label: 'Closed' },
];

const ManageTasksPage = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [activeTab, setActiveTab] = useState('today');
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('');
    const [createdByFilter, setCreatedByFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
    const [options, setOptions] = useState({ taskGroups: [], users: [] });
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);

    useEffect(() => {
        getReportOptions()
            .then(d => setOptions({ taskGroups: d.taskGroups || [], users: d.users || [] }))
            .catch(() => { });
    }, []);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const tab = TABS.find(t => t.id === activeTab)?.api || 'ALL';
            const params = {
                page: pagination.page, limit: pagination.limit,
                tab,
                search: searchTerm || undefined,
                priority: priorityFilter || undefined,
                groupId: groupFilter || undefined,
                assigneeId: assigneeFilter || undefined,
                createdById: createdByFilter || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            };
            const res = await api.get('/reports/manage-tasks', { params });
            setTasks(res.data.data || []);
            setPagination(p => ({ ...p, total: res.data.meta?.total || 0 }));
        } catch {
            addToast('Failed to load tasks.', 'error');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, pagination.page, pagination.limit, searchTerm, priorityFilter, groupFilter, assigneeFilter, createdByFilter, dateFrom, dateTo]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useGlobalSync('task', (payload) => {
        if (payload.action === 'create') {
            setTasks(prev => {
                if (prev.find(t => t._id === payload.recordId)) return prev;
                return [payload.data, ...prev].slice(0, pagination.limit);
            });
            setPagination(p => ({ ...p, total: p.total + 1 }));
        } else if (payload.action === 'update') {
            setTasks(prev => prev.map(t => t._id === payload.recordId ? { ...t, ...payload.data } : t));
        } else if (payload.action === 'delete') {
            setTasks(prev => prev.filter(t => t._id !== payload.recordId));
            setPagination(p => ({ ...p, total: Math.max(0, p.total - 1) }));
        }
    });

    const resetFilters = () => {
        setSearchTerm(''); setPriorityFilter(''); setGroupFilter('');
        setAssigneeFilter(''); setCreatedByFilter(''); setDateFrom(''); setDateTo('');
        setPagination(p => ({ ...p, page: 1 }));
    };

    const handleTab = (id) => { setActiveTab(id); setPagination(p => ({ ...p, page: 1 })); };

    const handleExtendConfirm = async (taskId, data) => {
        try { await extendTask(taskId, data); addToast('Task extended!', 'success'); fetchTasks(); }
        catch { addToast('Failed to extend task.', 'error'); throw new Error(); }
    };

    const handleCloseTask = async (taskId) => {
        if (!window.confirm('Close this task?')) return;
        try { await closeTask(taskId); addToast('Task closed!', 'success'); fetchTasks(); }
        catch { addToast('Failed to close task.', 'error'); }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm('Delete this task permanently?')) return;
        try { await deleteTask(taskId); addToast('Task deleted.', 'success'); fetchTasks(); }
        catch { addToast('Failed to delete task.', 'error'); }
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;

    return (
        <div style={{ padding: '10px 16px', background: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8, color: '#f1f5f9' }}>

            {/* ── LINE 1: Title + Tabs + Total badge ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', whiteSpace: 'nowrap' }}>Manage Tasks</span>
                <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 3, gap: 2 }}>
                    {TABS.map(t => (
                        <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => handleTab(t.id)}>
                            {t.label}
                            {t.id === 'all' && <span style={{ marginLeft: 4, background: activeTab === 'all' ? 'rgba(255,255,255,0.25)' : '#334155', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{pagination.total}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── LINE 2: All Filters in one row ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, padding: '6px 10px' }}>
                {/* Group */}
                <select style={s.sel} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
                    <option value="">All Groups</option>
                    {options.taskGroups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>

                {/* Assigned To - Admin Only */}
                {user?.role === 'admin' && (
                    <select style={s.sel} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                        <option value="">All Assignees</option>
                        {options.users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                )}

                {/* Created By - Admin Only */}
                {user?.role === 'admin' && (
                    <select style={s.sel} value={createdByFilter} onChange={e => setCreatedByFilter(e.target.value)}>
                        <option value="">All Creators</option>
                        {options.users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                )}

                {/* Priority */}
                <select style={s.sel} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                    <option value="">All Priority</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                    <option value="CRITICAL">Critical</option>
                </select>

                {/* Date From */}
                <input type="date" style={s.inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>–</span>
                <input type="date" style={s.inp} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />

                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: 110 }}>
                    <Search size={11} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                        style={{ ...s.inp, width: '100%', paddingLeft: 20 }}
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Reset */}
                <button style={s.resetBtn} onClick={resetFilters} title="Reset all filters">
                    <RotateCcw size={11} /> Reset
                </button>

                {/* Rows per page */}
                <select style={{ ...s.sel, marginLeft: 'auto' }} value={pagination.limit} onChange={e => setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }))}>
                    <option value={15}>15 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                </select>
            </div>

            {/* ── TABLE ── */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, flex: 1 }}>
                <ManageTasksTable
                    tasks={tasks}
                    loading={loading}
                    onExtend={task => { setSelectedTask(task); setIsExtendModalOpen(true); }}
                    onCloseTask={handleCloseTask}
                    onEdit={task => navigate(`/tasks/edit/${task._id}`)}
                    onDelete={handleDeleteTask}
                    onViewDetails={task => navigate(`/tasks/${task._id}`)}
                />
            </div>

            {/* ── PAGINATION ── */}
            {!loading && pagination.total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </span>
                    <button
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        style={{ height: 26, width: 26, border: '1px solid #334155', borderRadius: 5, background: '#1e293b', color: '#f1f5f9', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pagination.page <= 1 ? 0.4 : 1 }}
                    >
                        <ChevronLeft size={13} />
                    </button>
                    {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                        const pg = i + 1;
                        return (
                            <button
                                key={pg}
                                onClick={() => setPagination(p => ({ ...p, page: pg }))}
                                style={{ height: 26, minWidth: 26, padding: '0 4px', border: '1px solid #334155', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: pagination.page === pg ? '#2563eb' : '#1e293b', color: pagination.page === pg ? '#fff' : '#f1f5f9' }}
                            >
                                {pg}
                            </button>
                        );
                    })}
                    <button
                        disabled={pagination.page >= totalPages}
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        style={{ height: 26, width: 26, border: '1px solid #334155', borderRadius: 5, background: '#1e293b', color: '#f1f5f9', cursor: pagination.page >= totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pagination.page >= totalPages ? 0.4 : 1 }}
                    >
                        <ChevronRight size={13} />
                    </button>
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

export default ManageTasksPage;
