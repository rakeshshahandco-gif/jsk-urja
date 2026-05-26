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
const numberStyle = { fontWeight: 700, color: '#1e40af', lineHeight: 1.25 };

const amountStyle = {
    marginTop: 4,
    color: '#16a34a',
    fontWeight: 600,
    fontSize: 12.5,
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

function formatDate(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    } catch (_) { return ''; }
}

function isOverdue(deliveryDate, status) {
    if (!deliveryDate) return false;
    if (status === 'Dispatched' || status === 'Invoiced' || status === 'Closed' ||
        status === 'Completed' || status === 'Cancelled') return false;
    try {
        return new Date(deliveryDate).getTime() < Date.now();
    } catch (_) { return false; }
}

export default function DispatchKanbanCard({ order, dragProps, onOpen, isPending }) {
    if (!order) return null;
    const no = order.soNumber || '(No #)';
    const customer = order.customerName || '';
    const amount = order.roundedTotal || order.grandTotal || 0;
    const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
    const deliveryDate = order.deliveryDate || order.expectedDeliveryDate;
    const overdue = isOverdue(deliveryDate, order.status);

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(order); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to another column or click to open'}
        >
            <div style={numberStyle}>{no}</div>
            {customer ? <div style={{ ...subStyle, marginTop: 2 }}>{customer}</div> : null}
            <div style={amountStyle}>
                Rs. {Number(amount || 0).toLocaleString('en-IN')}
                {itemsCount > 0 ? <span style={{ ...subStyle, marginLeft: 8 }}>{itemsCount} item{itemsCount === 1 ? '' : 's'}</span> : null}
            </div>
            {deliveryDate ? (
                <div style={dueStyle(overdue)}>
                    {overdue ? 'Overdue: ' : 'Delivery: '}{formatDate(deliveryDate)}
                </div>
            ) : (
                order.soDate ? <div style={{ ...subStyle, marginTop: 4 }}>SO date: {formatDate(order.soDate)}</div> : null
            )}
        </div>
    );
}
