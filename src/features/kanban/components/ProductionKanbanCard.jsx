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

const subStyle = { color: '#64748b', fontSize: 11.5 };
const numberStyle = { fontWeight: 700, color: '#0d9488', lineHeight: 1.25 };

const PRIORITY_COLOR = {
    Low:    { bg: '#f1f5f9', color: '#475569' },
    Medium: { bg: '#dbeafe', color: '#1d4ed8' },
    High:   { bg: '#fef3c7', color: '#b45309' },
    Urgent: { bg: '#fee2e2', color: '#b91c1c' },
};

const priorityBadge = (priority) => {
    const c = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
    return {
        display: 'inline-block',
        fontSize: 10.5,
        padding: '1px 6px',
        borderRadius: 4,
        background: c.bg,
        color: c.color,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
    };
};

const dueStyle = (overdue) => ({
    marginTop: 6,
    fontSize: 11,
    color: overdue ? '#991b1b' : '#0369a1',
    background: overdue ? '#fee2e2' : '#e0f2fe',
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
});

const holdStyle = {
    marginTop: 6,
    fontSize: 11,
    color: '#9333ea',
    background: '#faf5ff',
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
};

function formatDate(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    } catch (_) { return ''; }
}

function isOverdue(plannedEnd, status) {
    if (!plannedEnd) return false;
    if (status === 'Completed' || status === 'Closed') return false;
    try {
        return new Date(plannedEnd).getTime() < Date.now();
    } catch (_) { return false; }
}

export default function ProductionKanbanCard({ wo, dragProps, onOpen, isPending }) {
    if (!wo) return null;
    const no = wo.woNumber || '(No #)';
    const product = wo.finishedProductName || '';
    const qty = wo.targetQty || 0;
    const priority = wo.priority || 'Medium';
    const onHold = !!(wo.wip && wo.wip.isOnHold);
    const holdReason = wo.wip && wo.wip.holdReason;
    const overdue = isOverdue(wo.plannedEnd, wo.status);

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(wo); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to On Hold / Released, or click to open'}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={numberStyle}>{no}</div>
                <span style={priorityBadge(priority)}>{priority}</span>
            </div>
            {product ? <div style={{ ...subStyle, marginTop: 2 }}>{product}</div> : null}
            <div style={{ ...subStyle, marginTop: 4 }}>
                Target qty: <span style={{ color: '#0f172a', fontWeight: 600 }}>{Number(qty).toLocaleString('en-IN')}</span>
            </div>
            {wo.plannedEnd ? (
                <div style={dueStyle(overdue)}>
                    {overdue ? 'Overdue: ' : 'Plan end: '}{formatDate(wo.plannedEnd)}
                </div>
            ) : null}
            {onHold && holdReason ? (
                <div style={holdStyle} title={holdReason}>
                    Hold: {String(holdReason).length > 38 ? String(holdReason).slice(0, 36) + '...' : holdReason}
                </div>
            ) : null}
        </div>
    );
}
