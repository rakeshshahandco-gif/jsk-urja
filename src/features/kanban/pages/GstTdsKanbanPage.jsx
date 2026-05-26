import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import GstTdsKanbanCard from '../components/GstTdsKanbanCard';

// Columns mirror the TdsChallan.status enum exactly.
// View-only board: status transitions on TDS challans need contextual data
// (mark-paid requires BSR/challan serial/bank ledger; cancel needs audit;
// Pending/Matched are derived from reconciliation), so dragging would either
// bypass business rules or require a mid-drag modal. Cards open the existing
// TDS Compliance page where transitions happen with proper forms.
const COLUMNS = [
    { id: 'Draft',      title: 'Draft',      accent: '#64748b' },
    { id: 'Generated',  title: 'Generated',  accent: '#2563eb' },
    { id: 'Pending',    title: 'Pending',    accent: '#d97706' },
    { id: 'Part Paid',  title: 'Part Paid',  accent: '#a16207' },
    { id: 'Paid',       title: 'Paid',       accent: '#16a34a' },
    { id: 'Matched',    title: 'Matched',    accent: '#059669' },
    { id: 'Cancelled',  title: 'Cancelled',  accent: '#dc2626' },
];

const pageStyle = {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box',
};

const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
};

const titleStyle = { margin: 0, fontSize: 18, color: '#0f172a' };
const subtitleStyle = { fontSize: 12, color: '#64748b', marginTop: 2 };

const btnStyle = {
    background: '#ea580c',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#ea580c',
    padding: '7px 12px',
    border: '1px solid #ea580c',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const errorBoxStyle = {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 13,
};

const noteStyle = {
    background: '#fff7ed',
    color: '#7c2d12',
    border: '1px solid #fed7aa',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 12.5,
    lineHeight: 1.5,
};

const fyBarStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
};

const fyInputStyle = {
    padding: '6px 10px',
    fontSize: 13,
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    outline: 'none',
    minWidth: 110,
};

const loadingStyle = { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 };

function currentFy() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1..12
    if (m >= 4) return `${y}-${y + 1}`;
    return `${y - 1}-${y}`;
}

function groupByStatus(rows) {
    const acc = {};
    for (const col of COLUMNS) acc[col.id] = [];
    for (const c of rows || []) {
        const s = c?.status;
        if (acc[s]) acc[s].push(c);
        else acc.Draft.push(c);
    }
    return acc;
}

export default function GstTdsKanbanPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fy, setFy] = useState(() => currentFy());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = fy ? { financialYear: fy } : {};
            const result = await tdsComplianceApi.listChallans(params);
            // tdsComplianceApi unwraps to data which is the array directly.
            const list = Array.isArray(result)
                ? result
                : (result?.data || result?.challans || []);
            setRows(list);
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to load TDS challans';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [fy]);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(rows), [rows]);

    const openChallan = useCallback(() => {
        try {
            navigate(PATHS.TDS.CHALLANS);
        } catch (_) {
            navigate('/tds/challans');
        }
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>GST / TDS Workflow Kanban</h2>
                    <div style={subtitleStyle}>
                        TDS challan compliance triage. Total: {rows.length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={openChallan} style={btnStyle}>
                        Open TDS Compliance
                    </button>
                </div>
            </div>

            <div style={fyBarStyle}>
                <label style={{ fontSize: 12.5, color: '#64748b' }} htmlFor="kanban-fy">
                    Financial year:
                </label>
                <input
                    id="kanban-fy"
                    style={fyInputStyle}
                    value={fy}
                    onChange={(e) => setFy(e.target.value)}
                    placeholder="2025-2026"
                />
                <button onClick={load} style={linkBtnStyle} disabled={loading}>Apply</button>
            </div>

            <div style={noteStyle}>
                <strong>View-only board.</strong> Status transitions (mark-paid, cancel, link) need payment context that can&apos;t be set by drag &mdash; click any card to perform those actions on the TDS Compliance page. <em>Pending</em> and <em>Matched</em> are derived automatically from reconciliation.
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && rows.length === 0 ? (
                <div style={loadingStyle}>Loading TDS challans...</div>
            ) : (
                <KanbanBoard>
                    {COLUMNS.map((col) => {
                        const items = grouped[col.id] || [];
                        return (
                            <KanbanColumn
                                key={col.id}
                                id={col.id}
                                title={col.title}
                                accent={col.accent}
                                count={items.length}
                                isEmpty={items.length === 0}
                                emptyHint="No challans"
                            >
                                {items.map((c) => (
                                    <GstTdsKanbanCard
                                        key={c._id}
                                        challan={c}
                                        onOpen={openChallan}
                                    />
                                ))}
                            </KanbanColumn>
                        );
                    })}
                </KanbanBoard>
            )}
        </div>
    );
}
