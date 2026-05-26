import React from 'react';

const STAT_CARDS = [
    { key: 'overdue', label: 'Overdue', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { key: 'today', label: 'Due today', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
    { key: 'week', label: 'This week', color: '#92400e', bg: '#fefce8', border: '#fde68a' },
    { key: 'open', label: 'My open', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
];

export const TaskHubSummaryStrip = ({ stats, loading }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        {STAT_CARDS.map((card) => (
            <div
                key={card.key}
                style={{
                    background: card.bg,
                    border: `1px solid ${card.border}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
            >
                <div style={{ fontSize: 10, fontWeight: 700, color: card.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {card.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: card.color, marginTop: 2, lineHeight: 1.1 }}>
                    {loading ? '—' : (stats?.[card.key] ?? 0)}
                </div>
            </div>
        ))}
    </div>
);
