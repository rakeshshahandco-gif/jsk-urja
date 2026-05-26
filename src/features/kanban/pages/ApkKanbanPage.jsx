import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';

// Tile metadata for each module Kanban. Order matches the natural workflow:
// inquiry -> tasks -> service feedback -> outbound dispatch -> procurement ->
// production -> compliance. Each tile is gated by its own feature flag and only
// appears if the company has explicitly enabled that board.
const TILES = [
    {
        flag: 'workflow.salesInquiryKanbanEnabled',
        title: 'Sales Inquiry',
        subtitle: 'Lead pipeline',
        path: '/crm/kanban/sales-inquiry',
        accent: '#3b82f6',
        bg: '#eff6ff',
    },
    {
        flag: 'workflow.taskKanbanEnabled',
        title: 'Tasks',
        subtitle: 'Open / In-Progress / Done',
        path: '/crm/kanban/tasks',
        accent: '#6366f1',
        bg: '#eef2ff',
    },
    {
        flag: 'workflow.complaintKanbanEnabled',
        title: 'Complaints',
        subtitle: 'Service feedback workflow',
        path: '/crm/kanban/complaints',
        accent: '#dc2626',
        bg: '#fef2f2',
    },
    {
        flag: 'workflow.dispatchKanbanEnabled',
        title: 'Dispatch',
        subtitle: 'Sales-order fulfilment',
        path: '/crm/kanban/dispatch',
        accent: '#ea580c',
        bg: '#fff7ed',
    },
    {
        flag: 'workflow.purchaseRfqKanbanEnabled',
        title: 'Purchase',
        subtitle: 'Procurement workflow',
        path: '/crm/kanban/purchase-rfq',
        accent: '#7c3aed',
        bg: '#f5f3ff',
    },
    {
        flag: 'workflow.productionKanbanEnabled',
        title: 'Production',
        subtitle: 'Work orders & shop floor',
        path: '/crm/kanban/production',
        accent: '#0d9488',
        bg: '#ecfeff',
    },
    {
        flag: 'workflow.gstTdsKanbanEnabled',
        title: 'GST / TDS',
        subtitle: 'Compliance triage',
        path: '/crm/kanban/gst-tds',
        accent: '#d97706',
        bg: '#fffbeb',
    },
];

const pageStyle = {
    padding: 16,
    boxSizing: 'border-box',
    maxWidth: 980,
    margin: '0 auto',
    width: '100%',
};

const headerStyle = { marginBottom: 14 };
const titleStyle = { margin: 0, fontSize: 20, color: '#0f172a' };
const subtitleStyle = { fontSize: 13, color: '#64748b', marginTop: 4 };

const gridStyle = {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
};

const emptyStyle = {
    background: '#f8fafc',
    border: '1px dashed #cbd5e1',
    borderRadius: 10,
    padding: 24,
    textAlign: 'center',
    color: '#475569',
    fontSize: 13,
    lineHeight: 1.6,
};

const linkInlineStyle = { color: '#2563eb', textDecoration: 'none' };

function tileStyleFor(t) {
    return {
        background: t.bg,
        borderLeft: `4px solid ${t.accent}`,
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'transform 0.08s, box-shadow 0.12s',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        outline: 'none',
    };
}

const tileTitleStyle = { fontSize: 15, fontWeight: 700, color: '#0f172a' };
const tileSubtitleStyle = { fontSize: 12, color: '#475569' };
const tileFooterStyle = {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

export default function ApkKanbanPage() {
    const navigate = useNavigate();
    const { isFeatureEnabled, loading } = useFeatureSettings();

    const enabledTiles = useMemo(
        () => TILES.filter((t) => isFeatureEnabled(t.flag)),
        [isFeatureEnabled],
    );

    if (loading) {
        return (
            <div style={pageStyle}>
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Loading workflow settings...
                </div>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <h2 style={titleStyle}>APK / Mobile Workflow View</h2>
                <div style={subtitleStyle}>
                    A compact home for every Kanban your company has enabled. Tap a tile to open the full board.
                </div>
            </div>

            {enabledTiles.length === 0 ? (
                <div style={emptyStyle}>
                    No module Kanban boards are enabled yet.{' '}
                    <a href="/settings/feature-compliance" style={linkInlineStyle}>
                        Open Settings &rarr; Feature &amp; Compliance &rarr; Workflow / Kanban
                    </a>{' '}
                    to enable the boards you want.
                </div>
            ) : (
                <div style={gridStyle}>
                    {enabledTiles.map((t) => (
                        <div
                            key={t.flag}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(t.path)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(t.path);
                                }
                            }}
                            onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; }}
                            onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            style={tileStyleFor(t)}
                            title={`Open ${t.title} Kanban`}
                        >
                            <div style={tileTitleStyle}>{t.title}</div>
                            <div style={tileSubtitleStyle}>{t.subtitle}</div>
                            <div style={tileFooterStyle}>
                                <span>Tap to open</span>
                                <span style={{ color: t.accent, fontWeight: 700 }}>&rarr;</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
