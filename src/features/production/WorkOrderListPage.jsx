import React, { useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getWorkOrders, deleteWorkOrder, releaseWorkOrder } from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    'Draft': { bg: '#1e293b', text: '#94a3b8', border: '#334155' },
    'Released': { bg: '#1e3a5f', text: '#60a5fa', border: '#1d4ed8' },
    'In Process': { bg: '#1c2a18', text: '#86efac', border: '#16a34a' },
    'WIP – Waiting Material': { bg: '#450a0a', text: '#fca5a5', border: '#dc2626' },
    'On Hold': { bg: '#2e1065', text: '#c4b5fd', border: '#7c3aed' },
    'Completed': { bg: '#052e16', text: '#6ee7b7', border: '#059669' },
    'Closed': { bg: '#1e293b', text: '#475569', border: '#334155' },
};

const PRIORITY_COLORS = {
    'Low': '#64748b',
    'Medium': '#3b82f6',
    'High': '#f59e0b',
    'Urgent': '#ef4444',
};

export default function WorkOrderListPage() {
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const [wos, setWos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatus] = useState(sp.get('status') || '');
    const [deleting, setDeleting] = useState(null);

    const fetchWorkOrders = () => {
        setLoading(true);
        getWorkOrders({ search, status: statusFilter || undefined })
            .then(d => setWos(d.workOrders || []))
            .catch(e => toast.error(e.message || 'Failed to load WOs'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchWorkOrders();
    }, [search, statusFilter]);
    useAutoRefresh(fetchWorkOrders);

    const handleRelease = async (id) => {
        try {
            await releaseWorkOrder(id);
            toast.success('Work Order released!');
            fetchWorkOrders();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this draft Work Order?')) return;
        setDeleting(id);
        try {
            await deleteWorkOrder(id);
            toast.success('Deleted');
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setDeleting(null); }
    };

    const stageProgress = (stages = []) => {
        const done = stages.filter(s => s.status === 'Completed').length;
        return { done, total: stages.length };
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Work Orders</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                        {wos.length} record{wos.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.NEW_WO)}
                    style={{
                        background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff',
                        border: 'none', borderRadius: '10px', padding: '10px 20px',
                        fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    + New Work Order
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input
                    placeholder="Search WO No, Product, Supervisor..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1, minWidth: '240px', padding: '10px 14px',
                        background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
                        color: '#f1f5f9', fontSize: '14px', outline: 'none',
                    }}
                />
                <select
                    value={statusFilter}
                    onChange={e => setStatus(e.target.value)}
                    style={{
                        padding: '10px 14px', background: '#1e293b', border: '1px solid #334155',
                        borderRadius: '8px', color: '#f1f5f9', fontSize: '14px', cursor: 'pointer',
                    }}
                >
                    <option value="">All Statuses</option>
                    {['Draft', 'Released', 'In Process', 'WIP – Waiting Material', 'On Hold', 'Completed', 'Closed']
                        .map(s => <option key={s} value={s}>{s}</option>)
                    }
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading...</div>
            ) : wos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px', color: '#64748b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No Work Orders</div>
                    <div style={{ fontSize: '14px' }}>Create your first WO to start production</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {wos.map(wo => {
                        const sc = STATUS_COLORS[wo.status] || STATUS_COLORS['Draft'];
                        const pc = PRIORITY_COLORS[wo.priority] || '#64748b';
                        const { done, total } = stageProgress(wo.stages);
                        const pct = total ? Math.round((done / total) * 100) : 0;
                        const hasShortage = (wo.materialStatus || []).some(m => m.isMandatory && m.shortQty > 0);

                        return (
                            <div key={wo._id} style={{
                                background: '#1e293b', border: `1px solid ${sc.border}`,
                                borderRadius: '12px', padding: '20px',
                                transition: 'box-shadow 0.15s',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                    {/* Left */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '16px', color: '#f1f5f9' }}>{wo.woNumber}</span>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                                background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                                            }}>{wo.status}</span>
                                            <span style={{
                                                padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                background: `${pc}22`, color: pc, border: `1px solid ${pc}55`,
                                            }}>{wo.priority}</span>
                                            {hasShortage && (
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                    background: '#450a0a', color: '#fca5a5', border: '1px solid #dc2626',
                                                }}>⚠️ Material Shortage</span>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '13px' }}>
                                            {wo.finishedProductName || 'N/A'} · Qty: {wo.targetQty} · Supervisor: {wo.supervisor || '—'}
                                        </div>
                                        {/* Progress bar */}
                                        <div style={{ marginTop: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', color: '#64748b' }}>Stage Progress</span>
                                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{done}/{total} stages</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', width: `${pct}%`,
                                                    background: 'linear-gradient(90deg,#3b82f6,#10b981)',
                                                    borderRadius: '3px', transition: 'width 0.3s',
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(wo._id))}
                                            style={{
                                                padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                                background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer',
                                            }}
                                        >View</button>
                                        {wo.status === 'Draft' && (
                                            <>
                                                <button
                                                    onClick={() => handleRelease(wo._id)}
                                                    style={{
                                                        padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                                        background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer',
                                                    }}
                                                >Release</button>
                                                <button
                                                    onClick={() => handleDelete(wo._id)}
                                                    disabled={deleting === wo._id}
                                                    style={{
                                                        padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                                        background: '#7f1d1d', color: '#fca5a5', border: 'none', cursor: 'pointer',
                                                    }}
                                                >{deleting === wo._id ? '...' : 'Delete'}</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
