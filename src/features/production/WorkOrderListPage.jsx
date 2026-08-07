import React, { useEffect, useState } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getWorkOrders, deleteWorkOrder, releaseWorkOrder } from '@/services/workOrderApi';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getWorkOrderLabels } from '@/utils/textileWorkOrder';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

const STATUS_COLORS = {
    'Draft': { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
    'Released': { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd' },
    'In Process': { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
    'WIP – Waiting Material': { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
    'On Hold': { bg: '#faf5ff', text: '#9333ea', border: '#d8b4fe' },
    'Completed': { bg: '#f0fdf4', text: '#059669', border: '#6ee7b7' },
    'Closed': { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0' },
};

const STATUS_CARD_BORDER = {
    'Draft': '#cbd5e1',
    'Released': '#93c5fd',
    'In Process': '#86efac',
    'WIP – Waiting Material': '#fca5a5',
    'On Hold': '#d8b4fe',
    'Completed': '#6ee7b7',
    'Closed': '#e2e8f0',
};

const PRIORITY_COLORS = {
    'Low': '#64748b',
    'Medium': '#2563eb',
    'High': '#d97706',
    'Urgent': '#dc2626',
};

export default function WorkOrderListPage() {
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const labels = getWorkOrderLabels(isTextile);
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

    useEffect(() => { fetchWorkOrders(); }, [search, statusFilter]);

    useGlobalSync('workorder', (payload) => {
        if (payload.action === 'create') setWos(prev => [payload.data, ...prev]);
        else if (payload.action === 'update') setWos(prev => prev.map(w => w._id === payload.recordId ? { ...w, ...payload.data } : w));
        else if (payload.action === 'delete') setWos(prev => prev.filter(w => w._id !== payload.recordId));
    });

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
            fetchWorkOrders();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setDeleting(null); }
    };

    const stageProgress = (stages = []) => {
        const done = stages.filter(s => s.status === 'Completed').length;
        return { done, total: stages.length };
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{labels.title}</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>
                        {wos.length} record{wos.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.NEW_WO)}
                    style={{
                        background: '#0d9488', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.3)',
                    }}
                >
                    {labels.newButton}
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input
                    placeholder="Search WO No, Product, Supervisor..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1, minWidth: 240, padding: '7px 12px',
                        background: '#fff', border: '1px solid #d1d5db', borderRadius: 7,
                        color: '#374151', fontSize: 13, outline: 'none',
                    }}
                />
                <select
                    value={statusFilter}
                    onChange={e => setStatus(e.target.value)}
                    style={{
                        padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db',
                        borderRadius: 7, color: '#374151', fontSize: 13, cursor: 'pointer', outline: 'none',
                    }}
                >
                    <option value="">All Statuses</option>
                    {['Draft', 'Released', 'In Process', 'WIP – Waiting Material', 'On Hold', 'Completed', 'Closed']
                        .map(s => <option key={s} value={s}>{s}</option>)
                    }
                </select>
            </div>

            {loading ? (
                <TableSkeleton rows={6} cols={1} />
            ) : wos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#6b7280' }}>{labels.listEmpty}</div>
                    <div style={{ fontSize: 14 }}>{labels.listEmptyHint}</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {wos.map(wo => {
                        const sc = STATUS_COLORS[wo.status] || STATUS_COLORS['Draft'];
                        const cardBorder = STATUS_CARD_BORDER[wo.status] || '#e2e8f0';
                        const pc = PRIORITY_COLORS[wo.priority] || '#64748b';
                        const { done, total } = stageProgress(wo.stages);
                        const pct = total ? Math.round((done / total) * 100) : 0;
                        const hasShortage = (wo.materialStatus || []).some(m => m.isMandatory && m.shortQty > 0);

                        return (
                            <div key={wo._id} style={{
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderLeft: `4px solid ${cardBorder}`,
                                borderRadius: 12, padding: '16px 20px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                transition: 'box-shadow 0.15s, transform 0.15s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    {/* Left */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{wo.woNumber}</span>
                                            <span style={{
                                                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                                background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                                            }}>{wo.status}</span>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                background: `${pc}15`, color: pc, border: `1px solid ${pc}40`,
                                            }}>{wo.priority}</span>
                                            {hasShortage && (
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
                                                }}>⚠️ Material Shortage</span>
                                            )}
                                        </div>
                                        <div style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>
                                            {wo.finishedProductName || 'N/A'}
                                            {isTextile && wo.textile?.designNo ? ` · Design: ${wo.textile.designNo}` : ''}
                                            {isTextile && wo.textile?.requiredFabricMeter ? ` · Fabric: ${wo.textile.requiredFabricMeter} m` : ''}
                                            {' · Qty: '}{wo.targetQty}{isTextile ? ' PCS' : ''}
                                            {' · '}{isTextile ? 'Worker' : 'Supervisor'}: {wo.textile?.assignedVendorWorker || wo.supervisor || '—'}
                                        </div>
                                        {isTextile && wo.textile?.processRoute && (
                                            <div style={{ marginTop: 4, fontSize: 11, color: '#7c3aed' }}>{wo.textile.processRoute}</div>
                                        )}
                                        {/* Progress bar */}
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Stage Progress</span>
                                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{done}/{total} stages</span>
                                            </div>
                                            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                                <div style={{
                                                    height: '100%', width: `${pct}%`,
                                                    background: pct === 100
                                                        ? 'linear-gradient(90deg,#16a34a,#059669)'
                                                        : 'linear-gradient(90deg,#2563eb,#0d9488)',
                                                    borderRadius: 3, transition: 'width 0.3s',
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(wo._id))}
                                            style={{
                                                padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                                                background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', cursor: 'pointer',
                                            }}
                                        >View</button>
                                        {wo.status === 'Draft' && (
                                            <button
                                                onClick={() => handleRelease(wo._id)}
                                                style={{
                                                    padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                                                    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', cursor: 'pointer',
                                                }}
                                            >Release</button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(wo._id)}
                                            disabled={deleting === wo._id}
                                            style={{
                                                padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                                                background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer',
                                            }}
                                        >{deleting === wo._id ? '...' : 'Delete'}</button>
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
