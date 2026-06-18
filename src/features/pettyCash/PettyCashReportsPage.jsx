import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { pettyCashApi } from '@/services/pettyCashApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 };

const REPORT_TYPES = [
    { id: 'book', label: 'Petty Cash Book' },
    { id: 'daily', label: 'Daily Report' },
    { id: 'monthly', label: 'Monthly Report' },
    { id: 'account_head', label: 'Account Head Wise' },
    { id: 'voucher', label: 'Voucher Wise' },
    { id: 'bill', label: 'Bill Wise' },
    { id: 'missing_attachments', label: 'Missing Attachment Report' },
];

export default function PettyCashReportsPage() {
    const { selectedFY } = useFinancialYear();
    const [reportType, setReportType] = useState('book');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await pettyCashApi.getReport({
                financialYear: selectedFY,
                reportType,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
            });
            setData(result);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Report failed');
        } finally {
            setLoading(false);
        }
    }, [selectedFY, reportType, fromDate, toDate]);

    useEffect(() => { load(); }, [load]);

    const exportExcel = async () => {
        try {
            const blob = await pettyCashApi.exportReport({
                financialYear: selectedFY,
                reportType,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `petty-cash-report-${selectedFY}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Export failed');
        }
    };

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
    const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Petty Cash Reports</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>FY {selectedFY}</p>

            <div style={card}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {REPORT_TYPES.map((t) => (
                        <button key={t.id} type="button" onClick={() => setReportType(t.id)} style={{
                            padding: '6px 12px', borderRadius: 8, border: reportType === t.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                            background: reportType === t.id ? '#eff6ff' : '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                        }}>{t.label}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
                    <div><label style={{ fontSize: 11, color: '#64748b' }}>From</label><input type="date" style={inp} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                    <div><label style={{ fontSize: 11, color: '#64748b' }}>To</label><input type="date" style={inp} value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
                    <button type="button" onClick={load} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
                    <button type="button" onClick={exportExcel} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Export Excel</button>
                </div>
            </div>

            {data?.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                    {[
                        ['Opening', data.summary.openingBalance],
                        ['Receipts', data.summary.totalReceipt],
                        ['Payments', data.summary.totalPayment],
                        ['Closing', data.summary.closingBalance],
                    ].map(([k, v]) => (
                        <div key={k} style={card}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{k}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{fmtAmt(v)}</div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ ...card, padding: 0, overflow: 'auto' }}>
                {loading ? <p style={{ padding: 20, color: '#94a3b8' }}>Loading…</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                        <thead><tr style={{ background: '#f9fafb' }}>
                            {['Date', 'Voucher No', 'Bill No', 'Account Head', 'Payment', 'Receipt', 'Balance', 'Remarks'].map((h) => (
                                <th key={h} style={{ padding: 10, textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                            ))}
                        </tr></thead>
                        <tbody>
                            {(data?.rows || []).map((e) => (
                                <tr key={e._id}>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{fmt(e.date)}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.externalVoucherNo || '—'}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.billNo || '—'}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.accountHead || '—'}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.payment ? fmtAmt(e.payment) : '—'}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.receipt ? fmtAmt(e.receipt) : '—'}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{fmtAmt(e.balance)}</td>
                                    <td style={{ padding: 10, fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{e.remarks || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
