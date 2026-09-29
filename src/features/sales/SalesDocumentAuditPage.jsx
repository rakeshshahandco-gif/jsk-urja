import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getSalesDocumentAudits, getSalesDocumentAuditById } from '@/services/salesApi';
import toast from 'react-hot-toast';

const inp = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 150 };

function fmtAt(d) {
    return d
        ? new Date(d).toLocaleString('en-GB', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        : '—';
}

function formatValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export default function SalesDocumentAuditPage() {
    const navigate = useNavigate();
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [user, setUser] = useState('');
    const [soNumber, setSoNumber] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [action, setAction] = useState('');
    const [source, setSource] = useState('');
    const [requestId, setRequestId] = useState('');
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);

    const search = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getSalesDocumentAudits({
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                user: user.trim() || undefined,
                soNumber: soNumber.trim() || undefined,
                invoiceNumber: invoiceNumber.trim() || undefined,
                action: action.trim() || undefined,
                source: source.trim() || undefined,
                requestId: requestId.trim() || undefined,
                limit: 100,
            });
            setRows(res?.data || []);
            setTotal(res?.total || 0);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not load sales document audit');
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, user, soNumber, invoiceNumber, action, source, requestId]);

    const openDetails = async (id) => {
        try {
            const res = await getSalesDocumentAuditById(id);
            setDetail(res?.data || null);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not load audit details');
        }
    };

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
            <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 8 }}>← Tax Invoices</button>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Sales Document Audit</h1>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                Read-only forensic trail for Sales Orders and Sales Invoices. Records cannot be edited or deleted.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'end' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>From date<br /><input type="date" style={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>To date<br /><input type="date" style={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>User<br /><input style={inp} value={user} onChange={(e) => setUser(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Sales Order No.<br /><input style={inp} value={soNumber} onChange={(e) => setSoNumber(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Invoice No.<br /><input style={inp} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Action<br /><input style={inp} value={action} onChange={(e) => setAction(e.target.value)} placeholder="SI_CREATE" /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Source<br /><input style={inp} value={source} onChange={(e) => setSource(e.target.value)} placeholder="WEB_SO_CONVERSION" /></label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Request ID<br /><input style={inp} value={requestId} onChange={(e) => setRequestId(e.target.value)} /></label>
                <button onClick={search} disabled={loading} style={{ padding: '8px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Searching…' : 'Search'}</button>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{total} record(s)</div>
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Date & time', 'User / System', 'Action', 'SO Number', 'Invoice Number', 'Source', 'Request ID', ''].map((h) => (
                                <th key={h || 'details'} style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id}>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{fmtAt(r.occurredAt)}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                    {r.actorType === 'SYSTEM' ? 'SYSTEM' : (r.actorName || r.actorUsername || '—')}
                                    {r.actorUsername ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.actorUsername}</div> : null}
                                </td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{r.action}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.salesOrderNumber || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.invoiceNumber || r.relatedInvoiceNumber || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.creationSource || r.sourceModule || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-all', fontSize: 12 }}>{r.requestId || '—'}</td>
                                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <button type="button" onClick={() => openDetails(r._id)} style={{ background: 'none', border: 'none', color: '#0d9488', fontWeight: 700, cursor: 'pointer' }}>Details</button>
                                </td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Search to load forensic records.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {detail && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setDetail(null)}>
                    <div style={{ background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '86vh', overflow: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h2 style={{ margin: 0, fontSize: 18 }}>Audit details</h2>
                            <button type="button" onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
                        </div>
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Read only. No edit, delete, or correct actions.</p>
                        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 12px', fontSize: 13, margin: 0 }}>
                            <dt style={{ color: '#64748b' }}>Action</dt><dd style={{ margin: 0, fontWeight: 700 }}>{detail.action}</dd>
                            <dt style={{ color: '#64748b' }}>Date & time</dt><dd style={{ margin: 0 }}>{fmtAt(detail.occurredAt)}</dd>
                            <dt style={{ color: '#64748b' }}>Actor</dt><dd style={{ margin: 0 }}>{detail.actorType} — {detail.actorName || '—'} ({detail.actorUsername || '—'}) / {detail.actorRole || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>SO Number</dt><dd style={{ margin: 0 }}>{detail.salesOrderNumber || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Invoice Number</dt><dd style={{ margin: 0 }}>{detail.invoiceNumber || detail.relatedInvoiceNumber || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Source</dt><dd style={{ margin: 0 }}>{detail.creationSource || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Module</dt><dd style={{ margin: 0 }}>{detail.sourceModule || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Request ID</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{detail.requestId || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Idempotency key</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{detail.idempotencyKey || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Route</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{detail.httpMethod} {detail.apiRoute || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>IP</dt><dd style={{ margin: 0 }}>{detail.ipAddress || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>User-Agent</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{detail.userAgent || '—'}</dd>
                            <dt style={{ color: '#64748b' }}>Reason</dt><dd style={{ margin: 0 }}>{detail.reason || '—'}</dd>
                        </dl>
                        <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Changed fields</h3>
                        {(detail.changedFields || []).length === 0 ? (
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>None</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Field</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Before</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>After</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.changedFields.map((c, i) => (
                                        <tr key={`${c.field}-${i}`}>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>{c.field}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-all' }}>{formatValue(c.from)}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', wordBreak: 'break-all' }}>{formatValue(c.to)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
