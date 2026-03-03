import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGRNs } from '@/services/purchaseApi';
import toast from 'react-hot-toast';

const INV_STATUS_COLORS = {
    'Open': { color: '#60a5fa', bg: '#1e3a5f' },
    'Partially Invoiced': { color: '#fbbf24', bg: '#1c1000' },
    'Fully Invoiced': { color: '#6ee7b7', bg: '#052e16' },
};

export default function GRNListPage() {
    const navigate = useNavigate();
    const [grns, setGrns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [invFilter, setInvFilter] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getGRNs({ invoiceStatus: invFilter, limit: 50 })
            .then(d => setGrns(d.grns || []))
            .catch(() => toast.error('Failed to load GRNs'))
            .finally(() => setLoading(false));
    }, [invFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>📦 Goods Receipt Notes (GRN)</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>All goods received — against PO or direct</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select value={invFilter} onChange={e => setInvFilter(e.target.value)}
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Invoice Status</option>
                    {['Open', 'Partially Invoiced', 'Fully Invoiced'].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#0f172a' }}>
                            {['GRN No', 'Date', 'Supplier', 'PO Ref', 'Source', 'Total Amt', 'Invoice Status'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</td></tr>
                        ) : grns.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No GRNs yet.</td></tr>
                        ) : grns.map((grn, i) => {
                            const sc = INV_STATUS_COLORS[grn.invoiceStatus] || INV_STATUS_COLORS['Open'];
                            return (
                                <tr key={grn._id} style={{ background: i % 2 === 0 ? '#0f172a' : '#1e293b', borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>{grn.grnNumber}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(grn.grnDate)}</td>
                                    <td style={{ padding: '12px 14px', color: '#f1f5f9', fontWeight: 500 }}>{grn.supplierName}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{grn.poNumber || '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: grn.sourceType === 'Direct GRN' ? '#1c1000' : '#1e3a5f', color: grn.sourceType === 'Direct GRN' ? '#fbbf24' : '#60a5fa' }}>
                                            {grn.sourceType}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>₹{(grn.totalAmount || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{grn.invoiceStatus}</span>
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
