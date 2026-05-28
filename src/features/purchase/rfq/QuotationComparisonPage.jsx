import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getRfqComparison,
    saveRfqSelection,
    approvePurchaseRfq,
    convertRfqToPo,
} from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

export default function QuotationComparisonPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [wholeSupplierId, setWholeSupplierId] = useState('');
    const [recommendationReason, setRecommendationReason] = useState('');
    const [approvalRemarks, setApprovalRemarks] = useState('');

    const load = () => {
        getRfqComparison(id).then(setData).catch((e) => toast.error(e.response?.data?.message || 'Load failed'));
    };

    useEffect(() => { load(); }, [id]);

    if (!data) return <div style={{ padding: 40 }}>Loading comparison…</div>;

    const { rfq, matrix, suppliers } = data;

    const saveSelection = async () => {
        try {
            await saveRfqSelection(id, {
                wholeSupplierId: wholeSupplierId || null,
                lineSelections: [],
                recommendedSupplierId: wholeSupplierId || null,
                recommendationReason,
            });
            toast.success('Selection saved');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        }
    };

    const approve = async () => {
        try {
            await approvePurchaseRfq(id, { approvalRemarks });
            toast.success('Approved');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Approve failed');
        }
    };

    const convert = async () => {
        if (!window.confirm('Convert selected quotation to Purchase Order(s)? Stock is not updated until GRN.')) return;
        try {
            const res = await convertRfqToPo(id);
            const pos = res.purchaseOrders || [];
            toast.success(`Created ${pos.length} PO(s): ${pos.map((p) => p.poNumber).join(', ')}`);
            navigate(PATHS.PURCHASE.ORDERS);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Conversion failed');
        }
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <button type="button" onClick={() => navigate(PATHS.PURCHASE.RFQ_DETAIL(id))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>← {rfq.rfqNumber}</button>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Quotation Comparison</h1>
            <p style={{ color: '#64748b' }}>Compare supplier rates and convert to Purchase Order</p>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={{ padding: 10, textAlign: 'left' }}>Item</th>
                            <th style={{ padding: 10 }}>Req Qty</th>
                            {(suppliers || []).map((s) => (
                                <th key={s.supplierId} colSpan={3} style={{ padding: 10, borderLeft: '2px solid #e5e7eb' }}>{s.supplierName}</th>
                            ))}
                            <th style={{ padding: 10 }}>Lowest Rate</th>
                            <th style={{ padding: 10 }}>Lowest Landed</th>
                        </tr>
                        <tr style={{ background: '#fafafa', fontSize: 11 }}>
                            <th colSpan={2} />
                            {(suppliers || []).map((s) => (
                                <React.Fragment key={`h-${s.supplierId}`}>
                                    <th style={{ padding: 4 }}>Rate</th>
                                    <th style={{ padding: 4 }}>Landed</th>
                                    <th style={{ padding: 4 }}>Days</th>
                                </React.Fragment>
                            ))}
                            <th colSpan={2} />
                        </tr>
                    </thead>
                    <tbody>
                        {(matrix || []).map((row) => (
                            <tr key={row.rfqItemId}>
                                <td style={{ padding: 10, fontWeight: 600 }}>{row.itemName}<br /><span style={{ color: '#94a3b8' }}>{row.itemCode}</span></td>
                                <td style={{ padding: 10, textAlign: 'center' }}>{row.requiredQty} {row.uom}</td>
                                {(suppliers || []).map((s) => {
                                    const cell = row.suppliers?.[String(s.supplierId)];
                                    return (
                                        <React.Fragment key={s.supplierId}>
                                            <td style={{ padding: 8, textAlign: 'right', background: cell?.rate === row.lowestBasicRate ? '#f0fdf4' : undefined }}>{cell?.rate ?? '—'}</td>
                                            <td style={{ padding: 8, textAlign: 'right', background: cell?.netRate === row.lowestLandedCost ? '#f0fdf4' : undefined }}>{cell?.netRate ?? '—'}</td>
                                            <td style={{ padding: 8, textAlign: 'center' }}>{cell?.deliveryDays ?? '—'}</td>
                                        </React.Fragment>
                                    );
                                })}
                                <td style={{ padding: 8, fontWeight: 700 }}>{row.lowestBasicRate ?? '—'}</td>
                                <td style={{ padding: 8, fontWeight: 700 }}>{row.lowestLandedCost ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Select supplier (all items)</h3>
                <select value={wholeSupplierId} onChange={(e) => setWholeSupplierId(e.target.value)} style={{ width: '100%', maxWidth: 400, padding: 8 }}>
                    <option value="">— Select supplier —</option>
                    {(suppliers || []).map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                </select>
                <textarea placeholder="Recommendation reason" value={recommendationReason} onChange={(e) => setRecommendationReason(e.target.value)} rows={2} style={{ width: '100%', marginTop: 10, padding: 8 }} />
                <button type="button" onClick={saveSelection} style={{ marginTop: 10, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save Selection</button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                <h3 style={{ marginTop: 0 }}>Approval &amp; convert to PO</h3>
                <textarea placeholder="Approval remarks" value={approvalRemarks} onChange={(e) => setApprovalRemarks(e.target.value)} rows={2} style={{ width: '100%', padding: 8, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={approve} style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                    <button type="button" onClick={convert} style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Convert to Purchase Order</button>
                </div>
                {rfq.approvedAt && <p style={{ marginTop: 12, color: '#16a34a', fontSize: 13 }}>Approved on {new Date(rfq.approvedAt).toLocaleString('en-IN')}</p>}
            </div>
        </div>
    );
}
