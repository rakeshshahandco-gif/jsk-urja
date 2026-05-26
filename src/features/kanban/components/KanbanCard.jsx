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
    transition: 'box-shadow 120ms ease, transform 120ms ease',
};

const pendingStyle = {
    ...cardStyle,
    opacity: 0.6,
    cursor: 'wait',
};

const titleStyle = { fontWeight: 600, marginBottom: 4, lineHeight: 1.25 };
const subStyle = { color: '#64748b', fontSize: 11.5 };
const badgeStyle = {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 10,
    background: '#f1f5f9',
    color: '#475569',
    fontSize: 10.5,
    marginLeft: 6,
    textTransform: 'capitalize',
};

const followupStyle = {
    marginTop: 6,
    fontSize: 11,
    color: '#0369a1',
    background: '#e0f2fe',
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
};

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

export default function KanbanCard({ lead, dragProps, onOpen, isPending }) {
    if (!lead) return null;
    const name = lead.leadName || lead.customerName || '(Untitled lead)';
    const mobile = lead.mobileNumber || lead.customerMobile || lead.whatsapp?.mobileNumber || '';
    const source = lead.source || '';
    const followUp = lead.nextFollowUpDate;
    const assigneeName = (lead.assignedTo && (lead.assignedTo.name || lead.assignedTo.fullName)) || '';

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(lead); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to another column or click to open'}
        >
            <div style={titleStyle}>
                {name}
                {source ? <span style={badgeStyle}>{source}</span> : null}
            </div>
            {mobile ? <div style={subStyle}>{mobile}</div> : null}
            {followUp ? (
                <div style={followupStyle}>Follow-up: {formatDate(followUp)}</div>
            ) : null}
            {assigneeName ? (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={initialsStyle}>{initialsFrom(assigneeName)}</span>
                    <span style={subStyle}>{assigneeName}</span>
                </div>
            ) : null}
        </div>
    );
}
