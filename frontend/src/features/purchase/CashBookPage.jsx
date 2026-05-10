import React, { useEffect, useState, useCallback } from 'react';
import { getCashBook } from '@/services/purchaseApi';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui';

export default function CashBookPage() {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState({ entries: [], total: 0, totalAmount: 0 });
    const [loading, setLoading] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        getCashBook({ from, to, limit: 200 })
            .then(d => setData(d || { entries: [], total: 0, totalAmount: 0 }))
            .catch(() => toast.error('Failed to load Cash Book'))
            .finally(() => setLoading(false));
    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter',sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700 }}>💵 Cash Book</h1>
            <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '13px' }}>All cash payments against Purchase Invoices</p>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {[['From', from, setFrom], ['To', to, setTo]].map(([label, val, setter]) => (
                    <div key={label}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>{label}</div>
                        <input type="date" value={val} onChange={e => setter(e.target.value)} style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none' }} />
                    </div>
                ))}
                <button onClick={load} style={{ padding: '9px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 700 }}>🔍 Search</button>
                <div style={{ marginLeft: 'auto', background: '#052e16', border: '1px solid #10b981', borderRadius: '10px', padding: '10px 20px', textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>TOTAL CASH PAID</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>₹{(data.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#0f172a', color: '#64748b' }}>
                            {['Date', 'Supplier', 'Invoice No', 'Cash A/c', 'Amount', 'Notes'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}><BrandedLoader size={80} /></td></tr>
                        ) : data.entries.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No cash entries in selected period.</td></tr>
                        ) : data.entries.map((e, i) => (
                            <tr key={e._id} style={{ borderBottom: '1px solid #1e293b', background: i % 2 ? '#0a1220' : 'transparent' }}>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(e.paymentDate)}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 500 }}>{e.supplierName}</td>
                                <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>{e.invoiceNumber}</td>
                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{e.cashAccount || 'Main Cash'}</td>
                                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>₹{e.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{e.notes || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
