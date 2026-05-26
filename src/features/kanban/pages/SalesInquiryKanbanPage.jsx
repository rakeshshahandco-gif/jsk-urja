import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { leadApi } from '@/services/leadApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import KanbanCard from '../components/KanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Pipeline order matches the existing Lead status enum in backend/src/models/lead.model.js.
// Do NOT add/remove values here without also extending the Mongoose enum + Joi validator.
const COLUMNS = [
    { id: 'new',         title: 'New',         accent: '#3b82f6' },
    { id: 'contacted',   title: 'Contacted',   accent: '#0ea5e9' },
    { id: 'qualified',   title: 'Qualified',   accent: '#06b6d4' },
    { id: 'quotation',   title: 'Quotation',   accent: '#8b5cf6' },
    { id: 'negotiation', title: 'Negotiation', accent: '#a855f7' },
    { id: 'won',         title: 'Won',         accent: '#16a34a' },
    { id: 'lost',        title: 'Lost',        accent: '#dc2626' },
    { id: 'hold',        title: 'On Hold',     accent: '#64748b' },
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
    background: '#1e3a8a',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#1e3a8a',
    padding: '7px 12px',
    border: '1px solid #1e3a8a',
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

const loadingStyle = {
    padding: 40,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
};

function groupByStatus(leads) {
    const acc = {};
    for (const col of COLUMNS) acc[col.id] = [];
    for (const lead of leads || []) {
        const s = lead?.status && acc[lead.status] ? lead.status : 'new';
        acc[s].push(lead);
    }
    return acc;
}

export default function SalesInquiryKanbanPage() {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await leadApi.list({ limit: 500 });
            const rows = data?.results || data || [];
            setLeads(Array.isArray(rows) ? rows : []);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(leads), [leads]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
        const prevList = leads;
        // Optimistic update
        setLeads((curr) => curr.map((l) => (
            String(l._id) === String(cardId) ? { ...l, status: toColumn } : l
        )));
        setPendingIds((s) => {
            const next = new Set(s);
            next.add(String(cardId));
            return next;
        });
        try {
            await leadApi.update(cardId, { status: toColumn });
            const colTitle = (COLUMNS.find((c) => c.id === toColumn) || {}).title || toColumn;
            toast.success(`Moved to ${colTitle}`);
        } catch (e) {
            setLeads(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update lead status';
            toast.error(msg);
        } finally {
            setPendingIds((s) => {
                const next = new Set(s);
                next.delete(String(cardId));
                return next;
            });
        }
    }, [leads]);

    const dnd = useKanbanDnd({ onDrop: handleDrop });

    const openLead = useCallback((lead) => {
        if (lead && lead._id) navigate(`/crm/leads/${lead._id}`);
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Sales Inquiry Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a lead card to change its status. Total: {leads.length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate('/crm/leads')} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && leads.length === 0 ? (
                <div style={loadingStyle}>Loading leads...</div>
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
                                emptyHint="Drop leads here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((lead) => (
                                    <KanbanCard
                                        key={lead._id}
                                        lead={lead}
                                        dragProps={dnd.cardProps(lead._id, col.id)}
                                        onOpen={openLead}
                                        isPending={pendingIds.has(String(lead._id))}
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
