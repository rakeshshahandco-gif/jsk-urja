import React from 'react';

const cardStyle = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 13,
    color: '#0f172a',
};

const subStyle = { color: '#64748b', fontSize: 11.5 };
const numberStyle = { fontWeight: 700, color: '#ea580c', lineHeight: 1.25 };

const amountStyle = {
    marginTop: 4,
    color: '#16a34a',
    fontWeight: 600,
    fontSize: 12.5,
};

const metaStyle = {
    marginTop: 4,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
};

const tagStyle = {
    display: 'inline-block',
    fontSize: 10.5,
    padding: '1px 6px',
    borderRadius: 4,
    background: '#fff7ed',
    color: '#9a3412',
    border: '1px solid #fed7aa',
};

const sectionTagStyle = {
    ...tagStyle,
    background: '#eef2ff',
    color: '#3730a3',
    border: '1px solid #c7d2fe',
};

const paidTagStyle = {
    ...tagStyle,
    background: '#f0fdf4',
    color: '#166534',
    border: '1px solid #86efac',
};

function formatDate(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    } catch (_) { return ''; }
}

function uniqueSections(lineItems) {
    if (!Array.isArray(lineItems)) return [];
    const set = new Set();
    for (const li of lineItems) {
        const s = (li && li.section) ? String(li.section).trim() : '';
        if (s) set.add(s);
    }
    return Array.from(set);
}

export default function GstTdsKanbanCard({ challan, onOpen }) {
    if (!challan) return null;
    const no = challan.challanNo || '(no #)';
    const fy = challan.financialYear || '';
    const qtr = challan.primaryQuarter || '';
    const amt = challan.totalTdsAmount || challan.amountDeposited || 0;
    const liCount = Array.isArray(challan.lineItems) ? challan.lineItems.length : 0;
    const sections = uniqueSections(challan.lineItems).slice(0, 3);
    const paidAt = challan.paidAt;

    return (
        <div
            onClick={() => { if (typeof onOpen === 'function') onOpen(challan); }}
            style={cardStyle}
            title="Click to open TDS Compliance page"
        >
            <div style={numberStyle}>{no}</div>
            <div style={{ ...subStyle, marginTop: 2 }}>
                {formatDate(challan.challanDate) || '—'}{fy ? ` · FY ${fy}` : ''}{qtr ? ` · ${qtr}` : ''}
            </div>
            <div style={amountStyle}>
                Rs. {Number(amt || 0).toLocaleString('en-IN')}
                {liCount > 0 ? <span style={{ ...subStyle, marginLeft: 8 }}>{liCount} line{liCount === 1 ? '' : 's'}</span> : null}
            </div>
            {sections.length > 0 ? (
                <div style={metaStyle}>
                    {sections.map((s) => (
                        <span key={s} style={sectionTagStyle}>{s}</span>
                    ))}
                </div>
            ) : null}
            {paidAt ? (
                <div style={{ ...metaStyle }}>
                    <span style={paidTagStyle}>Paid {formatDate(paidAt)}</span>
                </div>
            ) : null}
        </div>
    );
}
