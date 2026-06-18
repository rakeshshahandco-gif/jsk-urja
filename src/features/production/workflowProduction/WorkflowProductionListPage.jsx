import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Factory } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { listWorkflowProductionLots } from '@/services/workflowProductionLotApi';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

const STATUS_COLORS = {
    draft: { bg: '#f1f5f9', text: '#64748b' },
    in_progress: { bg: '#eff6ff', text: '#2563eb' },
    completed: { bg: '#f0fdf4', text: '#059669' },
    cancelled: { bg: '#fef2f2', text: '#dc2626' },
};

const STAGE_STATUS_COLORS = {
    pending: '#94a3b8',
    started: '#2563eb',
    completed: '#059669',
    skipped: '#d97706',
};

export default function WorkflowProductionListPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [lots, setLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const fetchLots = () => {
        if (!selectedCompany?._id) {
            setLots([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        listWorkflowProductionLots({
            companyId: selectedCompany._id,
            search: search || undefined,
            lotStatus: statusFilter || undefined,
        })
            .then(setLots)
            .catch((e) => toast.error(e.response?.data?.message || e.message || 'Failed to load lots'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchLots();
    }, [selectedCompany?._id, search, statusFilter]);

    const currentStage = (lot) => lot.stages?.[lot.currentStageIndex];

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Factory size={22} color="#2563eb" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Workflow Production Lots</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                            Generic production lots driven by company-assigned workflows
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOTS_NEW)}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                        background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    }}
                >
                    <Plus size={16} /> Create Lot
                </button>
            </div>

            {!selectedCompany?._id && (
                <div style={{ padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
                    Select a company from the header to view workflow production lots.
                </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search lot no, batch, item..."
                        style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, minWidth: 160 }}
                >
                    <option value="">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {loading ? (
                    <TableSkeleton rows={6} cols={8} />
                ) : lots.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        No production lots found. Create one to start workflow-driven production.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                {['Lot No', 'Batch', 'Item', 'Qty Started', 'Qty Completed', 'Pending', 'Current Stage', 'Status', ''].map((h) => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lots.map((lot) => {
                                const stage = currentStage(lot);
                                const sc = STATUS_COLORS[lot.lotStatus] || STATUS_COLORS.draft;
                                return (
                                    <tr key={lot._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{lot.lotNo}</td>
                                        <td style={{ padding: '10px 12px' }}>{lot.batchNo || '—'}</td>
                                        <td style={{ padding: '10px 12px' }}>{lot.itemName || lot.itemId?.itemName || '—'}</td>
                                        <td style={{ padding: '10px 12px' }}>{lot.qtyStarted}</td>
                                        <td style={{ padding: '10px 12px' }}>{lot.qtyCompleted}</td>
                                        <td style={{ padding: '10px 12px' }}>{lot.pendingQty}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {stage ? (
                                                <span style={{ color: STAGE_STATUS_COLORS[stage.status] || '#64748b' }}>
                                                    {stage.stageName} ({stage.status})
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: 999, background: sc.bg, color: sc.text, fontWeight: 600, textTransform: 'capitalize' }}>
                                                {String(lot.lotStatus || '').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <button
                                                type="button"
                                                onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOT_DETAIL(lot._id))}
                                                style={{ padding: '4px 10px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}
                                            >
                                                Open
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
