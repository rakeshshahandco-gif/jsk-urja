import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, CheckCircle2, MoreHorizontal, Pencil, Trash2, Eye, Clock3 } from 'lucide-react';

// Priority dot colors
const priorityDot = { LOW: '#eab308', MEDIUM: '#f97316', HIGH: '#ef4444', URGENT: '#dc2626', CRITICAL: '#991b1b' };
const priorityBg = { LOW: '#fefce8', MEDIUM: '#fff7ed', HIGH: '#fef2f2', URGENT: '#fef2f2', CRITICAL: '#fef2f2' };
const priorityTxt = { LOW: '#854d0e', MEDIUM: '#9a3412', HIGH: '#991b1b', URGENT: '#7f1d1d', CRITICAL: '#450a0a' };
const statusBg = { OPEN: '#eff6ff', IN_PROGRESS: '#eef2ff', COMPLETED: '#f0fdf4', OVERDUE: '#fef2f2', CANCELLED: '#f9fafb' };
const statusTxt = { OPEN: '#1d4ed8', IN_PROGRESS: '#4338ca', COMPLETED: '#15803d', OVERDUE: '#b91c1c', CANCELLED: '#6b7280' };

// Tooltip wrapper
const Tip = ({ children, label }) => {
    const [v, setV] = useState(false);
    return (
        <div style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={() => setV(true)} onMouseLeave={() => setV(false)}>
            {children}
            {v && <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', zIndex: 99, pointerEvents: 'none' }}>{label}</div>}
        </div>
    );
};

// Assignees cell
const Assignees = ({ list }) => {
    const [v, setV] = useState(false);
    if (!list?.length) return <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>—</span>;
    const first = list[0]?.name || '?';
    const extra = list.length - 1;
    return (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'default' }}
            onMouseEnter={() => setV(true)} onMouseLeave={() => setV(false)}>
            <span style={{ fontSize: 11, color: '#374151' }}>{first}</span>
            {extra > 0 && <span style={{ fontSize: 9, background: '#f1f5f9', color: '#6b7280', padding: '0 4px', borderRadius: 8, fontWeight: 700, border: '1px solid #e2e8f0' }}>+{extra}</span>}
            {v && extra > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', color: '#1e293b', fontSize: 10, borderRadius: 6, padding: '4px 8px', zIndex: 50, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
                    {list.map((a, i) => <div key={i}>{a?.name}</div>)}
                </div>
            )}
        </div>
    );
};

// ⋮ dropdown menu
const Menu = ({ task, onEdit, onDelete, onViewDetails }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    const btn = (onClick, icon, label, danger) => (
        <button onClick={() => { onClick(); setOpen(false); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: danger ? '#ef4444' : '#374151', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = danger ? '#fef2f2' : '#f8f9fa'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
            {icon} {label}
        </button>
    );
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} title="More"
                style={{ width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8f9fa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <MoreHorizontal size={13} />
            </button>
            {open && (
                <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 130 }}>
                    {btn(() => onViewDetails(task), <Eye size={12} />, 'View')}
                    {btn(() => onEdit(task), <Pencil size={12} />, 'Edit')}
                    <div style={{ borderTop: '1px solid #f3f4f6', margin: '2px 0' }} />
                    {btn(() => onDelete(task._id), <Trash2 size={12} />, 'Delete', true)}
                </div>
            )}
        </div>
    );
};

// Icon action button
const IconBtn = ({ onClick, title, color, bg, children }) => (
    <Tip label={title}>
        <button onClick={onClick}
            style={{ width: 24, height: 24, border: `1px solid ${color}20`, borderRadius: 4, background: bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            {children}
        </button>
    </Tip>
);

export const ManageTasksTable = ({ tasks, loading, onExtend, onCloseTask, onEdit, onDelete, onViewDetails }) => {
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b7280', fontSize: 12, gap: 8 }}>
                <div style={{ width: 18, height: 18, border: '2px solid #e5e7eb', borderTopColor: '#0d9488', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Loading tasks...
            </div>
        );
    }

    if (!tasks?.length) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: '#9ca3af', fontSize: 12 }}>
                No tasks found matching the selected filters.
            </div>
        );
    }

    const th = { padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap' };
    const td = { padding: '6px 10px', fontSize: 11, color: '#374151', verticalAlign: 'middle', borderBottom: '1px solid #f3f4f6' };

    return (
        <div style={{ paddingBottom: '80px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                    <tr>
                        <th style={th}>#</th>
                        <th style={th}>Task Name</th>
                        <th style={th}>Group</th>
                        <th style={th}>Due</th>
                        <th style={th}>Assign</th>
                        <th style={th}>Priority</th>
                        <th style={th}>Status</th>
                        <th style={{ ...th, textAlign: 'center' }}>⚙</th>
                    </tr>
                </thead>
                <tbody>
                    {(() => {
                        let lastCategory = null;
                        const now = new Date();
                        now.setHours(0, 0, 0, 0);
                        const endOfToday = new Date(now);
                        endOfToday.setHours(23, 59, 59, 999);

                        return tasks.map((task, idx) => {
                            const due = task.dueDate ? new Date(task.dueDate) : null;
                            const done = task.status === 'COMPLETED' || task.status === 'CANCELLED';

                            let category = 'UPCOMING';
                            if (done) category = 'CLOSED';
                            else if (!due) category = 'NO_DATE';
                            else if (due < now) category = 'OVERDUE';
                            else if (due <= endOfToday) category = 'TODAY';

                            let header = null;
                            if (category !== lastCategory) {
                                lastCategory = category;
                                const labels = {
                                    OVERDUE: { text: '🚨 Overdue Tasks', color: '#dc2626', bg: '#fef2f2' },
                                    TODAY: { text: '📅 Today\'s Tasks', color: '#16a34a', bg: '#f0fdf4' },
                                    UPCOMING: { text: '⏭ Upcoming Tasks', color: '#2563eb', bg: '#eff6ff' },
                                    CLOSED: { text: '✅ Closed / Completed Tasks', color: '#6b7280', bg: '#f9fafb' },
                                    NO_DATE: { text: '📋 Tasks with No Due Date', color: '#94a3b8', bg: '#f8f9fa' }
                                };
                                const head = labels[category];
                                if (head) {
                                    header = (
                                        <tr key={`header-${category}`}>
                                            <td colSpan="8" style={{ padding: '8px 12px', background: head.bg, borderBottom: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: head.color, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {head.text}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }
                            }

                            const overdue = category === 'OVERDUE';
                            const p = task.priority || 'MEDIUM';
                            const st = task.status || 'OPEN';

                            return (
                                <React.Fragment key={task._id}>
                                    {header}
                                    <tr
                                        style={{ background: '#fff' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                    >
                                        <td style={{ ...td, color: '#9ca3af', textAlign: 'center', fontSize: 10 }}>{idx + 1}</td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={task.title}>
                                                {task.title}
                                            </div>
                                            {task.description && (
                                                <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.description}>
                                                    {task.description}
                                                </div>
                                            )}
                                        </td>
                                        <td style={td}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%', color: task.groupId?.name ? '#000000' : '#94a3b8', fontStyle: task.groupId?.name ? 'normal' : 'italic', fontWeight: task.groupId?.name ? 500 : 400 }} title={task.groupId?.name}>
                                                {task.groupId?.name || '—'}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            {due ? (
                                                <div style={{ lineHeight: 1.3 }}>
                                                    <div style={{ fontWeight: 600, color: overdue ? '#dc2626' : '#1e293b', whiteSpace: 'nowrap' }}>{format(due, 'dd/MM/yy')}</div>
                                                    <div style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}><Clock3 size={9} />{format(due, 'HH:mm')}</div>
                                                </div>
                                            ) : <span style={{ color: '#9ca3af' }}>—</span>}
                                        </td>
                                        <td style={td}><Assignees list={task.assigneeIds} /></td>
                                        <td style={td}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: priorityBg[p], color: priorityTxt[p] }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityDot[p], flexShrink: 0 }} />
                                                {p}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: statusBg[st], color: statusTxt[st] }}>
                                                {st.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                {!done ? (
                                                    <>
                                                        <IconBtn onClick={() => onCloseTask(task._id)} title="Close task" color="#16a34a" bg="#f0fdf4">
                                                            <Check size={12} />
                                                        </IconBtn>
                                                        <IconBtn onClick={() => onExtend(task)} title="Extend due date" color="#2563eb" bg="#eff6ff">
                                                            <Clock3 size={12} />
                                                        </IconBtn>
                                                    </>
                                                ) : (
                                                    <CheckCircle2 size={15} style={{ color: '#22c55e' }} />
                                                )}
                                                <Menu task={task} onEdit={onEdit} onDelete={onDelete} onViewDetails={onViewDetails} />
                                            </div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        });
                    })()}
                </tbody>
            </table>
        </div>
    );
};
