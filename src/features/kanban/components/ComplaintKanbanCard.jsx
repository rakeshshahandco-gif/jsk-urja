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

const PRIORITY_COLOR = {
    Low:    { bg: '#f1f5f9', fg: '#475569' },
    Medium: { bg: '#dbeafe', fg: '#1e40af' },
    High:   { bg: '#fef3c7', fg: '#92400e' },
    Urgent: { bg: '#fee2e2', fg: '#991b1b' },
};

function priorityBadgeStyle(priority) {
    const palette = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
    return {
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 10,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        marginLeft: 6,
        fontWeight: 600,
    };
}

const subStyle = { color: '#64748b', fontSize: 11.5, marginTop: 2 };

const ageStyle = (days) => {
    let bg = '#e0f2fe', fg = '#0369a1';
    if (days > 14) { bg = '#fee2e2'; fg = '#991b1b'; }
    else if (days > 7) { bg = '#fef3c7'; fg = '#92400e'; }
    return {
        marginTop: 6,
        fontSize: 11,
        color: fg,
        background: bg,
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 4,
    };
};

function daysSince(date) {
    if (!date) return null;
    try {
        const d = new Date(date).getTime();
        if (isNaN(d)) return null;
        return Math.floor((Date.now() - d) / 86400000);
    } catch (_) { return null; }
}

export default function ComplaintKanbanCard({ complaint, dragProps, onOpen, isPending }) {
    if (!complaint) return null;
    const no = complaint.complaintNo || '(No #)';
    const customer = complaint.customerName || '';
    const priority = complaint.priority || 'Medium';
    const reason = complaint.complaintReason || '';
    const age = daysSince(complaint.date);
    const items = Array.isArray(complaint.items) ? complaint.items : [];
    const firstItem = items[0]?.itemName || items[0]?.name || '';

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(complaint); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to another column or click to open'}
        >
            <div style={{ fontWeight: 600, lineHeight: 1.25 }}>
                {no}
                <span style={priorityBadgeStyle(priority)}>{priority}</span>
            </div>
            {customer ? <div style={subStyle}>{customer}</div> : null}
            {firstItem ? (
                <div style={{ ...subStyle, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {firstItem}{items.length > 1 ? ` +${items.length - 1}` : ''}
                </div>
            ) : null}
            {reason ? (
                <div style={{ ...subStyle, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {reason}
                </div>
            ) : null}
            {age !== null ? <div style={ageStyle(age)}>{age}d old</div> : null}
        </div>
    );
}
