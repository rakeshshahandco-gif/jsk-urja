import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGRNs } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

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

    const load = useCallback(() => {
        setLoading(true);
        const params = { limit: 50 };
        if (invFilter) params.invoiceStatus = invFilter;
        getGRNs(params)
            .then(d => {
                let data = d.grns || [];
                if (sourceFilter) data = data.filter(g => g.sourceType === sourceFilter);
                setGrns(data);
            })
            .catch(() => toast.error('Failed to load GRNs'))
            .finally(() => setLoading(false));
    }, [invFilter, sourceFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📦 Goods Receipt Notes (GRN)</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>All goods received — against PO or direct</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.GRN_NEW)}
                    style={{ padding: '9px 18px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New GRN
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['GRN No', 'Date', 'Supplier', 'PO Ref', 'Source', 'Total Amt', 'Invoice Status'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : grns.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No GRNs yet.</td></tr>
                        ) : grns.map((grn) => {
                            const sc = INV_STATUS_COLORS[grn.invoiceStatus] || INV_STATUS_COLORS['Open'];
                            return (
                                <tr key={grn._id}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{grn.grnNumber}</td>
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
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
