import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { extendTask, closeTask, deleteTask } from '@/services/taskApi';
import { ExtendTaskModal } from '@/features/reports/components/ExtendTaskModal';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, Clock, CalendarDays, CalendarRange,
    ChevronDown, ChevronUp, Plus, CheckCircle2, Pencil, XCircle, Clock3, Eye,
    Loader2, Inbox
} from 'lucide-react';
import { format, parseISO, startOfDay, isToday, isPast, addDays, isBefore } from 'date-fns';

// ──────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────────────────
const PRIORITY_ORDER = { CRITICAL: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };

const PRIORITY_BADGE = {
    CRITICAL: { bg: '#fef2f2', color: '#991b1b' },
    URGENT:   { bg: '#fef2f2', color: '#b91c1c' },
    HIGH:     { bg: '#fff7ed', color: '#c2410c' },
    MEDIUM:   { bg: '#fefce8', color: '#92400e' },
    LOW:      { bg: '#f0fdf4', color: '#15803d' },
};

const STATUS_BADGE = {
    OPEN:        { bg: '#eff6ff', color: '#1d4ed8', label: 'Open' },
    IN_PROGRESS: { bg: '#eef2ff', color: '#4338ca', label: 'In Progress' },
    COMPLETED:   { bg: '#f0fdf4', color: '#15803d', label: 'Completed' },
    OVERDUE:     { bg: '#fff1f2', color: '#be123c', label: 'Overdue' },
    CANCELLED:   { bg: '#f9fafb', color: '#6b7280', label: 'Cancelled' },
};

const SECTION_CONFIG = [
    { key: 'overdue', label: 'OVERDUE',                    emoji: '🔴', headerBg: '#fee2e2', headerText: '#b91c1c', border: '#fca5a5', icon: AlertTriangle, emptyMsg: '✅ No overdue tasks. Keep it up!' },
    { key: 'today',   label: 'TODAY',                      emoji: '🟠', headerBg: '#ffedd5', headerText: '#c2410c', border: '#fdba74', icon: Clock,         emptyMsg: '📭 No tasks due today.' },
    { key: 'week',    label: 'UPCOMING (Within 7 Days)',   emoji: '🟡', headerBg: '#fef9c3', headerText: '#92400e', border: '#fde047', icon: CalendarDays,  emptyMsg: '📅 No tasks in the next 7 days.' },
    { key: 'future',  label: 'UPCOMING (Above 7 Days)',    emoji: '🔵', headerBg: '#dbeafe', headerText: '#1d4ed8', border: '#93c5fd', icon: CalendarRange, emptyMsg: '📆 No tasks scheduled far ahead.' },
];

const SHOW_MORE_DEFAULT = 10;

const sortTasks = (tasks) =>
    [...tasks].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99;
        const pb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        const da = a.dueDate ? new Date(a.dueDate) : new Date('9999-01-01');
        const db = b.dueDate ? new Date(b.dueDate) : new Date('9999-01-01');
        return da - db;
    });

const groupTasks = (tasks) => {
    const today = startOfDay(new Date());
    const in7Days = addDays(today, 7);
    const groups = { overdue: [], today: [], week: [], future: [] };
    tasks.forEach(t => {
        if (!t.dueDate) { groups.future.push(t); return; }
        const due = startOfDay(parseISO(t.dueDate));
        if (isToday(due))                    groups.today.push(t);
        else if (isPast(due))                groups.overdue.push(t);
        else if (isBefore(due, in7Days) || due.getTime() === in7Days.getTime()) groups.week.push(t);
        else                                 groups.future.push(t);
    });
    Object.keys(groups).forEach(k => { groups[k] = sortTasks(groups[k]); });
    return groups;
};

// ──────────────────────────────────────────────────────────────────────────────
// Single compact row
// ──────────────────────────────────────────────────────────────────────────────
const TaskRow = ({ task, index, onExtend, onCloseTask, onEdit, onDelete, onViewDetails, rowBg }) => {
    const pb = PRIORITY_BADGE[task.priority] || { bg: '#f1f5f9', color: '#475569' };
    const sb = STATUS_BADGE[task.status] || STATUS_BADGE.OPEN;
    
    // Fix field names
    const assignees = (task.assigneeIds || []).map(a => a?.name || '?').join(', ') || '—';
    const due = task.dueDate ? parseISO(task.dueDate) : null;
    const dueDate = due ? format(due, 'dd/MM/yy') : '—';
    const dueTime = due ? format(due, 'HH:mm') : '';

    return (
        <tr
            style={{ background: rowBg, borderBottom: '1px solid #f1f5f9', fontSize: 11 }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = rowBg}
        >
            {/* # */}
            <td style={{ ...td, color: '#9ca3af', textAlign: 'center', fontSize: 10 }}>{index + 1}</td>

            {/* Task Name + Description */}
            <td style={{ ...td, padding: '6px 8px' }}>
                <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }} title={task.title}>
                    {task.title || '—'}
                </div>
                {task.description && (
                    <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }} title={task.description}>
                        {task.description}
                    </div>
                )}
            </td>

            {/* Group */}
            <td style={td}>
                <span style={{ 
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%',
                    color: task.groupId?.name ? '#374151' : '#94a3b8', 
                    fontStyle: task.groupId?.name ? 'normal' : 'italic',
                    fontWeight: task.groupId?.name ? 500 : 400 
                }}>
                    {task.groupId?.name || '—'}
                </span>
            </td>

            {/* Due Date + Time */}
            <td style={td}>
                {due ? (
                    <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 600, color: isPast(startOfDay(due)) && task.status !== 'COMPLETED' ? '#dc2626' : '#1e293b', whiteSpace: 'nowrap' }}>{dueDate}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Clock3 size={9} />{dueTime}
                        </div>
                    </div>
                ) : <span style={{ color: '#9ca3af' }}>—</span>}
            </td>

            {/* Assign */}
            <td style={{ ...td, maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#374151' }}>
                {assignees}
            </td>

            {/* Priority */}
            <td style={td}>
                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: pb.bg, color: pb.color, textTransform: 'uppercase', whiteSpace: 'nowrap', border: `1px solid ${pb.color}33` }}>
                    {task.priority || 'LOW'}
                </span>
            </td>

            {/* Status */}
            <td style={td}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: sb.bg, color: sb.color, whiteSpace: 'nowrap' }}>
                    {sb.label}
                </span>
            </td>

            {/* Actions */}
            <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                    <ActionBtn onClick={() => onViewDetails(task)} title="Open" clr="#1d4ed8" bg="#eff6ff"><Eye size={11} /></ActionBtn>
                    <ActionBtn onClick={() => onEdit(task)} title="Edit" clr="#15803d" bg="#f0fdf4"><Pencil size={11} /></ActionBtn>
                    <ActionBtn onClick={() => onExtend(task)} title="Extend" clr="#2563eb" bg="#eff6ff"><Clock3 size={11} /></ActionBtn>
                    {task.status !== 'COMPLETED' && (
                        <ActionBtn onClick={() => onCloseTask(task._id)} title="Complete" clr="#16a34a" bg="#f0fdf4">
                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>✅</span>
                        </ActionBtn>
                    )}
                    <ActionBtn onClick={() => onDelete(task._id)} title="Delete" clr="#be123c" bg="#fef2f2"><XCircle size={11} /></ActionBtn>
                </div>
            </td>
        </tr>
    );
};

const td = { padding: '4px 8px', verticalAlign: 'middle', color: '#374151', borderBottom: '1px solid #f1f5f9' };

const ActionBtn = ({ onClick, title, clr, bg, children }) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, border: `1px solid ${clr}33`, background: bg || `${clr}11`,
            color: clr, cursor: 'pointer', padding: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${clr}22`; }}
        onMouseLeave={e => { e.currentTarget.style.background = bg || `${clr}11`; }}
    >
        {children}
    </button>
);

// ──────────────────────────────────────────────────────────────────────────────
// Section Header Row
// ──────────────────────────────────────────────────────────────────────────────
const SectionHeader = ({ config, count, collapsed, onToggle }) => {
    const Icon = config.icon;
    return (
        <tr 
            onClick={onToggle}
            style={{ 
                background: config.headerBg, 
                cursor: 'pointer',
                userSelect: 'none',
                borderBottom: `1px solid ${config.border}`
            }}
        >
            <td colSpan="8" style={{ padding: '4px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon size={11} color={config.headerText} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: config.headerText, letterSpacing: '0.05em', flex: 1 }}>
                        {config.emoji} {config.label}
                    </span>
                    <span style={{ background: `${config.headerText}22`, color: config.headerText, fontSize: 9.5, fontWeight: 800, padding: '0px 6px', borderRadius: 10 }}>
                        {count}
                    </span>
                    <span style={{ color: config.headerText }}>
                        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </span>
                </div>
            </td>
        </tr>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// Main exported component
// ──────────────────────────────────────────────────────────────────────────────
const PriorityTaskView = ({ searchTerm, priorityFilter, groupFilter, assigneeFilter }) => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [loading, setLoading]     = useState(true);
    const [groups, setGroups]       = useState({ overdue: [], today: [], week: [], future: [] });
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [selectedTask, setSelectedTask]           = useState(null);
    
    // Manage collapsed states for each section
    const [collapsedStates, setCollapsedStates] = useState({
        overdue: false,
        today: false,
        week: false,
        future: false
    });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                tab: 'ALL', limit: 500, page: 1,
                search:     searchTerm    || undefined,
                priority:   priorityFilter || undefined,
                groupId:    groupFilter   || undefined,
                assigneeId: assigneeFilter || undefined,
            };
            const res = await api.get('/reports/manage-tasks', { params });
            const all = (res.data.data || []).filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
            setGroups(groupTasks(all));
        } catch {
            addToast('Failed to load tasks for priority view.', 'error');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, priorityFilter, groupFilter, assigneeFilter]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    
    useGlobalSync('task', (payload) => {
        if (payload.action === 'create' || payload.action === 'delete') {
            fetchAll();
        } else if (payload.action === 'update') {
            const isCompleted = payload.data?.status === 'COMPLETED' || payload.data?.status === 'CANCELLED';
            // If it was completed, or if its group-affecting fields changed (dueDate), re-fetch
            const groupFieldsChanged = payload.changedFields?.some(f => ['dueDate', 'priority', 'groupId', 'assigneeIds'].includes(f));
            if (isCompleted || groupFieldsChanged) {
                fetchAll();
            } else {
                // Minor update (title/desc), just patch locally if it exists in any group
                setGroups(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(k => {
                        next[k] = next[k].map(t => t._id === payload.recordId ? { ...t, ...payload.data } : t);
                    });
                    return next;
                });
            }
        }
    });

    const handleExtendConfirm = async (taskId, data) => {
        try { await extendTask(taskId, data); addToast('Task extended!', 'success'); fetchAll(); }
        catch { addToast('Failed to extend task.', 'error'); throw new Error(); }
    };

    const handleClose = async (taskId) => {
        if (!window.confirm('Mark this task as complete?')) return;
        try { await closeTask(taskId); addToast('Task completed!', 'success'); fetchAll(); }
        catch { addToast('Failed.', 'error'); }
    };

    const handleDelete = async (taskId) => {
        if (!window.confirm('Delete this task permanently?')) return;
        try { await deleteTask(taskId); addToast('Task deleted.', 'success'); fetchAll(); }
        catch { addToast('Failed.', 'error'); }
    };

    const toggleSection = (key) => {
        setCollapsedStates(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const total = Object.values(groups).reduce((s, a) => s + a.length, 0);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12, color: '#6b7280' }}>
                <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 12 }}>Loading priority view…</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Summary bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', alignItems: 'center', marginBottom: 8 }}>
                {SECTION_CONFIG.map(cfg => (
                    <div key={cfg.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.headerText, display: 'inline-block' }} />
                        <span style={{ color: '#6b7280' }}>{cfg.label}:</span>
                        <strong style={{ color: cfg.headerText }}>{groups[cfg.key].length}</strong>
                    </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 10.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Inbox size={11} /> {total} pending
                </div>
            </div>

            {/* Single Unified Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: 30 }} />     {/* # */}
                            <col style={{ width: '28%' }} />  {/* Task Name */}
                            <col style={{ width: '11%' }} />  {/* Group */}
                            <col style={{ width: '10%' }} />  {/* Due */}
                            <col style={{ width: '10%' }} />  {/* Assignee */}
                            <col style={{ width: '8%' }} />   {/* Priority */}
                            <col style={{ width: '9%' }} />   {/* Status */}
                            <col style={{ width: 100 }} />     {/* Actions */}
                        </colgroup>
                        <thead>
                            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                {[
                                    { label: '#', align: 'center' },
                                    { label: 'Task Name' },
                                    { label: 'Group' },
                                    { label: 'Due' },
                                    { label: 'Assign' },
                                    { label: 'Priority' },
                                    { label: 'Status' },
                                    { label: '⚙', align: 'center' }
                                ].map(h => (
                                    <th key={h.label} style={{ 
                                        padding: '5px 10px', 
                                        textAlign: h.align || 'left', 
                                        fontSize: 10, 
                                        fontWeight: 700, 
                                        color: '#6b7280', 
                                        textTransform: 'uppercase', 
                                        letterSpacing: '0.04em',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {SECTION_CONFIG.map(cfg => {
                                const tasks = groups[cfg.key];
                                const isCollapsed = collapsedStates[cfg.key];
                                
                                return (
                                    <React.Fragment key={cfg.key}>
                                        <SectionHeader 
                                            config={cfg} 
                                            count={tasks.length} 
                                            collapsed={isCollapsed}
                                            onToggle={() => toggleSection(cfg.key)}
                                        />
                                        {!isCollapsed && (
                                            tasks.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" style={{ background: '#fafafa', padding: '10px 18px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                                                        {cfg.emptyMsg}
                                                    </td>
                                                </tr>
                                            ) : (
                                                tasks.map((t, i) => (
                                                    <TaskRow
                                                        key={t._id}
                                                        task={t}
                                                        index={i}
                                                        rowBg={i % 2 === 0 ? '#fff' : '#fafafa'}
                                                        onExtend={() => { setSelectedTask(t); setIsExtendModalOpen(true); }}
                                                        onCloseTask={handleClose}
                                                        onEdit={task => navigate(`/tasks/edit/${task._id}`)}
                                                        onDelete={handleDelete}
                                                        onViewDetails={task => navigate(`/tasks/${task._id}`)}
                                                    />
                                                ))
                                            )
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <ExtendTaskModal
                task={selectedTask}
                isOpen={isExtendModalOpen}
                onClose={() => setIsExtendModalOpen(false)}
                onConfirm={handleExtendConfirm}
            />
        </div>
    );
};

export default PriorityTaskView;
