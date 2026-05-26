import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { getSalesOrders, updateSalesOrder } from '@/services/salesApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import DispatchKanbanCard from '../components/DispatchKanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Columns mirror the SO status set already used by the existing SalesOrderListPage
// STATUS_COLORS map (source of truth for the live workflow). Pipeline order:
// Draft -> Confirmed -> Dispatched -> Invoiced -> Closed / Completed (terminal).
// Cancelled stays as a separate terminal column. The existing updateSO controller
// refuses to update a Cancelled SO; that 400 will surface as a toast on drop.
const COLUMNS = [
    { id: 'Draft',      title: 'Draft',      accent: '#64748b' },
    { id: 'Confirmed',  title: 'Confirmed',  accent: '#2563eb' },
    { id: 'Dispatched', title: 'Dispatched', accent: '#d97706' },
    { id: 'Invoiced',   title: 'Invoiced',   accent: '#059669' },
    { id: 'Closed',     title: 'Closed',     accent: '#16a34a' },
    { id: 'Completed',  title: 'Completed',  accent: '#10b981' },
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
    background: '#1e40af',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#1e40af',
    padding: '7px 12px',
    border: '1px solid #1e40af',
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
    for (const so of rows || []) {
        if (so?.isDeleted) continue; // soft-deleted SOs are excluded from the board
        const s = so?.status;
        if (acc[s]) acc[s].push(so);
        else acc.Draft.push(so);
    }
    return acc;
}

export default function DispatchKanbanPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getSalesOrders({ limit: 500 });
            // salesApi.getSalesOrders returns r.data (the wrapped body). List shape: { success, data: [...], meta }.
            const list = Array.isArray(result) ? result : (result?.data || []);
            setRows(list);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load sales orders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(rows), [rows]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
        // Cancelled is a terminal state that the backend refuses to update from.
        // Surface that immediately as a friendly client-side guard rather than waiting for a 400.
        if (fromColumn === 'Cancelled') {
            toast.error('Cancelled orders cannot be moved. Restore the order first.');
            return;
        }
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
            await updateSalesOrder(cardId, { status: toColumn });
            toast.success(`Moved to ${toColumn}`);
        } catch (e) {
            setRows(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update sales order';
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

    const openOrder = useCallback((so) => {
        if (so && so._id) {
            try {
                navigate(PATHS.SALES.ORDER_DETAIL(so._id));
            } catch (_) {
                navigate(`/sales/orders/${so._id}`);
            }
        }
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Dispatch Workflow Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a sales order to change its status. Total: {rows.filter((r) => !r.isDeleted).length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate(PATHS.SALES.ORDERS)} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && rows.length === 0 ? (
                <div style={loadingStyle}>Loading sales orders...</div>
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
                                emptyHint="Drop sales orders here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((so) => (
                                    <DispatchKanbanCard
                                        key={so._id}
                                        order={so}
                                        dragProps={dnd.cardProps(so._id, col.id)}
                                        onOpen={openOrder}
                                        isPending={pendingIds.has(String(so._id))}
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
