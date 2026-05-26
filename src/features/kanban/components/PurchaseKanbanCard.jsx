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
const numberStyle = { fontWeight: 700, color: '#7c3aed', lineHeight: 1.25 };

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

function isOverdue(expectedDate, status) {
    if (!expectedDate) return false;
    if (status === 'Fully Received' || status === 'Completed' || status === 'Cancelled') return false;
    try {
        return new Date(expectedDate).getTime() < Date.now();
    } catch (_) { return false; }
}

export default function PurchaseKanbanCard({ order, dragProps, onOpen, isPending }) {
    if (!order) return null;
    const no = order.poNumber || '(No #)';
    const supplier = order.supplierName || '';
    const amount = order.roundedTotal || order.grandTotal || 0;
    const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
    const expected = order.expectedDeliveryDate || order.expectedDate || order.deliveryDate;
    const overdue = isOverdue(expected, order.status);

    return (
        <div
            {...(dragProps || {})}
            onClick={() => { if (!isPending && typeof onOpen === 'function') onOpen(order); }}
            style={isPending ? pendingStyle : cardStyle}
            title={isPending ? 'Saving...' : 'Drag to another column or click to open'}
        >
            <div style={numberStyle}>{no}</div>
            {supplier ? <div style={{ ...subStyle, marginTop: 2 }}>{supplier}</div> : null}
            <div style={amountStyle}>
                Rs. {Number(amount || 0).toLocaleString('en-IN')}
                {itemsCount > 0 ? <span style={{ ...subStyle, marginLeft: 8 }}>{itemsCount} item{itemsCount === 1 ? '' : 's'}</span> : null}
            </div>
            {expected ? (
                <div style={dueStyle(overdue)}>
                    {overdue ? 'Overdue: ' : 'Expected: '}{formatDate(expected)}
                </div>
            ) : (
                order.poDate ? <div style={{ ...subStyle, marginTop: 4 }}>PO date: {formatDate(order.poDate)}</div> : null
            )}
        </div>
    );
}
