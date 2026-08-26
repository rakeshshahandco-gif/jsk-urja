import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { listCustomerPriceLists } from '@/services/customerPriceListApi';
import toast from 'react-hot-toast';

const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const STATUS_COLORS = {
    Draft: { color: '#64748b', bg: '#f1f5f9' },
    Approved: { color: '#059669', bg: '#f0fdf4' },
    Sent: { color: '#2563eb', bg: '#eff6ff' },
    Expired: { color: '#b45309', bg: '#fffbeb' },
    Superseded: { color: '#7c3aed', bg: '#f5f3ff' },
};

const VIEWS = [
    { id: '', label: 'Price Lists' },
    { id: 'active', label: 'Active' },
    { id: 'expired', label: 'Expired' },
];

export default function CustomerPriceListListPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const view = params.get('view') || '';
    const search = params.get('q') || '';
    const customerId = params.get('customerId') || '';

    useEffect(() => {
        let live = true;
        setLoading(true);
        listCustomerPriceLists({ view: view || undefined, search: search || undefined, customerId: customerId || undefined, limit: 100 })
            .then((res) => {
                if (!live) return;
                setRows(res.data?.rows || []);
                setTotal(res.data?.total || 0);
            })
            .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load price lists'))
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [view, search, customerId]);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Customer Price List</h1>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{total} record(s) — versions are never overwritten</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_HISTORY)}
                        style={{ padding: '8px 14px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Price History
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_NEW)}
                        style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                    >
                        + New Price List
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {VIEWS.map((v) => (
                    <button
                        key={v.id || 'all'}
                        type="button"
                        onClick={() => { const n = new URLSearchParams(params); if (v.id) n.set('view', v.id); else n.delete('view'); setParams(n); }}
                        style={{
                            padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                            border: view === v.id ? '1px solid #0f766e' : '1px solid #e2e8f0',
                            background: view === v.id ? '#ccfbf1' : '#fff', color: '#134e4a',
                        }}
                    >
                        {v.label}
                    </button>
                ))}
                <input
                    value={search}
                    onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value) n.set('q', e.target.value); else n.delete('q'); setParams(n); }}
                    placeholder="Search no. / customer..."
                    style={{ marginLeft: 'auto', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, minWidth: 220 }}
                />
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={th}>Price List</th>
                            <th style={th}>Customer</th>
                            <th style={th}>Type</th>
                            <th style={th}>Effective</th>
                            <th style={th}>Valid Upto</th>
                            <th style={th}>Items</th>
                            <th style={th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td style={td} colSpan={7}>Loading…</td></tr>}
                        {!loading && !rows.length && <tr><td style={td} colSpan={7}>No price lists yet.</td></tr>}
                        {!loading && rows.map((row) => {
                            const st = STATUS_COLORS[row.status] || STATUS_COLORS.Draft;
                            return (
                                <tr key={row._id} onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_DETAIL(row._id))} style={{ cursor: 'pointer' }}>
                                    <td style={td}>
                                        <strong>{row.priceListNo}</strong> {row.version}
                                    </td>
                                    <td style={td}>
                                        <div>{row.customerName || '—'}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.customerCompany || row.customerCode}{!row.customerId ? ' · Prospect' : ''}</div>
                                    </td>
                                    <td style={td}>{row.priceType}</td>
                                    <td style={td}>{row.effectiveFrom ? new Date(row.effectiveFrom).toLocaleDateString('en-IN') : '—'}</td>
                                    <td style={td}>{row.validUpto ? new Date(row.validUpto).toLocaleDateString('en-IN') : 'Open'}</td>
                                    <td style={td}>{row.lines?.length || 0}</td>
                                    <td style={td}>
                                        <span style={{ padding: '2px 8px', borderRadius: 999, fontWeight: 700, fontSize: 11, color: st.color, background: st.bg }}>{row.status}</span>
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
