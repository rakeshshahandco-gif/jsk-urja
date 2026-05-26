import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { getPurchaseOrders, updatePOStatus } from '@/services/purchaseApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import PurchaseKanbanCard from '../components/PurchaseKanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Columns mirror the PO status set already used by PurchaseOrderListPage
// STATUS_COLORS (source of truth; the Mongoose enum is intentionally relaxed).
// Pipeline: Draft -> Ordered -> Partially Received -> Fully Received -> Completed,
// with Cancelled as a terminal state.
const COLUMNS = [
    { id: 'Draft',              title: 'Draft',              accent: '#64748b' },
    { id: 'Ordered',            title: 'Ordered',            accent: '#2563eb' },
    { id: 'Partially Received', title: 'Partially Received', accent: '#d97706' },
    { id: 'Fully Received',     title: 'Fully Received',     accent: '#16a34a' },
    { id: 'Completed',          title: 'Completed',          accent: '#059669' },
    { id: 'Cancelled',          title: 'Cancelled',          accent: '#dc2626' },
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
    background: '#7c3aed',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#7c3aed',
    padding: '7px 12px',
    border: '1px solid #7c3aed',
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
    for (const po of rows || []) {
        if (po?.isDeleted) continue; // soft-deleted POs excluded
        const s = po?.status;
        if (acc[s]) acc[s].push(po);
        else acc.Draft.push(po);
    }
    return acc;
}

export default function PurchaseKanbanPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getPurchaseOrders({ limit: 500 });
            // purchaseApi.getPurchaseOrders returns r.data.data which is { purchaseOrders: [...] }.
            const list = Array.isArray(result)
                ? result
                : (result?.purchaseOrders || result?.data || []);
            setRows(list);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load purchase orders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(rows), [rows]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
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
            await updatePOStatus(cardId, toColumn);
            toast.success(`Moved to ${toColumn}`);
        } catch (e) {
            setRows(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update purchase order';
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

    const openOrder = useCallback((po) => {
        if (po && po._id) {
            try {
                navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id));
            } catch (_) {
                navigate(`/purchase/orders/${po._id}`);
            }
        }
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Purchase Workflow Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a purchase order to change its status. Total: {rows.filter((r) => !r.isDeleted).length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && rows.length === 0 ? (
                <div style={loadingStyle}>Loading purchase orders...</div>
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
                                emptyHint="Drop purchase orders here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((po) => (
                                    <PurchaseKanbanCard
                                        key={po._id}
                                        order={po}
                                        dragProps={dnd.cardProps(po._id, col.id)}
                                        onOpen={openOrder}
                                        isPending={pendingIds.has(String(po._id))}
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
