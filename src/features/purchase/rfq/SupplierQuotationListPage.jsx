import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSupplierQuotations } from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

export default function SupplierQuotationListPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const rfqId = searchParams.get('rfqId') || '';
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getSupplierQuotations({ rfqId: rfqId || undefined, limit: 100 })
            .then((d) => setRows(d.quotations || []))
            .catch(() => toast.error('Failed to load quotations'))
            .finally(() => setLoading(false));
    }, [rfqId]);

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Supplier Quotations</h1>
            {rfqId && (
                <button type="button" onClick={() => navigate(`${PATHS.PURCHASE.SUPPLIER_QUOTATIONS}/new?rfqId=${rfqId}`)}
                    style={{ marginBottom: 16, padding: '8px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    + Enter Quotation for this RFQ
                </button>
            )}
            {loading ? <p>Loading…</p> : (
                <table style={{ width: '100%', background: '#fff', borderRadius: 12, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                        {['RFQ', 'Supplier', 'Quotation No', 'Date', 'Status', 'PO'].map((h) => <th key={h} style={{ padding: 10, textAlign: 'left' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No quotations</td></tr> : rows.map((q) => (
                            <tr key={q._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${PATHS.PURCHASE.SUPPLIER_QUOTATIONS}/edit/${q._id}`)}>
                                <td style={{ padding: 10 }}>{q.rfqNumber}</td>
                                <td style={{ padding: 10 }}>{q.supplierName}</td>
                                <td style={{ padding: 10 }}>{q.quotationNo || '—'}</td>
                                <td style={{ padding: 10 }}>{q.quotationDate ? new Date(q.quotationDate).toLocaleDateString('en-IN') : '—'}</td>
                                <td style={{ padding: 10 }}>{q.status}</td>
                                <td style={{ padding: 10 }}>{q.convertedPoNumber || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
