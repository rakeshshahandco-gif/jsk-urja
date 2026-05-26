import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getComplaints, updateComplaint } from '@/services/serviceApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import ComplaintKanbanCard from '../components/ComplaintKanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Columns mirror the status values already used by the existing
// ComplaintListPage STATUS_COLORS map (source of truth for the live workflow,
// since the Mongoose enum is intentionally relaxed for legacy compatibility).
// Order matches the natural pipeline: receive -> review -> dispatch -> receive back -> repair / close.
const COLUMNS = [
    { id: 'Open',                       title: 'Open',                       accent: '#dc2626' },
    { id: 'Under Review',               title: 'Under Review',               accent: '#f59e0b' },
    { id: 'Approved',                   title: 'Approved',                   accent: '#10b981' },
    { id: 'Replacement Sent',           title: 'Replacement Sent',           accent: '#3b82f6' },
    { id: 'Waiting Faulty Return',      title: 'Waiting Faulty Return',      accent: '#8b5cf6' },
    { id: 'Faulty Partially Received',  title: 'Faulty Partially Received',  accent: '#ec4899' },
    { id: 'Faulty Fully Received',      title: 'Faulty Fully Received',      accent: '#14b8a6' },
    { id: 'In QC',                      title: 'In QC',                      accent: '#0ea5e9' },
    { id: 'Repair In Process',          title: 'Repair In Process',          accent: '#eab308' },
    { id: 'Closed',                     title: 'Closed',                     accent: '#16a34a' },
    { id: 'Closed with Scrap',          title: 'Closed with Scrap',          accent: '#64748b' },
    { id: 'Cancelled',                  title: 'Cancelled',                  accent: '#94a3b8' },
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
    background: '#dc2626',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#dc2626',
    padding: '7px 12px',
    border: '1px solid #dc2626',
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

const loadingStyle = { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 };

function groupByStatus(rows) {
    const acc = {};
    for (const col of COLUMNS) acc[col.id] = [];
    for (const c of rows || []) {
        const s = c?.status;
        if (acc[s]) acc[s].push(c);
        else acc.Open.push(c);
    }
    return acc;
}

export default function ComplaintKanbanPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getComplaints({ limit: 500 });
            const list = Array.isArray(result) ? result : (result?.data || []);
            setRows(list);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load complaints');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(rows), [rows]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
        const prevList = rows;
        setRows((curr) => curr.map((r) => (
            String(r._id) === String(cardId) ? { ...r, status: toColumn } : r
        )));
        setPendingIds((s) => {
            const next = new Set(s);
            next.add(String(cardId));
            return next;
        });
        try {
            await updateComplaint(cardId, { status: toColumn });
            toast.success(`Moved to ${toColumn}`);
        } catch (e) {
            setRows(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update complaint status';
            toast.error(msg);
        } finally {
            setPendingIds((s) => {
                const next = new Set(s);
                next.delete(String(cardId));
                return next;
            });
        }
    }, [rows]);

    const dnd = useKanbanDnd({ onDrop: handleDrop });

    const openComplaint = useCallback((c) => {
        if (c && c._id) navigate(`/service/complaints/${c._id}`);
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Complaint Workflow Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a complaint to change its status. Total: {rows.length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate('/service/complaints')} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && rows.length === 0 ? (
                <div style={loadingStyle}>Loading complaints...</div>
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
                                emptyHint="Drop complaints here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((c) => (
                                    <ComplaintKanbanCard
                                        key={c._id}
                                        complaint={c}
                                        dragProps={dnd.cardProps(c._id, col.id)}
                                        onOpen={openComplaint}
                                        isPending={pendingIds.has(String(c._id))}
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
