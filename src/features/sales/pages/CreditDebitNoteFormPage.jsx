import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
    createCreditDebitNote, 
    updateCreditDebitNote, 
    getCreditDebitNote,
    finalizeCreditDebitNote 
} from '@/services/creditDebitNoteApi';
import { getInvoiceSeries, getSalesInvoices, getSalesInvoiceById } from '@/services/salesApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import { numberToWords } from '@/utils/numberToWords';
import toast from 'react-hot-toast';
import VoucherEntryTallyLayout from '@/features/accounts/components/voucherEntryTally';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 4px', border: 'none', borderBottom: '1px solid #e5e7eb', borderRadius: 0, fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111827', fontWeight: 600, textAlign: 'center' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

const BLANK_ITEM = () => ({
    itemId: '',
    itemCode: '',
    itemName: '',
    description: '',
    hsnCode: '',
    uom: 'NOS',
    qty: '',
    rate: '',
    gstRate: 18,
    discountPercent: 0
});

const Field = ({ label, children, style = {} }) => <div style={style}><label style={labelStyle}>{label}</label>{children}</div>;

export default function CreditDebitNoteFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const defaultType = searchParams.get('type') || 'Credit Note';
    
    const [saving, setSaving] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [allItems, setAllItems] = useState([]);

    const [form, setForm] = useState({
        noteType: defaultType,
        noteDate: new Date().toISOString().slice(0, 10),
        seriesId: '',
        originalInvoiceId: '',
        originalInvoiceNumber: '',
        originalInvoiceDate: '',
        customerId: '',
        customerName: '',
        customerGstin: '',
        billingAddress: '',
        billingStateCode: '',
        placeOfSupply: '',
        gstType: 'CGST / SGST',
        reverseCharge: false,
        noteSupplyType: 'Regular',
        reason: '',
        items: [BLANK_ITEM()],
        freightAmount: '',
        freightGstRate: 18,
        remarks: ''
    });

    useEffect(() => {
        // Load Series
        getInvoiceSeries({ active: true }).then(s => {
            const filtered = s.filter(x => x.documentType === form.noteType);
            setSeriesList(filtered);
            if (filtered.length > 0 && !form.seriesId) {
                setForm(p => ({ ...p, seriesId: filtered[0]._id }));
            }
        });

        // Load Invoices for selection
        getSalesInvoices({ limit: 50, status: 'Confirmed' }).then(res => {
            setInvoices(res.invoices || []);
        });

        // Load Items
        getItems({ limit: 1000, active: true }).then(res => {
            setAllItems(res.data || []);
        });
    }, [form.noteType]);

    useEffect(() => {
        if (id) {
            getCreditDebitNote(id).then(data => {
                setForm({
                    ...data,
                    noteDate: data.noteDate.slice(0, 10),
                    originalInvoiceDate: data.originalInvoiceDate?.slice(0, 10) || ''
                });
            });
        }
    }, [id]);

    const handleInvoiceSelect = async (invId) => {
        if (!invId) return;
        try {
            const inv = await getSalesInvoiceById(invId);
            setForm(p => ({
                ...p,
                originalInvoiceId: inv._id,
                originalInvoiceNumber: inv.invoiceNumber,
                originalInvoiceDate: inv.invoiceDate.slice(0, 10),
                customerId: inv.customerId?._id || inv.customerId,
                customerName: inv.customerName,
                customerGstin: inv.customerGstin || '',
                billingAddress: inv.billingAddress || '',
                billingStateCode: inv.billingStateCode || '',
                placeOfSupply: inv.placeOfSupply || '',
                gstType: inv.gstType || 'CGST / SGST',
                items: inv.items.map(i => ({
                    itemId: i.itemId,
                    itemCode: i.itemCode,
                    itemName: i.itemName,
                    description: i.description,
                    hsnCode: i.hsnCode,
                    uom: i.uom,
                    qty: i.qty,
                    rate: i.rate,
                    gstRate: i.gstRate || 18,
                    discountPercent: i.discountPercent || 0
                }))
            }));
        } catch (err) {
            toast.error('Failed to load invoice details');
        }
    };

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const setItem = (i, k, v) => setForm(p => ({
        ...p,
        items: p.items.map((item, idx) => (idx === i ? { ...item, [k]: v } : item))
    }));
    const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
    const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

    // Calculations
    const isIGST = form.gstType === 'IGST';
    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const gross = qty * rate;
        const disc = Number(item.discountPercent) || 0;
        const discAmt = gross * disc / 100;
        const taxable = gross - discAmt;
        const gstRate = Number(item.gstRate) || 0;
        const cgstAmt = isIGST ? 0 : (taxable * gstRate / 200);
        const igstAmt = isIGST ? (taxable * gstRate / 100) : 0;
        return { ...item, taxable, cgstAmt, igstAmt, lineTotal: taxable + (isIGST ? igstAmt : cgstAmt * 2) };
    });

    const totalTaxable = processedItems.reduce((s, i) => s + i.taxable, 0) + (Number(form.freightAmount) || 0);
    const totalGst = processedItems.reduce((s, i) => s + (isIGST ? i.igstAmt : i.cgstAmt * 2), 0) + ((Number(form.freightAmount) || 0) * (Number(form.freightGstRate) || 0) / 100);
    const grandTotal = totalTaxable + totalGst;
    const roundedTotal = Math.round(grandTotal);

    const handleSubmit = async (finalize = false) => {
        if (!form.seriesId) return toast.error('Select Series');
        if (!form.customerName) return toast.error('Customer is required');
        
        setSaving(true);
        try {
            const payload = {
                ...form,
                items: processedItems,
                subTotal: processedItems.reduce((s, i) => s + i.taxable, 0),
                totalTaxableAmount: totalTaxable,
                totalGst,
                totalCgst: isIGST ? 0 : totalGst / 2,
                totalSgst: isIGST ? 0 : totalGst / 2,
                totalIgst: isIGST ? totalGst : 0,
                grandTotal,
                roundedTotal,
                amountInWords: numberToWords(roundedTotal)
            };

            let res;
            if (id) res = await updateCreditDebitNote(id, payload);
            else res = await createCreditDebitNote(payload);

            if (finalize) {
                await finalizeCreditDebitNote(res._id || id);
                toast.success('Note Finalized!');
            } else {
                toast.success('Note Saved as Draft');
            }
            
            navigate(form.noteType === 'Credit Note' ? PATHS.ACCOUNTS.CREDIT_NOTES : PATHS.ACCOUNTS.DEBIT_NOTES);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <VoucherEntryTallyLayout>
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{id ? 'Edit' : 'New'} {form.noteType}</h1>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={() => handleSubmit(false)} disabled={saving} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #0d9488', color: '#0d9488', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Save Draft</button>
                    <button onClick={() => handleSubmit(true)} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Finalize & Issue</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 20 }}>
                <Field label="Note Type">
                    <select value={form.noteType} onChange={e => setF('noteType', e.target.value)} style={inp}>
                        <option>Credit Note</option>
                        <option>Debit Note</option>
                    </select>
                </Field>
                <Field label="Note Date">
                    <input type="date" value={form.noteDate} onChange={e => setF('noteDate', e.target.value)} style={inp} />
                </Field>
                <Field label="Note Series">
                    <select value={form.seriesId} onChange={e => setF('seriesId', e.target.value)} style={inp}>
                        <option value="">-- Select Series --</option>
                        {seriesList.map(s => <option key={s._id} value={s._id}>{s.seriesName}</option>)}
                    </select>
                </Field>

                <Field label="Link Original Invoice">
                    <SearchableSelect 
                        options={invoices.map(inv => ({ value: inv._id, label: `${inv.invoiceNumber} (${inv.customerName})` }))}
                        value={form.originalInvoiceId}
                        onChange={handleInvoiceSelect}
                        placeholder="Search Invoice..."
                    />
                </Field>
                <Field label="Original Date">
                    <input type="date" value={form.originalInvoiceDate} readOnly style={{ ...inp, background: '#f9fafb' }} />
                </Field>
                <Field label="Reason for Issuing Note">
                    <select value={form.reason} onChange={e => setF('reason', e.target.value)} style={inp}>
                        <option value="">-- Select Reason --</option>
                        <option>Sales Return</option>
                        <option>Post Sale Discount</option>
                        <option>Deficient Quantity</option>
                        <option>Correction in Invoice</option>
                        <option>Change in POS</option>
                        <option>Other</option>
                    </select>
                </Field>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#374151' }}>ITEMS & TAXES</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {['Item', 'HSN', 'Qty', 'Rate', 'Disc%', 'Taxable', 'GST%', 'Total', ''].map(h => <th key={h} style={th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {form.items.map((item, i) => (
                            <tr key={i}>
                                <td style={{ ...td, width: '25%' }}>
                                    <SearchableSelect 
                                        options={allItems.map(it => ({ value: it._id, label: it.itemName }))}
                                        value={item.itemId}
                                        onChange={val => {
                                            const selected = allItems.find(x => x._id === val);
                                            if (selected) {
                                                setItem(i, 'itemId', selected._id);
                                                setItem(i, 'itemName', selected.itemName);
                                                setItem(i, 'hsnCode', selected.hsnCode);
                                                setItem(i, 'rate', selected.sellingPrice || 0);
                                                setItem(i, 'gstRate', selected.gstRate || 18);
                                            }
                                        }}
                                    />
                                </td>
                                <td style={td}><input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} style={inp} /></td>
                                <td style={td}><input type="number" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} style={{ ...tableInp, width: 60 }} /></td>
                                <td style={td}><input type="number" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} style={{ ...tableInp, width: 80 }} /></td>
                                <td style={td}><input type="number" value={item.discountPercent} onChange={e => setItem(i, 'discountPercent', e.target.value)} style={{ ...tableInp, width: 50 }} /></td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>₹{processedItems[i].taxable.toFixed(2)}</td>
                                <td style={td}><input type="number" value={item.gstRate} onChange={e => setItem(i, 'gstRate', e.target.value)} style={{ ...tableInp, width: 50 }} /></td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>₹{processedItems[i].lineTotal.toFixed(2)}</td>
                                <td style={td}><button onClick={() => removeItem(i)} style={{ color: '#dc2626', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button onClick={addItem} style={{ marginTop: 16, padding: '6px 12px', background: '#f0fdfa', color: '#0d9488', border: '1px dashed #0d9488', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add Item</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
                    <Field label="Remarks">
                        <textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 100 }} placeholder="Internal notes or reason for note..." />
                    </Field>
                </div>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
                    <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 13 }}>
                            <span>Subtotal</span>
                            <span>₹{processedItems.reduce((s, i) => s + i.taxable, 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 13 }}>
                            <span>Freight</span>
                            <input type="number" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={{ ...inp, width: 80, padding: '2px 6px' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                            <span>Total Taxable</span>
                            <span>₹{totalTaxable.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontSize: 13 }}>
                            <span>GST ({form.gstType})</span>
                            <span>₹{totalGst.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#16a34a', borderTop: '2px solid #16a34a', paddingTop: 10 }}>
                            <span>Grand Total</span>
                            <span>₹{roundedTotal.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </VoucherEntryTallyLayout>
    );
}
