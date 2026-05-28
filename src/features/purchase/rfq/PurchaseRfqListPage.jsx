import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseRfqs } from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

const STATUS_COLORS = {
    Draft: { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
    Sent: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Quotation Received': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    Compared: { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
    'Converted to PO': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Closed: { color: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
    Cancelled: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6' };

export default function PurchaseRfqListPage() {
    const navigate = useNavigate();
    const [rfqs, setRfqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getPurchaseRfqs({ search, status: statusFilter || undefined, limit: 100 })
            .then((d) => setRfqs(d.rfqs || []))
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load RFQs'))
            .finally(() => setLoading(false));
    }, [search, statusFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Purchase RFQ</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Send enquiries to multiple suppliers and compare quotations</p>
                </div>
                <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_NEW)}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                    + New RFQ
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <input placeholder="Search RFQ / item..." value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 7, width: 260 }} />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 7 }}>
                    <option value="">All Status</option>
                    {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? <TableSkeleton rows={8} cols={7} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['RFQ No', 'Date', 'Required By', 'Items', 'Suppliers', 'Status', 'Actions'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rfqs.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No RFQs found</td></tr>
                            ) : rfqs.map((r) => {
                                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.Draft;
                                return (
                                    <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => navigate(PATHS.PURCHASE.RFQ_DETAIL(r._id))}>
                                        <td style={{ ...td, fontWeight: 700, color: '#2563eb' }}>{r.rfqNumber}</td>
                                        <td style={td}>{fmt(r.rfqDate)}</td>
                                        <td style={td}>{fmt(r.requiredByDate)}</td>
                                        <td style={td}>{r.items?.length || 0}</td>
                                        <td style={td}>{r.suppliers?.length || 0}</td>
                                        <td style={td}>
                                            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{r.status}</span>
                                        </td>
                                        <td style={td} onClick={(e) => e.stopPropagation()}>
                                            <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_EDIT(r._id))} style={{ marginRight: 6, padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}>Edit</button>
                                            {['Quotation Received', 'Compared', 'Sent'].includes(r.status) && (
                                                <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_COMPARISON(r._id))} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer' }}>Compare</button>
                                            )}
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
