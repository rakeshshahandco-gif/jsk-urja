import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { Search, RotateCcw, ChevronLeft, ChevronRight, LayoutList, Zap, Plus } from 'lucide-react';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { ManageTasksTable } from './ManageTasksTable';
import PriorityTaskView from './PriorityTaskView';
import { getReportOptions } from '@/services/reportApi';
import { ExtendTaskModal } from '@/features/reports/components/ExtendTaskModal';
import { extendTask, closeTask, deleteTask } from '@/services/taskApi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ─── Shared compact styles ─────────────────────────────────────────────────
const s = {
    sel: {
        height: 28, fontSize: 11, padding: '0 22px 0 6px', border: '1px solid #d1d5db',
        borderRadius: 5, background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer',
        appearance: 'none', minWidth: 90,
        backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 3px center', backgroundSize: '0.9em'
    },
    inp: {
        height: 28, fontSize: 11, padding: '0 6px', border: '1px solid #d1d5db', color: '#374151',
        borderRadius: 5, background: '#fff', outline: 'none', width: 88
    },
    tab: (active) => ({
        padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none',
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? '#0d9488' : '#6b7280',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        transition: 'all 0.15s'
    }),
    resetBtn: {
        height: 28, padding: '0 10px', fontSize: 11, fontWeight: 600,
        border: '1px solid #d1d5db', borderRadius: 5, background: '#fff',
        color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
    }
};

const TABS = [
    { id: 'overdue', api: 'OVERDUE', label: 'Overdue' },
    { id: 'today', api: 'TODAY', label: 'Today' },
    { id: 'upcoming', api: 'UPCOMING', label: 'Upcoming' },
    { id: 'all', api: 'ALL', label: 'All Tasks' },
    { id: 'closed', api: 'CLOSED', label: 'Closed' },
];

const VIEW_MODES = [
    { id: 'existing', label: 'Existing View', Icon: LayoutList },
    { id: 'priority', label: 'Priority View', Icon: Zap },
];

// ─── Component ─────────────────────────────────────────────────────────────
const ManageTasksPage = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [viewMode, setViewMode] = useState('existing');
    const [activeTab, setActiveTab] = useState(null);
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
        // Load users from report options
        getReportOptions()
            .then(d => setOptions(prev => ({ ...prev, users: d.users || [] })))
            .catch(() => { });

        // Load groups from dedicated filtered endpoint (respects user membership)
        api.get('/task-groups/my')
            .then(res => {
                const groups = res.data?.data || res.data || [];
                setOptions(prev => ({ ...prev, taskGroups: Array.isArray(groups) ? groups : [] }));
            })
            .catch(() => { });

        api.get('/reports/manage-tasks', { params: { tab: 'OVERDUE', limit: 1 } })
            .then(res => {
                if (res.data.meta?.total > 0) setActiveTab('overdue');
                else setActiveTab('today');
            })
            .catch(() => setActiveTab('today'));
    }, []);

    const fetchTasks = useCallback(async () => {
        if (!activeTab) return;
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

    const { socket } = useGlobalSync('task', (payload) => {
        if (payload.action === 'create') {
            setTasks(prev => {
                if (prev.find(t => t._id === payload.recordId)) return prev;
                // Since data is now fully populated from backend, we can add it directly
                return [payload.data, ...prev].slice(0, pagination.limit);
            });
            setPagination(p => ({ ...p, total: p.total + 1 }));
        } else if (payload.action === 'update' || payload.action === 'assigned') {
            setTasks(prev => prev.map(t => t._id === payload.recordId ? { ...t, ...payload.data } : t));
        } else if (payload.action === 'delete') {
            setTasks(prev => prev.filter(t => t._id !== payload.recordId));
            setPagination(p => ({ ...p, total: Math.max(0, p.total - 1) }));
        }
    });

    // Reconnection Sync: Ensure we have the latest data if socket was offline
    useEffect(() => {
        if (!socket) return;
        const handleReconnect = () => {
             console.log('🔄 Reconnected! Syncing task list...');
             fetchTasks();
        };
        socket.on('connect', handleReconnect);
        return () => socket.off('connect', handleReconnect);
    }, [socket, fetchTasks]);

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
        <div style={{ padding: '16px 20px', background: '#f8f9fa', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── LINE 1: Title + View Toggle + Tabs + New Task ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>Manage Tasks</span>

                {/* View Mode Toggle */}
                <div style={{ display: 'flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, padding: 3, gap: 2 }}>
                    {VIEW_MODES.map(vm => {
                        const active = viewMode === vm.id;
                        return (
                            <button
                                key={vm.id}
                                onClick={() => setViewMode(vm.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '4px 12px', fontSize: 11, fontWeight: 700,
                                    borderRadius: 5, border: 'none', cursor: 'pointer',
                                    background: active ? (vm.id === 'priority' ? '#0d9488' : '#fff') : 'transparent',
                                    color: active ? (vm.id === 'priority' ? '#fff' : '#0d9488') : '#6b7280',
                                    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                                    transition: 'all 0.18s',
                                }}
                            >
                                <vm.Icon size={12} />
                                {vm.label}
                            </button>
                        );
                    })}
                </div>

                {/* Existing View sub-tabs — only visible in existing mode */}
                {viewMode === 'existing' && (
                    <div style={{ display: 'flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, padding: 3, gap: 2 }}>
                        {TABS.map(t => (
                            <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => handleTab(t.id)}>
                                {t.label}
                                {t.id === 'all' && <span style={{ marginLeft: 4, background: '#e2e8f0', borderRadius: 8, padding: '0 5px', fontSize: 10, color: '#64748b' }}>{pagination.total}</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* New Task Button */}
                <div style={{ marginLeft: 'auto' }}>
                    <button
                        onClick={() => navigate('/tasks/create')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            height: 30, padding: '0 14px', fontSize: 11, fontWeight: 700,
                            border: 'none', borderRadius: 6, cursor: 'pointer',
                            background: '#0d9488', color: '#fff',
                            boxShadow: '0 2px 6px rgba(13,148,136,0.3)',
                        }}
                    >
                        <Plus size={13} /> New Task
                    </button>
                </div>
            </div>

            {/* ── LINE 2: Filters (shared for both views) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <select style={s.sel} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
                    <option value="">All Groups</option>
                    {options.taskGroups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>

                {user?.role === 'admin' && (
                    <select style={s.sel} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                        <option value="">All Assignees</option>
                        {options.users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                )}

                {user?.role === 'admin' && (
                    <select style={s.sel} value={createdByFilter} onChange={e => setCreatedByFilter(e.target.value)}>
                        <option value="">All Creators</option>
                        {options.users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                )}

                <select style={s.sel} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                    <option value="">All Priority</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                    <option value="CRITICAL">Critical</option>
                </select>

                {viewMode === 'existing' && (
                    <>
                        <input type="date" style={s.inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>–</span>
                        <input type="date" style={s.inp} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
                    </>
                )}

                <div style={{ position: 'relative', flex: 1, minWidth: 110 }}>
                    <Search size={11} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                        style={{ ...s.inp, width: '100%', paddingLeft: 20 }}
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <button style={s.resetBtn} onClick={resetFilters} title="Reset all filters">
                    <RotateCcw size={11} /> Reset
                </button>

                {viewMode === 'existing' && (
                    <select style={{ ...s.sel, marginLeft: 'auto' }} value={pagination.limit} onChange={e => setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }))}>
                        <option value={15}>15 / page</option>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                    </select>
                )}
            </div>

            {/* ── CONTENT AREA ── */}
            {viewMode === 'priority' ? (
                <PriorityTaskView
                    searchTerm={searchTerm}
                    priorityFilter={priorityFilter}
                    groupFilter={groupFilter}
                    assigneeFilter={assigneeFilter}
                />
            ) : (
                <>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, flex: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
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

                    {!loading && pagination.total > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>
                                {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </span>
                            <button
                                disabled={pagination.page <= 1}
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                style={{ height: 26, width: 26, border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#374151', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pagination.page <= 1 ? 0.4 : 1 }}
                            >
                                <ChevronLeft size={13} />
                            </button>
                            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                                const pg = i + 1;
                                return (
                                    <button
                                        key={pg}
                                        onClick={() => setPagination(p => ({ ...p, page: pg }))}
                                        style={{ height: 26, minWidth: 26, padding: '0 4px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: pagination.page === pg ? '#0d9488' : '#fff', color: pagination.page === pg ? '#fff' : '#374151' }}
                                    >
                                        {pg}
                                    </button>
                                );
                            })}
                            <button
                                disabled={pagination.page >= totalPages}
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                style={{ height: 26, width: 26, border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#374151', cursor: pagination.page >= totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pagination.page >= totalPages ? 0.4 : 1 }}
                            >
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    )}
                </>
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
