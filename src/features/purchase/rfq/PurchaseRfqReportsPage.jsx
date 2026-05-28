import React, { useEffect, useState } from 'react';
import { getRfqReports } from '@/services/purchaseRfqApi';

export default function PurchaseRfqReportsPage() {
    const [summary, setSummary] = useState(null);
    const [pendingRfqs, setPendingRfqs] = useState([]);
    const [converted, setConverted] = useState([]);

    useEffect(() => {
        getRfqReports().then(setSummary);
        getRfqReports({ report: 'rfq-pending' }).then((d) => setPendingRfqs(d.rfqs || []));
        getRfqReports({ report: 'converted-po' }).then((d) => setConverted(d.rfqs || []));
    }, []);

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>RFQ Reports</h1>
            {summary && (
                <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                    {[
                        ['RFQ Pending', summary.rfqPending],
                        ['Awaiting Comparison', summary.quotPending],
                        ['Converted to PO', summary.converted],
                    ].map(([label, val]) => (
                        <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, minWidth: 160 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
                            <div style={{ fontSize: 28, fontWeight: 800 }}>{val ?? 0}</div>
                        </div>
                    ))}
                </div>
            )}
            <h2 style={{ marginTop: 28, fontSize: 16 }}>RFQ Pending</h2>
            <ReportTable rows={pendingRfqs} cols={['rfqNumber', 'status', 'rfqDate']} />
            <h2 style={{ marginTop: 28, fontSize: 16 }}>Converted to PO</h2>
            <ReportTable rows={converted} cols={['rfqNumber', 'status', 'rfqDate']} />
        </div>
    );
}

function ReportTable({ rows, cols }) {
    return (
        <table style={{ width: '100%', background: '#fff', borderRadius: 12, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f9fafb' }}>{cols.map((c) => <th key={c} style={{ padding: 10, textAlign: 'left' }}>{c}</th>)}</tr></thead>
            <tbody>
                {rows.length === 0 ? <tr><td colSpan={cols.length} style={{ padding: 20, color: '#9ca3af' }}>No records</td></tr> : rows.map((r) => (
                    <tr key={r._id}>{cols.map((c) => <td key={c} style={{ padding: 10 }}>{c.includes('Date') && r[c] ? new Date(r[c]).toLocaleDateString('en-IN') : r[c]}</td>)}</tr>
                ))}
            </tbody>
        </table>
    );
}
