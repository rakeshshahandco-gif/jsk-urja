import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getSalesInvoiceCreationAudit } from '@/services/salesApi';
import toast from 'react-hot-toast';

const inp = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 160 };

export default function SalesInvoiceCreationAuditPage() {
    const navigate = useNavigate();
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [user, setUser] = useState('');
    const [soNumber, setSoNumber] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const search = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getSalesInvoiceCreationAudit({
                invoiceNumber: invoiceNumber.trim() || undefined,
                user: user.trim() || undefined,
                soNumber: soNumber.trim() || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                limit: 100,
            });
            setRows(res?.data || []);
            setTotal(res?.total || 0);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not load creation audit');
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [invoiceNumber, user, soNumber, dateFrom, dateTo]);

    const fmtAt = (d) => d
        ? new Date(d).toLocaleString('en-GB', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        })
        : '—';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
            <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 8 }}>← Tax Invoices</button>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Sales Invoice Creation Audit</h1>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>Read-only. Shows who created each invoice, from which source, and which Sales Order / request.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'end' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Invoice No<br /><input style={inp} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Created by<br /><input style={inp} value={user} onChange={(e) => setUser(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Sales Order<br /><input style={inp} value={soNumber} onChange={(e) => setSoNumber(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>From date<br /><input type="date" style={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>To date<br /><input type="date" style={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
                <button onClick={search} disabled={loading} style={{ padding: '8px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Searching…' : 'Search'}</button>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{total} record(s)</div>
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Invoice', 'Created By', 'Created At', 'Source', 'SO', 'Request ID'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id}>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <button type="button" onClick={() => navigate(PATHS.SALES.INVOICE_DETAIL(r._id))} style={{ background: 'none', border: 'none', color: '#0d9488', fontWeight: 700, cursor: 'pointer' }}>{r.invoiceNumber}</button>
                                </td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.createdBy || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{fmtAt(r.createdAt)}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.source || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.soNumber || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-all', fontSize: 12 }}>{r.requestId || '—'}</td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Search to load creation records.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
