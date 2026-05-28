import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getPurchaseRfqById, upsertSupplierQuotation, getSupplierQuotationById } from '@/services/purchaseRfqApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

export default function SupplierQuotationFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const [searchParams] = useSearchParams();
    const rfqIdParam = searchParams.get('rfqId') || '';
    const navigate = useNavigate();
    const [rfq, setRfq] = useState(null);
    const [form, setForm] = useState({
        rfqId: rfqIdParam,
        supplierId: '',
        quotationNo: '',
        quotationDate: new Date().toISOString().slice(0, 10),
        validTill: '',
        paymentTerms: '',
        deliveryTime: '',
        freightPackingForwarding: 0,
        gstExtraInclusive: 'Extra',
        warranty: '',
        remarks: '',
        items: [],
    });

    useEffect(() => {
        const rid = form.rfqId || rfqIdParam;
        if (!rid) return;
        getPurchaseRfqById(rid).then((d) => {
            const r = d.rfq || d;
            setRfq(r);
            if (!isEdit) {
                setForm((p) => ({
                    ...p,
                    rfqId: r._id,
                    items: (r.items || []).map((it) => ({
                        rfqItemId: it._id,
                        itemId: it.itemId,
                        itemCode: it.itemCode,
                        itemDescription: it.itemName,
                        requiredQty: it.requiredQty,
                        quotedQty: it.requiredQty,
                        rate: 0,
                        discountPercent: 0,
                        taxPercent: 0,
                        deliveryDays: 0,
                        makeBrand: it.makeBrand || '',
                        supplierRemarks: '',
                    })),
                }));
            }
        });
    }, [form.rfqId, rfqIdParam, isEdit]);

    useEffect(() => {
        if (!isEdit) return;
        getSupplierQuotationById(id).then((q) => {
            const data = q.data || q;
            setForm({
                rfqId: data.rfqId,
                supplierId: data.supplierId,
                quotationNo: data.quotationNo || '',
                quotationDate: data.quotationDate ? new Date(data.quotationDate).toISOString().slice(0, 10) : '',
                validTill: data.validTill ? new Date(data.validTill).toISOString().slice(0, 10) : '',
                paymentTerms: data.paymentTerms || '',
                deliveryTime: data.deliveryTime || '',
                freightPackingForwarding: data.freightPackingForwarding || 0,
                gstExtraInclusive: data.gstExtraInclusive || 'Extra',
                warranty: data.warranty || '',
                remarks: data.remarks || '',
                items: data.items || [],
            });
        });
    }, [id, isEdit]);

    const setLine = (idx, key, val) => {
        setForm((p) => {
            const items = [...p.items];
            items[idx] = { ...items[idx], [key]: val };
            return { ...p, items };
        });
    };

    const save = async () => {
        if (!form.supplierId) return toast.error('Select supplier');
        try {
            await upsertSupplierQuotation({ ...form, status: 'Received' });
            toast.success('Quotation saved');
            navigate(`${PATHS.PURCHASE.SUPPLIER_QUOTATIONS}?rfqId=${form.rfqId}`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        }
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{isEdit ? 'Edit' : 'Enter'} Supplier Quotation</h1>
            {rfq && <p style={{ color: '#64748b' }}>RFQ: {rfq.rfqNumber}</p>}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                    <label>Supplier
                        <select value={form.supplierId} onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }}>
                            <option value="">— Select —</option>
                            {(rfq?.suppliers || []).map((s) => (
                                <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>
                            ))}
                        </select>
                    </label>
                    <label>Quotation No<input value={form.quotationNo} onChange={(e) => setForm((p) => ({ ...p, quotationNo: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Quotation Date<input type="date" value={form.quotationDate} onChange={(e) => setForm((p) => ({ ...p, quotationDate: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Valid Till<input type="date" value={form.validTill} onChange={(e) => setForm((p) => ({ ...p, validTill: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Payment Terms<input value={form.paymentTerms} onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Delivery Time<input value={form.deliveryTime} onChange={(e) => setForm((p) => ({ ...p, deliveryTime: e.target.value }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                    <label>Freight<input type="number" value={form.freightPackingForwarding} onChange={(e) => setForm((p) => ({ ...p, freightPackingForwarding: Number(e.target.value) }))} style={{ width: '100%', padding: 8, marginTop: 4 }} /></label>
                </div>
                <table style={{ width: '100%', marginTop: 16, fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                        {['Item', 'Req Qty', 'Quoted Qty', 'Rate', 'Disc %', 'Tax %', 'Delivery Days', 'Brand'].map((h) => (
                            <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {form.items.map((ln, idx) => (
                            <tr key={idx}>
                                <td style={{ padding: 6 }}>{ln.itemDescription || ln.itemCode}</td>
                                <td style={{ padding: 6 }}>{ln.requiredQty}</td>
                                <td style={{ padding: 6 }}><input type="number" value={ln.quotedQty} onChange={(e) => setLine(idx, 'quotedQty', Number(e.target.value))} style={{ width: 70, padding: 4 }} /></td>
                                <td style={{ padding: 6 }}><input type="number" value={ln.rate} onChange={(e) => setLine(idx, 'rate', Number(e.target.value))} style={{ width: 80, padding: 4 }} /></td>
                                <td style={{ padding: 6 }}><input type="number" value={ln.discountPercent} onChange={(e) => setLine(idx, 'discountPercent', Number(e.target.value))} style={{ width: 60, padding: 4 }} /></td>
                                <td style={{ padding: 6 }}><input type="number" value={ln.taxPercent} onChange={(e) => setLine(idx, 'taxPercent', Number(e.target.value))} style={{ width: 60, padding: 4 }} /></td>
                                <td style={{ padding: 6 }}><input type="number" value={ln.deliveryDays} onChange={(e) => setLine(idx, 'deliveryDays', Number(e.target.value))} style={{ width: 60, padding: 4 }} /></td>
                                <td style={{ padding: 6 }}><input value={ln.makeBrand || ''} onChange={(e) => setLine(idx, 'makeBrand', e.target.value)} style={{ width: 90, padding: 4 }} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button type="button" onClick={save} style={{ marginTop: 16, padding: '10px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save Quotation</button>
            </div>
        </div>
    );
}
