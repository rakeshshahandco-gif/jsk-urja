import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { Search, RotateCcw, ChevronLeft, ChevronRight, LayoutList, Columns3, Plus } from 'lucide-react';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { ManageTasksTable } from './ManageTasksTable';
import { TaskUpdateDrawer } from './TaskUpdateDrawer';
import WorkboardTaskView from './WorkboardTaskView';
import { TaskHubSummaryStrip } from './TaskHubSummaryStrip';
import { TaskHubConfirmDialog } from './TaskHubConfirmDialog';
import { getReportOptions } from '@/services/reportApi';
import { ExtendTaskModal } from '@/features/reports/components/ExtendTaskModal';
import { extendTask, closeTask, deleteTask, getHighlightedTaskGroups, getTaskGroup } from '@/services/taskApi';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TABLE_TABS, VIEW_MODES } from './taskHubConstants';
import { ViewTabs, FilterChips } from '@/components/ui';
import { HighlightedGroupsStrip, SelectedGroupSummary } from './HighlightedGroupsStrip';
import pageStyles from './ManageTasksPage.module.scss';

const MONGO_ID_RE = /^[a-f\d]{24}$/i;

const normalizeViewMode = (mode) => {
    if (mode === 'priority' || mode === 'workboard') return 'workboard';
    if (mode === 'existing' || mode === 'table') return 'table';
    return mode === 'table' ? 'table' : 'workboard';
};

const ManageTasksPage = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { id: routeTaskId } = useParams();
    const { user } = useAuth();

    const { filters, setFilter, resetFilters } = useFilterPersistence('crm-tasks', {
        viewMode: 'workboard',
        activeTab: 'overdue',
        searchTerm: '',
        priorityFilter: '',
        groupFilter: '',
        assigneeFilter: '',
        createdByFilter: '',
        dateFrom: '',
        dateTo: '',
        page: 1,
        limit: 25,
    });

    const viewMode = normalizeViewMode(filters.viewMode);
    const {
        activeTab,
        searchTerm,
        priorityFilter,
        groupFilter,
        assigneeFilter,
        createdByFilter,
        dateFrom,
        dateTo,
        page,
        limit,
    } = filters;

    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState([]);
    const [total, setTotal] = useState(0);
    const [options, setOptions] = useState({ taskGroups: [], users: [] });
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [summaryStats, setSummaryStats] = useState({ overdue: 0, today: 0, week: 0, open: 0 });
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [workboardRefresh, setWorkboardRefresh] = useState(0);
    const [highlightedGroups, setHighlightedGroups] = useState([]);
    const [highlightedLoading, setHighlightedLoading] = useState(false);
    const [hubSelectedGroupId, setHubSelectedGroupId] = useState(null);
    const [hubGroupDetail, setHubGroupDetail] = useState(null);

    useEffect(() => {
        if (filters.viewMode !== viewMode) {
            setFilter('viewMode', viewMode);
        }
    }, [filters.viewMode, viewMode, setFilter]);

    useEffect(() => {
        if (routeTaskId && MONGO_ID_RE.test(routeTaskId)) {
            setSelectedTaskId(routeTaskId);
        } else {
            // Left /tasks/:taskId (e.g. X / backdrop / post-extend navigate) — keep drawer closed.
            setSelectedTaskId(null);
        }
    }, [routeTaskId]);

    useEffect(() => {
        getReportOptions()
            .then((d) => setOptions((prev) => ({ ...prev, users: d.users || [] })))
            .catch(() => {});

        api.get('/task-groups/my')
            .then((res) => {
                const groups = res.data?.data || res.data || [];
                setOptions((prev) => ({ ...prev, taskGroups: Array.isArray(groups) ? groups : [] }));
            })
            .catch(() => {});
    }, []);

    const loadHighlightedGroups = useCallback(async () => {
        setHighlightedLoading(true);
        try {
            const rows = await getHighlightedTaskGroups();
            const list = Array.isArray(rows) ? rows : [];
            setHighlightedGroups(list);
            const defaultGroup = list.find((g) => g.isDefaultSelected);
            if (defaultGroup && !hubSelectedGroupId) {
                setHubSelectedGroupId(defaultGroup._id);
            }
        } catch {
            setHighlightedGroups([]);
        } finally {
            setHighlightedLoading(false);
        }
    }, [hubSelectedGroupId]);

    useEffect(() => {
        loadHighlightedGroups();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!hubSelectedGroupId) {
            setHubGroupDetail(null);
            return;
        }
        let cancelled = false;
        getTaskGroup(hubSelectedGroupId)
            .then((data) => {
                if (!cancelled) setHubGroupDetail(data);
            })
            .catch(() => {
                if (!cancelled) setHubGroupDetail(null);
            });
        return () => { cancelled = true; };
    }, [hubSelectedGroupId]);

    // When a highlighted group is selected, drive the existing group filter.
    useEffect(() => {
        if (hubSelectedGroupId) {
            setFilter('groupFilter', String(hubSelectedGroupId));
            setFilter('page', 1);
        }
    }, [hubSelectedGroupId, setFilter]);

    const filterParams = useMemo(
        () => ({
            search: searchTerm || undefined,
            priority: priorityFilter || undefined,
            groupId: groupFilter || undefined,
            assigneeId: assigneeFilter || undefined,
            createdById: createdByFilter || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
        }),
        [searchTerm, priorityFilter, groupFilter, assigneeFilter, createdByFilter, dateFrom, dateTo]
    );

    const fetchTableSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            const base = { limit: 1, page: 1, ...filterParams };
            const [overdueRes, todayRes, upcomingRes] = await Promise.all([
                api.get('/reports/manage-tasks', { params: { ...base, tab: 'OVERDUE' } }),
                api.get('/reports/manage-tasks', { params: { ...base, tab: 'TODAY' } }),
                api.get('/reports/manage-tasks', { params: { ...base, tab: 'UPCOMING' } }),
            ]);
            const overdue = overdueRes.data?.meta?.total ?? 0;
            const today = todayRes.data?.meta?.total ?? 0;
            const upcoming = upcomingRes.data?.meta?.total ?? 0;
            setSummaryStats({
                overdue,
                today,
                week: upcoming,
                open: overdue + today + upcoming,
            });
        } catch {
            setSummaryStats({ overdue: 0, today: 0, week: 0, open: 0 });
        } finally {
            setSummaryLoading(false);
        }
    }, [filterParams]);

    useEffect(() => {
        if (viewMode === 'table') {
            fetchTableSummary();
        }
    }, [viewMode, fetchTableSummary]);

    const handleWorkboardSummary = useCallback((stats) => {
        setSummaryStats(stats);
        setSummaryLoading(false);
    }, []);

    const fetchTasks = useCallback(async () => {
        if (!activeTab) return;
        setLoading(true);
        try {
            const tab = TABLE_TABS.find((t) => t.id === activeTab)?.api || 'ALL';
            const params = {
                page,
                limit,
                tab,
                ...filterParams,
            };
            const res = await api.get('/reports/manage-tasks', { params });
            setTasks(res.data.data || []);
            setTotal(res.data.meta?.total || 0);
        } catch {
            addToast('Failed to load tasks.', 'error');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, limit, filterParams, addToast]);

    useEffect(() => {
        if (viewMode === 'table') {
            fetchTasks();
        }
    }, [fetchTasks, viewMode]);

    const { socket } = useGlobalSync('task', (payload) => {
        if (viewMode !== 'table') return;
        if (payload.action === 'create') {
            setTasks((prev) => {
                if (prev.find((t) => t._id === payload.recordId)) return prev;
                return [payload.data, ...prev].slice(0, limit);
            });
            setTotal((p) => p + 1);
            fetchTableSummary();
        } else if (payload.action === 'update' || payload.action === 'assigned') {
            setTasks((prev) => prev.map((t) => (t._id === payload.recordId ? { ...t, ...payload.data } : t)));
            fetchTableSummary();
        } else if (payload.action === 'delete') {
            setTasks((prev) => prev.filter((t) => t._id !== payload.recordId));
            setTotal((p) => Math.max(0, p - 1));
            fetchTableSummary();
        }
    });

    useEffect(() => {
        if (!socket || viewMode !== 'table') return;
        const handleReconnect = () => fetchTasks();
        socket.on('connect', handleReconnect);
        return () => socket.off('connect', handleReconnect);
    }, [socket, fetchTasks, viewMode]);

    const openTask = useCallback(
        (task) => {
            setSelectedTaskId(task._id);
            if (location.pathname !== `/tasks/${task._id}`) {
                navigate(`/tasks/${task._id}`);
            }
        },
        [navigate, location.pathname]
    );

    const closeDrawer = useCallback(() => {
        setSelectedTaskId(null);
        const pathTaskId = location.pathname.match(/^\/tasks\/([a-f\d]{24})$/i)?.[1];
        if ((routeTaskId && MONGO_ID_RE.test(routeTaskId)) || pathTaskId) {
            navigate('/tasks/list', { replace: true });
        }
    }, [navigate, routeTaskId, location.pathname]);

    const handleTab = (id) => {
        setFilter('activeTab', id);
        setFilter('page', 1);
    };

    const handleExtendConfirm = async (taskId, data) => {
        try {
            await extendTask(taskId, data);
            addToast('Task extended!', 'success');
            if (viewMode === 'table') fetchTasks();
        } catch {
            addToast('Failed to extend task.', 'error');
            throw new Error();
        }
    };

    const runCloseTask = async (taskId) => {
        try {
            await closeTask(taskId);
            addToast('Task closed!', 'success');
            if (viewMode === 'table') fetchTasks();
        } catch {
            addToast('Failed to close task.', 'error');
        }
    };

    const runDeleteTask = async (taskId) => {
        try {
            await deleteTask(taskId);
            addToast('Task deleted.', 'success');
            if (viewMode === 'table') fetchTasks();
        } catch {
            addToast('Failed to delete task.', 'error');
        }
    };

    const handleCloseTask = (taskId) => {
        setConfirm({
            title: 'Complete task',
            message: 'Mark this task as complete?',
            confirmLabel: 'Complete',
            onConfirm: async () => {
                setConfirm(null);
                await runCloseTask(taskId);
            },
        });
    };

    const handleDeleteTask = (taskId) => {
        setConfirm({
            title: 'Delete task',
            message: 'Delete this task permanently? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
                setConfirm(null);
                await runDeleteTask(taskId);
            },
        });
    };

    const activeFilterChips = useMemo(() => {
        const chips = [];
        if (groupFilter) {
            const g = options.taskGroups.find((x) => x._id === groupFilter);
            chips.push({ key: 'group', label: `Group: ${g?.name || 'Selected'}`, clear: () => {
                setFilter('groupFilter', '');
                setHubSelectedGroupId(null);
                setHubGroupDetail(null);
            } });
        }
        if (assigneeFilter) {
            const u = options.users.find((x) => x._id === assigneeFilter);
            chips.push({ key: 'assignee', label: `Assignee: ${u?.name || 'Selected'}`, clear: () => setFilter('assigneeFilter', '') });
        }
        if (createdByFilter) {
            const u = options.users.find((x) => x._id === createdByFilter);
            chips.push({ key: 'creator', label: `Creator: ${u?.name || 'Selected'}`, clear: () => setFilter('createdByFilter', '') });
        }
        if (priorityFilter) {
            chips.push({ key: 'priority', label: `Priority: ${priorityFilter}`, clear: () => setFilter('priorityFilter', '') });
        }
        if (searchTerm) {
            chips.push({ key: 'search', label: `Search: "${searchTerm}"`, clear: () => setFilter('searchTerm', '') });
        }
        return chips;
    }, [groupFilter, assigneeFilter, createdByFilter, priorityFilter, searchTerm, options, setFilter]);

    const clearAllChips = () => {
        setFilter('searchTerm', '');
        setFilter('priorityFilter', '');
        setFilter('groupFilter', '');
        setFilter('assigneeFilter', '');
        setFilter('createdByFilter', '');
    };

    const totalPages = Math.ceil(total / limit) || 1;

    return (
        <div className={pageStyles.page}>
            <div className={pageStyles.toolbar}>
                <span className={pageStyles.title}>Task Hub</span>

                <ViewTabs
                    value={viewMode}
                    onChange={(id) => setFilter('viewMode', id)}
                    items={VIEW_MODES.map((vm) => ({
                        id: vm.id,
                        label: vm.label,
                        icon: vm.id === 'workboard' ? Columns3 : LayoutList,
                    }))}
                    variant="accent"
                />

                {viewMode === 'table' && (
                    <ViewTabs
                        value={activeTab}
                        onChange={handleTab}
                        items={TABLE_TABS.map((t) => ({
                            id: t.id,
                            label: t.label,
                            badge: t.id === 'all' ? total : undefined,
                        }))}
                    />
                )}

                <div className={pageStyles.toolbarSpacer}>
                    <button type="button" className={pageStyles.newTaskBtn} onClick={() => navigate('/tasks/create')}>
                        <Plus size={13} /> New task
                    </button>
                </div>
            </div>


            <TaskHubSummaryStrip stats={summaryStats} loading={viewMode === 'table' ? summaryLoading : false} />

            <HighlightedGroupsStrip
                groups={highlightedGroups}
                selectedGroupId={hubSelectedGroupId}
                loading={highlightedLoading}
                canManage={user?.role === 'admin'}
                onManage={() => navigate('/tasks/groups')}
                onSelect={(g) => {
                    const next = String(hubSelectedGroupId) === String(g._id) ? null : g._id;
                    setHubSelectedGroupId(next);
                    if (!next) {
                        setFilter('groupFilter', '');
                        setHubGroupDetail(null);
                    }
                }}
            />

            {hubSelectedGroupId && hubGroupDetail && (
                <SelectedGroupSummary
                    groupDetail={hubGroupDetail}
                    onClear={() => {
                        setHubSelectedGroupId(null);
                        setHubGroupDetail(null);
                        setFilter('groupFilter', '');
                    }}
                />
            )}

            <div className={pageStyles.filterPanel}>
                <div className={pageStyles.filterRow}>
                    <select
                        className={pageStyles.sel}
                        value={groupFilter}
                        onChange={(e) => {
                            const v = e.target.value;
                            setFilter('groupFilter', v);
                            setHubSelectedGroupId(v || null);
                            if (!v) setHubGroupDetail(null);
                        }}
                    >
                        <option value="">All Groups</option>
                        {options.taskGroups.map((g) => (
                            <option key={g._id} value={g._id}>
                                {g.name}
                            </option>
                        ))}
                    </select>

                    {user?.role === 'admin' && (
                        <select className={pageStyles.sel} value={assigneeFilter} onChange={(e) => setFilter('assigneeFilter', e.target.value)}>
                            <option value="">All Assignees</option>
                            {options.users.map((u) => (
                                <option key={u._id} value={u._id}>
                                    {u.name}
                                </option>
                            ))}
                        </select>
                    )}

                    {user?.role === 'admin' && (
                        <select className={pageStyles.sel} value={createdByFilter} onChange={(e) => setFilter('createdByFilter', e.target.value)}>
                            <option value="">All Creators</option>
                            {options.users.map((u) => (
                                <option key={u._id} value={u._id}>
                                    {u.name}
                                </option>
                            ))}
                        </select>
                    )}

                    <select className={pageStyles.sel} value={priorityFilter} onChange={(e) => setFilter('priorityFilter', e.target.value)}>
                        <option value="">All Priority</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                        <option value="CRITICAL">Critical</option>
                    </select>

                    {viewMode === 'table' && (
                        <>
                            <input
                                type="date"
                                className={pageStyles.inp}
                                value={dateFrom}
                                onChange={(e) => setFilter('dateFrom', e.target.value)}
                                title="From date"
                            />
                            <span className={pageStyles.dateSep}>–</span>
                            <input
                                type="date"
                                className={pageStyles.inp}
                                value={dateTo}
                                onChange={(e) => setFilter('dateTo', e.target.value)}
                                title="To date"
                            />
                        </>
                    )}

                    <div className={pageStyles.searchWrap}>
                        <Search size={11} className={pageStyles.searchIcon} />
                        <input
                            className={`${pageStyles.inp} ${pageStyles.searchInp}`}
                            placeholder="Search tasks…"
                            value={searchTerm}
                            onChange={(e) => setFilter('searchTerm', e.target.value)}
                        />
                    </div>

                    <button type="button" className={pageStyles.resetBtn} onClick={resetFilters} title="Reset all filters">
                        <RotateCcw size={11} /> Reset
                    </button>

                    {viewMode === 'table' && (
                        <select
                            className={`${pageStyles.sel} ${pageStyles.limitSel}`}
                            value={limit}
                            onChange={(e) => setFilter('limit', Number(e.target.value))}
                        >
                            <option value={15}>15 / page</option>
                            <option value={25}>25 / page</option>
                            <option value={50}>50 / page</option>
                        </select>
                    )}
                </div>

                <FilterChips chips={activeFilterChips} onClearAll={clearAllChips} />
            </div>

            {viewMode === 'workboard' ? (
                <WorkboardTaskView
                    searchTerm={searchTerm}
                    priorityFilter={priorityFilter}
                    groupFilter={groupFilter}
                    assigneeFilter={assigneeFilter}
                    onExtend={(task) => {
                        setSelectedTask(task);
                        setIsExtendModalOpen(true);
                    }}
                    onCloseTask={handleCloseTask}
                    onEdit={(task) => navigate(`/tasks/edit/${task._id}`)}
                    onDelete={handleDeleteTask}
                    onOpen={openTask}
                    onSummaryChange={handleWorkboardSummary}
                    refreshToken={workboardRefresh}
                />
            ) : (
                <>
                    <ManageTasksTable
                            tasks={tasks}
                            loading={loading}
                            onTaskClick={openTask}
                            onExtend={(task) => {
                                setSelectedTask(task);
                                setIsExtendModalOpen(true);
                            }}
                            onCloseTask={handleCloseTask}
                            onEdit={(task) => navigate(`/tasks/edit/${task._id}`)}
                            onDelete={handleDeleteTask}
                        />

                    {!loading && total > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>
                                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                            </span>
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setFilter('page', page - 1)}
                                style={{
                                    height: 26,
                                    width: 26,
                                    border: '1px solid #d1d5db',
                                    borderRadius: 5,
                                    background: '#fff',
                                    color: '#374151',
                                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: page <= 1 ? 0.4 : 1,
                                }}
                            >
                                <ChevronLeft size={13} />
                            </button>
                            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                                const pg = i + 1;
                                return (
                                    <button
                                        key={pg}
                                        type="button"
                                        onClick={() => setFilter('page', pg)}
                                        style={{
                                            height: 26,
                                            minWidth: 26,
                                            padding: '0 4px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: 5,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            background: page === pg ? '#0d9488' : '#fff',
                                            color: page === pg ? '#fff' : '#374151',
                                        }}
                                    >
                                        {pg}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                disabled={page >= totalPages}
                                onClick={() => setFilter('page', page + 1)}
                                style={{
                                    height: 26,
                                    width: 26,
                                    border: '1px solid #d1d5db',
                                    borderRadius: 5,
                                    background: '#fff',
                                    color: '#374151',
                                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: page >= totalPages ? 0.4 : 1,
                                }}
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

            <TaskUpdateDrawer
                taskId={selectedTaskId}
                isOpen={!!selectedTaskId}
                onClose={closeDrawer}
                onUpdate={() => {
                    if (viewMode === 'table') fetchTasks();
                    else setWorkboardRefresh((n) => n + 1);
                }}
            />

            <TaskHubConfirmDialog
                open={!!confirm}
                title={confirm?.title}
                message={confirm?.message}
                confirmLabel={confirm?.confirmLabel}
                danger={confirm?.danger}
                onConfirm={confirm?.onConfirm}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
};

export default ManageTasksPage;
