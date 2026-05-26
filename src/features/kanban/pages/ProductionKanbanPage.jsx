import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { getWorkOrders, updateWorkOrder, releaseWorkOrder } from '@/services/workOrderApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import ProductionKanbanCard from '../components/ProductionKanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Columns mirror WorkOrderListPage.STATUS_COLORS exactly (Mongoose enum is
// intentionally relaxed in workOrder.model.js; the list page is the source of
// truth). The en-dash in 'WIP – Waiting Material' MUST match — do not change.
const WIP_WAITING = 'WIP \u2013 Waiting Material';

const COLUMNS = [
    { id: 'Draft',       title: 'Draft',                  accent: '#64748b' },
    { id: 'Released',    title: 'Released',               accent: '#2563eb' },
    { id: 'In Process',  title: 'In Process',             accent: '#16a34a' },
    { id: WIP_WAITING,   title: 'WIP - Waiting Material', accent: '#dc2626' },
    { id: 'On Hold',     title: 'On Hold',                accent: '#9333ea' },
    { id: 'Completed',   title: 'Completed',              accent: '#059669' },
    { id: 'Closed',      title: 'Closed',                 accent: '#94a3b8' },
];

// Allowed drag transitions in the Kanban. Other transitions must be performed
// on the WO detail page because they have additional business rules:
//   - In Process / Completed / Closed are driven by stage updates + inventory sync
//   - Draft -> Released requires a material check (handled by releaseWorkOrder)
//   - WIP - Waiting Material is automatic based on materialStatus
// Allowed here:
//   - Draft     -> Released     (calls releaseWorkOrder, runs material check)
//   - On Hold   -> Released     (Joi-allowed via updateWorkOrder)
//   - any non-Closed -> On Hold (Joi-allowed via updateWorkOrder)
function isAllowedTransition(from, to) {
    if (!from || !to || from === to) return false;
    if (from === 'Closed') return false;
    if (to === 'On Hold')  return from !== 'Closed';
    if (to === 'Released') return from === 'Draft' || from === 'On Hold';
    return false;
}

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
    background: '#0d9488',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#0d9488',
    padding: '7px 12px',
    border: '1px solid #0d9488',
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
    background: '#f8fafc',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 12.5,
    lineHeight: 1.5,
};

const loadingStyle = { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 };

function groupByStatus(rows) {
    const acc = {};
    for (const col of COLUMNS) acc[col.id] = [];
    for (const wo of rows || []) {
        const s = wo?.status;
        if (acc[s]) acc[s].push(wo);
        else acc.Draft.push(wo);
    }
    return acc;
}

export default function ProductionKanbanPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getWorkOrders({ limit: 500 });
            // workOrderApi.getWorkOrders returns r.data.data which is { workOrders: [...] }.
            const list = Array.isArray(result)
                ? result
                : (result?.workOrders || result?.data || []);
            setRows(list);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load work orders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(rows), [rows]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
        if (!isAllowedTransition(fromColumn, toColumn)) {
            toast.error(
                'This transition is managed from the Work Order detail page (stage progression / completion).'
            );
            return;
        }
        const prevList = rows;
        // Optimistic UI: move the card now; rollback if API fails.
        setRows((curr) => curr.map((r) => (
            String(r._id) === String(cardId) ? { ...r, status: toColumn } : r
        )));
        setPendingIds((s) => {
            const next = new Set(s);
            next.add(String(cardId));
            return next;
        });
        try {
            // Use the dedicated release endpoint so material checks run.
            if (toColumn === 'Released' && fromColumn === 'Draft') {
                await releaseWorkOrder(cardId);
            } else if (toColumn === 'Released' && fromColumn === 'On Hold') {
                await updateWorkOrder(cardId, { status: 'Released' });
            } else if (toColumn === 'On Hold') {
                await updateWorkOrder(cardId, { status: 'On Hold' });
            } else {
                // Defensive: should never hit because isAllowedTransition guards above.
                throw new Error('Transition not supported from Kanban');
            }
            toast.success(`Moved to ${toColumn}`);
            // Re-fetch in background to pick up server-side side-effects (e.g.
            // material status recalculation on release).
            load();
        } catch (e) {
            setRows(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update work order';
            toast.error(msg);
        } finally {
            setPendingIds((s) => {
                const next = new Set(s);
                next.delete(String(cardId));
                return next;
            });
        }
    }, [rows, load]);

    const dnd = useKanbanDnd({ onDrop: handleDrop });

    const openWO = useCallback((wo) => {
        if (wo && wo._id) {
            try {
                navigate(PATHS.PRODUCTION.WO_DETAIL(wo._id));
            } catch (_) {
                navigate(`/production/work-orders/${wo._id}`);
            }
        }
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Production Workflow Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a work order to On Hold or Released. Total: {rows.length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            <div style={noteStyle}>
                Only <strong>Release</strong> (Draft / On Hold &rarr; Released) and <strong>Hold</strong> (any &rarr; On Hold) transitions are available here. Stage progression (In&nbsp;Process, Completed, Closed) and material-driven WIP status remain on the WO detail page where their business rules (material checks, stage logs, inventory sync) run.
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && rows.length === 0 ? (
                <div style={loadingStyle}>Loading work orders...</div>
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
                                emptyHint="Drop work orders here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((wo) => (
                                    <ProductionKanbanCard
                                        key={wo._id}
                                        wo={wo}
                                        dragProps={dnd.cardProps(wo._id, col.id)}
                                        onOpen={openWO}
                                        isPending={pendingIds.has(String(wo._id))}
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
