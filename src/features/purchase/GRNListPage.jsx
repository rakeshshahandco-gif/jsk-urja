import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGRNs, deleteGRN, restoreGRN } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const INV_STATUS_COLORS = {
    'Open': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Partially Invoiced': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Fully Invoiced': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function GRNListPage() {
    const navigate = useNavigate();
    const [grns, setGrns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [invFilter, setInvFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [viewMode, setViewMode] = useState('active'); // active, archived

    const load = useCallback(() => {
        setLoading(true);
        const params = { limit: 100, view: viewMode };
        if (invFilter) params.invoiceStatus = invFilter;
        getGRNs(params)
            .then(d => {
                let data = d.grns || [];
                if (sourceFilter) data = data.filter(g => g.sourceType === sourceFilter);
                setGrns(data);
            })
            .catch(() => toast.error('Failed to load GRNs'))
            .finally(() => setLoading(false));
    }, [invFilter, sourceFilter, viewMode]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleDelete = (id) => {
        const reason = window.prompt('Enter reason for archiving this GRN:');
        if (!reason) return;
        deleteGRN(id, reason)
            .then(() => { toast.success('Archived'); load(); })
            .catch(e => toast.error(e.response?.data?.message || 'Delete failed'));
    };

    const handleRestore = (id) => {
        restoreGRN(id)
            .then(() => { toast.success('Restored'); load(); })
            .catch(e => toast.error(e.response?.data?.message || 'Restore failed'));
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📦 Goods Receipt Notes (GRN)</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Transaction-safe material receipt records</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.GRN_NEW)}
                    style={{ padding: '9px 18px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New GRN
                </button>
            </div>

            {/* Visibility Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#e2e8f0', padding: 4, borderRadius: 10, width: 'fit-content' }}>
                <button onClick={() => setViewMode('active')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'active' ? '#fff' : 'transparent', color: viewMode === 'active' ? '#0f172a' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Active
                </button>
                <button onClick={() => setViewMode('archived')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'archived' ? '#fff' : 'transparent', color: viewMode === 'archived' ? '#dc2626' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'archived' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Archived
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Source Types</option>
                    <option value="Against PO">Against PO</option>
                    <option value="Direct GRN">Direct GRN</option>
                </select>
                <select value={invFilter} onChange={e => setInvFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Invoice Status</option>
                    {['Open', 'Partially Invoiced', 'Fully Invoiced'].map(s => <option key={s}>{s}</option>)}
                </select>

                {viewMode === 'archived' && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5' }}>
                        🛡️ ARCHIVE VIEW
                    </span>
                )}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['GRN No', 'Date', 'Supplier', 'PO Ref', 'Source', 'Total Amt', 'Invoice Status', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40 }}><BrandedLoader size={80} /></td></tr>
                        ) : grns.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No {viewMode === 'archived' ? 'archived' : ''} GRNs yet.</td></tr>
                        ) : grns.map((grn) => {
                            const sc = INV_STATUS_COLORS[grn.invoiceStatus] || INV_STATUS_COLORS['Open'];
                            const isDeleted = grn.isDeleted;
                            return (
                                <tr key={grn._id} style={{ opacity: isDeleted ? 0.8 : 1, background: isDeleted ? '#fcfcfc' : 'transparent' }}
                                    onMouseEnter={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : 'transparent'}>
                                    <td style={{ ...td, color: isDeleted ? '#94a3b8' : '#2563eb', fontWeight: 700, textDecoration: isDeleted ? 'line-through' : 'none' }}>{grn.grnNumber}</td>
                                    <td style={td}>{fmt(grn.grnDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{grn.supplierName}</td>
                                    <td style={td}>{grn.poNumber || '—'}</td>
                                    <td style={td}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                                            background: grn.sourceType === 'Direct GRN' ? '#fffbeb' : '#eff6ff',
                                            color: grn.sourceType === 'Direct GRN' ? '#d97706' : '#2563eb',
                                            border: `1px solid ${grn.sourceType === 'Direct GRN' ? '#fcd34d' : '#93c5fd'}`
                                        }}>
                                            {grn.sourceType}
                                        </span>
                                    </td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(grn.totalAmount || 0).toLocaleString('en-IN')}</td>
                                    <td style={td}>
                                        <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{grn.invoiceStatus}</span>
                                    </td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {!isDeleted ? (
                                                <button onClick={() => handleDelete(grn._id)}
                                                    style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                    🗑
                                                </button>
                                            ) : (
                                                <button onClick={() => handleRestore(grn._id)}
                                                    style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                                    ♻ Restore
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
