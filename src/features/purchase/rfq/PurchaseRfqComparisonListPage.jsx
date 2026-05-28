import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseRfqs } from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';

/** Pick an RFQ to open the comparison screen. */
export default function PurchaseRfqComparisonListPage() {
    const navigate = useNavigate();
    const [rfqs, setRfqs] = useState([]);

    useEffect(() => {
        getPurchaseRfqs({ status: 'Quotation Received', limit: 100 }).then((d) => {
            const list = d.rfqs || [];
            if (list.length === 0) {
                return getPurchaseRfqs({ limit: 100 }).then((d2) => setRfqs((d2.rfqs || []).filter((r) => ['Quotation Received', 'Compared', 'Sent'].includes(r.status))));
            }
            setRfqs(list);
        });
    }, []);

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Quotation Comparison</h1>
            <p style={{ color: '#64748b' }}>Select an RFQ to compare supplier quotations</p>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 20 }}>
                {rfqs.map((r) => (
                    <li key={r._id} style={{ marginBottom: 8 }}>
                        <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_COMPARISON(r._id))}
                            style={{ width: '100%', textAlign: 'left', padding: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                            {r.rfqNumber} — {r.status} ({r.suppliers?.length || 0} suppliers)
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
