import React from 'react';

const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    cursor: 'grab',
    userSelect: 'none',
    fontSize: 13,
    color: '#0f172a',
};

const pendingStyle = { ...cardStyle, opacity: 0.6, cursor: 'wait' };
const titleStyle = { fontWeight: 600, marginBottom: 4, lineHeight: 1.25 };
const subStyle = { color: '#64748b', fontSize: 11.5 };

const PRIORITY_COLOR = {
    LOW:      { bg: '#f1f5f9', fg: '#475569' },
    MEDIUM:   { bg: '#dbeafe', fg: '#1e40af' },
    HIGH:     { bg: '#fef3c7', fg: '#92400e' },
    URGENT:   { bg: '#fee2e2', fg: '#991b1b' },
    CRITICAL: { bg: '#fecaca', fg: '#7f1d1d' },
};

function priorityBadge(priority) {
    const p = String(priority || '').toUpperCase();
    const palette = PRIORITY_COLOR[p] || PRIORITY_COLOR.MEDIUM;
    return {
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 10,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        marginLeft: 6,
        textTransform: 'capitalize',
        fontWeight: 600,
    };
}

const dueStyle = (overdue) => ({
    marginTop: 6,
    fontSize: 11,
    color: overdue ? '#991b1b' : '#0369a1',
    background: overdue ? '#fee2e2' : '#e0f2fe',
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
});

const initialsStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#1e3a8a',
    color: 'white',
    fontSize: 10,
    fontWeight: 600,
};

function initialsFrom(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    } catch (_) { return ''; }
}

function isOverdue(dueDate, status) {
    if (!dueDate) return false;
    if (status === 'COMPLETED' || status === 'CANCELLED') return false;
    try {
        return new Date(dueDate).getTime() < Date.now();
    } catch (_) { return false; }
}

export default function TaskKanbanCard({ task, dragProps, onOpen, isPending }) {
    if (!task) return null;
    const title = task.title || '(Untitled task)';
    const priority = task.priority || 'MEDIUM';
    const dueDate = task.dueDate;
    const overdue = isOverdue(dueDate, task.status);

    const assignees = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
    const firstAssignee = assignees[0];
    const firstName = firstAssignee && (firstAssignee.name || firstAssignee.fullName || firstAssignee.username || '');

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(task); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to another column or click to open'}
        >
            <div style={titleStyle}>
                {title}
                <span style={priorityBadge(priority)}>{priority.toLowerCase()}</span>
            </div>
            {task.description ? (
                <div style={{ ...subStyle, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {task.description}
                </div>
            ) : null}
            {dueDate ? (
                <div style={dueStyle(overdue)}>
                    {overdue ? 'Overdue: ' : 'Due: '}{formatDate(dueDate)}
                </div>
            ) : null}
            {firstName ? (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={initialsStyle}>{initialsFrom(firstName)}</span>
                    <span style={subStyle}>
                        {firstName}{assignees.length > 1 ? ` +${assignees.length - 1}` : ''}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
