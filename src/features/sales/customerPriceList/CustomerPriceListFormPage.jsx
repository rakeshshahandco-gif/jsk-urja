import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getCustomer } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import {
    createCustomerPriceList,
    getCustomerPriceList,
    updateCustomerPriceList,
    getProductPriceDefault,
    saveProductPriceDefault,
    getLastPriceForItem,
} from '@/services/customerPriceListApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import CustomerPartySearch from './CustomerPartySearch';
import toast from 'react-hot-toast';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const DEFAULT_QTY_BREAKS = [1, 10, 50, 100, 200, 500, 1000];

const dash = (v) => (v && String(v).trim() ? String(v).trim() : '—');

const defaultBreaks = () => DEFAULT_QTY_BREAKS.map((q) => ({ minQty: q, finalRate: '' }));

const emptyProduct = () => ({
    itemId: '',
    productName: '',
    itemCode: '',
    modelNo: '',
    description: '',
    uom: 'NOS',
    standardPrice: '',
    taxTreatment: 'Extra',
    priceSource: '',
    breaks: [],
});

const groupLinesToProducts = (lines) => {
    const map = new Map();
    for (const l of lines || []) {
        const id = String(l.itemId?._id || l.itemId || '');
        if (!id) continue;
        if (!map.has(id)) {
            map.set(id, {
                itemId: l.itemId?._id || l.itemId,
                productName: l.productName || '',
                itemCode: l.itemCode || '',
                modelNo: l.modelNo || '',
                description: l.description || '',
                uom: l.uom || 'NOS',
                standardPrice: l.standardPrice ?? '',
                taxTreatment: l.taxTreatment || 'Extra',
                priceSource: '',
                breaks: [],
            });
        }
        map.get(id).breaks.push({
            minQty: l.minQty ?? '',
            finalRate: l.finalRate === 0 || (l.finalRate !== '' && l.finalRate != null) ? l.finalRate : '',
        });
    }
    const products = [...map.values()];
    return products.length ? products : [emptyProduct()];
};

const emptyParty = {
    partyType: 'Existing Customer',
    customerId: '',
    customerName: '',
    customerCompany: '',
    customerCode: '',
    customerCity: '',
    customerGstin: '',
    customerContactName: '',
    customerPhone: '',
    customerWhatsapp: '',
    customerEmail: '',
    customerState: '',
    customerAddress: '',
};

export default function CustomerPriceListFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const [recall, setRecall] = useState({ open: false, loading: false, productIndex: null, data: null });
    const [saving, setSaving] = useState(false);
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({
        ...emptyParty,
        date: new Date().toISOString().slice(0, 10),
        effectiveFrom: new Date().toISOString().slice(0, 10),
        validUpto: '',
        currency: 'INR',
        priceType: 'Customer Specific',
        gstTreatment: 'Extra',
        freightTerms: '',
        paymentTerms: '',
        deliveryTerms: '',
        warrantyNotes: '',
        remarks: '',
        preparedBy: '',
        products: [emptyProduct()],
    });

    useEffect(() => {
        getItems({ limit: 5000, active: true, itemCategory: 'FINISHED_GOOD' }).then((res) => {
            const list = res?.data || res?.results || res || [];
            if (!Array.isArray(list)) {
                setItems([]);
                return;
            }
            const finishedVariations = ['FINISHED_GOOD', 'FINISHED', 'FINISHED GOOD', 'FINISHED GOODS'];
            const filtered = list.filter((i) =>
                finishedVariations.includes((i.itemCategory || '').trim().toUpperCase())
            );
            setItems(filtered);
        }).catch(() => setItems([]));
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        getCustomerPriceList(id).then((doc) => {
            if (doc.status !== 'Draft') {
                toast.error('Only Draft can be edited. Open the document and use Revise.');
                navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_DETAIL(id));
                return;
            }
            setForm({
                partyType: doc.partyType || (doc.customerId ? 'Existing Customer' : 'Prospect'),
                customerId: doc.customerId || '',
                customerName: doc.customerName || '',
                customerCompany: doc.customerCompany || '',
                customerCode: doc.customerCode || '',
                customerCity: doc.customerCity || '',
                customerGstin: doc.customerGstin || '',
                customerContactName: doc.customerContactName || '',
                customerPhone: doc.customerPhone || '',
                customerWhatsapp: doc.customerWhatsapp || '',
                customerEmail: doc.customerEmail || '',
                customerState: doc.customerState || '',
                customerAddress: doc.customerAddress || '',
                date: doc.date ? String(doc.date).slice(0, 10) : '',
                effectiveFrom: doc.effectiveFrom ? String(doc.effectiveFrom).slice(0, 10) : '',
                validUpto: doc.validUpto ? String(doc.validUpto).slice(0, 10) : '',
                currency: doc.currency || 'INR',
                priceType: doc.priceType || 'Customer Specific',
                gstTreatment: doc.gstTreatment || 'Extra',
                freightTerms: doc.freightTerms || '',
                paymentTerms: doc.paymentTerms || '',
                deliveryTerms: doc.deliveryTerms || '',
                warrantyNotes: doc.warrantyNotes || '',
                remarks: doc.remarks || '',
                preparedBy: doc.preparedBy || '',
                products: groupLinesToProducts(doc.lines),
            });
        }).catch(() => toast.error('Failed to load price list'));
    }, [id, isEdit, navigate]);

    const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
    const setProduct = (i, patch) => setForm((p) => ({
        ...p,
        products: p.products.map((prod, idx) => (idx === i ? { ...prod, ...patch } : prod)),
    }));
    const setBreak = (pi, bi, patch) => setForm((p) => ({
        ...p,
        products: p.products.map((prod, idx) => (
            idx === pi
                ? { ...prod, breaks: prod.breaks.map((b, j) => (j === bi ? { ...b, ...patch } : b)) }
                : prod
        )),
    }));

    const onExistingSelect = async (c) => {
        try {
            const full = await getCustomer(c.id);
            const primary = full.contactPersons?.find((p) => p.isPrimary) || full.contactPersons?.[0] || {};
            setForm((p) => ({
                ...p,
                partyType: 'Existing Customer',
                customerId: full._id || c.id,
                customerName: full.customerName || c.customerName || '',
                customerCompany: full.company || c.company || '',
                customerCode: full.customerCode || c.customerCode || '',
                customerCity: full.city || c.city || '',
                customerGstin: full.gstNumber || c.gstin || '',
                customerContactName: primary.name || full.customerName || '',
                customerPhone: primary.mobile || c.phone || '',
                customerWhatsapp: primary.whatsApp || primary.mobile || '',
                customerEmail: full.companyEmail || primary.email || c.email || '',
                customerState: full.state || c.state || '',
                customerAddress: full.address || c.billingAddress || '',
            }));
        } catch {
            setForm((p) => ({
                ...p,
                partyType: 'Existing Customer',
                customerId: c.id,
                customerName: c.customerName || '',
                customerCompany: c.company || c.name || '',
                customerCode: c.customerCode || '',
                customerCity: c.city || '',
                customerGstin: c.gstin || '',
                customerContactName: c.customerName || '',
                customerPhone: c.phone || '',
                customerWhatsapp: c.phone || '',
                customerEmail: c.email || '',
                customerState: c.state || '',
                customerAddress: c.billingAddress || '',
            }));
        }
    };

    const filledBreaks = (prod) => (prod.breaks || [])
        .filter((b) => b.finalRate !== '' && b.finalRate != null)
        .map((b) => ({ minQty: Number(b.minQty), rate: Number(b.finalRate) }))
        .filter((b) => b.minQty > 0 && Number.isFinite(b.rate) && b.rate >= 0)
        .sort((a, b) => a.minQty - b.minQty);

    const onItem = async (val, i) => {
        const it = items.find((x) => String(x._id) === String(val));
        if (!it) return;
        const snapshot = {
            itemId: it._id,
            productName: it.itemName || '',
            itemCode: it.itemCode || '',
            modelNo: it.modelNo || '',
            description: it.productDescription || it.description || '',
            uom: it.uom || 'NOS',
            standardPrice: Number(it.sellingPrice) || 0,
            taxTreatment: form.gstTreatment || 'Extra',
            priceSource: '',
            breaks: defaultBreaks(),
        };
        setProduct(i, snapshot);
        try {
            const def = await getProductPriceDefault({
                itemId: it._id,
                currency: form.currency || 'INR',
            });
            const saved = (def?.breaks || []).filter((b) => b.rate != null && b.rate !== '' && Number.isFinite(Number(b.rate)));
            if (def?.found && saved.length) {
                setProduct(i, {
                    breaks: saved
                        .slice()
                        .sort((a, b) => Number(a.minQty) - Number(b.minQty))
                        .map((b) => ({ minQty: b.minQty, finalRate: b.rate })),
                    priceSource: 'Default Product Price',
                });
            }
        } catch {
            /* keep blank qty rows */
        }
    };

    const saveAsDefault = async (pi) => {
        const prod = form.products[pi];
        if (!prod?.itemId) return toast.error('Select a product first');
        const breaks = filledBreaks(prod);
        if (!breaks.length) return toast.error('Enter at least one Qty and Rate first');
        if (!window.confirm('Save these Qty/Rate breaks as the default price for this product?')) return;
        try {
            await saveProductPriceDefault({
                itemId: prod.itemId,
                currency: form.currency || 'INR',
                breaks,
                sourcePriceListId: id || undefined,
            });
            setProduct(pi, { priceSource: 'Default Product Price' });
            toast.success('Saved as default product price');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not save default price');
        }
    };

    const openRecall = async (pi) => {
        const prod = form.products[pi];
        if (!prod?.itemId) return toast.error('Select a product first');
        setRecall({ open: true, loading: true, productIndex: pi, data: null });
        try {
            const data = await getLastPriceForItem({
                itemId: prod.itemId,
                excludeId: id || undefined,
            });
            setRecall({ open: true, loading: false, productIndex: pi, data });
        } catch (e) {
            setRecall({ open: false, loading: false, productIndex: null, data: null });
            toast.error(e?.response?.data?.message || 'Could not load last price');
        }
    };

    const useRecalledPrices = () => {
        const pi = recall.productIndex;
        const rows = (recall.data?.breaks || []).filter((b) => b.finalRate !== '' && b.finalRate != null);
        if (pi == null || !rows.length) {
            toast.error('No prices to copy');
            return;
        }
        const who = [recall.data.customerCompany, recall.data.customerName].filter(Boolean).join(' · ') || '—';
        const when = recall.data.date ? new Date(recall.data.date).toLocaleDateString('en-IN') : '—';
        setProduct(pi, {
            breaks: rows.map((b) => ({ minQty: b.minQty, finalRate: b.finalRate })),
            priceSource: `Recalled from ${recall.data.priceListNo || ''} ${recall.data.version || ''} — ${who} — ${when}`,
        });
        setRecall({ open: false, loading: false, productIndex: null, data: null });
    };

    const save = async () => {
        if (form.partyType === 'Existing Customer' && !form.customerId) {
            return toast.error('Select an existing customer');
        }
        if (form.partyType === 'Prospect' && !form.customerName.trim() && !form.customerCompany.trim()) {
            return toast.error('Enter person name or company name');
        }
        const filled = [];
        const seen = new Map();
        for (const p of form.products) {
            if (!p.itemId) continue;
            for (const b of p.breaks || []) {
                if (b.finalRate === '' || b.finalRate == null) continue;
                const qty = Number(b.minQty);
                const rate = Number(b.finalRate);
                if (!(qty > 0)) return toast.error('Filled rows need a Qty greater than 0');
                if (!Number.isFinite(rate) || rate < 0) return toast.error('Filled rows need a Rate of 0 or more');
                const key = `${String(p.itemId)}:${qty}`;
                if (seen.has(key)) return toast.error(`Duplicate Qty ${qty} for ${p.productName || p.itemCode}`);
                seen.set(key, true);
                filled.push({
                    itemId: p.itemId,
                    productName: p.productName || '',
                    itemCode: p.itemCode || '',
                    modelNo: p.modelNo || '',
                    description: p.description || '',
                    uom: p.uom || 'NOS',
                    minQty: qty,
                    offeredRate: rate,
                    discountPercent: 0,
                    finalRate: rate,
                    taxTreatment: form.gstTreatment === 'Included' ? 'Included' : 'Extra',
                    standardPrice: p.standardPrice,
                });
            }
        }
        if (!filled.length) return toast.error('Enter at least one Qty and Rate');
        filled.sort((a, b) => {
            const ia = String(a.itemId);
            const ib = String(b.itemId);
            if (ia !== ib) return ia.localeCompare(ib);
            return a.minQty - b.minQty;
        });
        setSaving(true);
        try {
            const payload = {
                ...form,
                customerId: form.partyType === 'Prospect' ? null : form.customerId,
                validUpto: form.validUpto || null,
                lines: filled,
            };
            delete payload.products;
            const doc = isEdit
                ? await updateCustomerPriceList(id, payload)
                : await createCustomerPriceList(payload);
            toast.success('Draft saved');
            navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_DETAIL(doc._id));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const isProspect = form.partyType === 'Prospect';
    const selectedLabel = [form.customerCompany, form.customerName, form.customerCode].filter(Boolean).join(' · ');

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ margin: '0 0 16px', fontSize: 22 }}>{isEdit ? 'Edit Price List' : 'New Price List'}</h1>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ marginBottom: 14 }}>
                    <label style={label}>Price List For</label>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, fontWeight: 600 }}>
                        {['Existing Customer', 'Prospect'].map((t) => (
                            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="partyType"
                                    checked={form.partyType === t}
                                    onChange={() => setForm((p) => ({
                                        ...p,
                                        ...emptyParty,
                                        partyType: t,
                                        date: p.date,
                                        effectiveFrom: p.effectiveFrom,
                                        validUpto: p.validUpto,
                                        currency: p.currency,
                                        priceType: p.priceType,
                                        gstTreatment: p.gstTreatment,
                                        freightTerms: p.freightTerms,
                                        paymentTerms: p.paymentTerms,
                                        deliveryTerms: p.deliveryTerms,
                                        warrantyNotes: p.warrantyNotes,
                                        remarks: p.remarks,
                                        preparedBy: p.preparedBy,
                                        products: p.products,
                                    }))}
                                />
                                {t === 'Prospect' ? 'New / Prospect' : t}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {!isProspect && (
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={label}>Customer</label>
                            <CustomerPartySearch valueLabel={selectedLabel} onSelect={onExistingSelect} />
                        </div>
                    )}
                    {isProspect && (
                        <>
                            <div><label style={label}>Contact Person Name</label><input value={form.customerName} onChange={(e) => setF('customerName', e.target.value)} style={inp} /></div>
                            <div><label style={label}>Company Name</label><input value={form.customerCompany} onChange={(e) => setF('customerCompany', e.target.value)} style={inp} /></div>
                            <div><label style={label}>Mobile No.</label><input value={form.customerPhone} onChange={(e) => setF('customerPhone', e.target.value)} style={inp} /></div>
                            <div><label style={label}>WhatsApp No.</label><input value={form.customerWhatsapp} onChange={(e) => setF('customerWhatsapp', e.target.value)} style={inp} /></div>
                            <div><label style={label}>Email</label><input value={form.customerEmail} onChange={(e) => setF('customerEmail', e.target.value)} style={inp} /></div>
                            <div><label style={label}>City</label><input value={form.customerCity} onChange={(e) => setF('customerCity', e.target.value)} style={inp} /></div>
                            <div><label style={label}>State</label><input value={form.customerState} onChange={(e) => setF('customerState', e.target.value)} style={inp} /></div>
                            <div><label style={label}>GSTIN (optional)</label><input value={form.customerGstin} onChange={(e) => setF('customerGstin', e.target.value)} style={inp} /></div>
                            <div style={{ gridColumn: 'span 2' }}><label style={label}>Address (optional)</label><input value={form.customerAddress} onChange={(e) => setF('customerAddress', e.target.value)} style={inp} /></div>
                        </>
                    )}
                    <div><label style={label}>Date</label><input type="date" value={form.date} onChange={(e) => setF('date', e.target.value)} style={inp} /></div>
                    <div>
                        <label style={label}>Price Type</label>
                        <select value={form.priceType} onChange={(e) => setF('priceType', e.target.value)} style={inp}>
                            {['Customer Specific', 'Standard', 'Dealer', 'OEM', 'Project', 'Export'].map((t) => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div><label style={label}>Effective From</label><input type="date" value={form.effectiveFrom} onChange={(e) => setF('effectiveFrom', e.target.value)} style={inp} /></div>
                    <div><label style={label}>Valid Upto</label><input type="date" value={form.validUpto} onChange={(e) => setF('validUpto', e.target.value)} style={inp} /></div>
                    <div><label style={label}>Currency</label><input value={form.currency} onChange={(e) => setF('currency', e.target.value)} style={inp} /></div>
                    <div>
                        <label style={label}>GST Treatment</label>
                        <select value={form.gstTreatment} onChange={(e) => setF('gstTreatment', e.target.value)} style={inp}>
                            <option value="Extra">GST extra</option>
                            <option value="Included">GST included</option>
                        </select>
                    </div>
                    <div><label style={label}>Freight Terms</label><input value={form.freightTerms} onChange={(e) => setF('freightTerms', e.target.value)} style={inp} /></div>
                    <div><label style={label}>Payment Terms</label><input value={form.paymentTerms} onChange={(e) => setF('paymentTerms', e.target.value)} style={inp} /></div>
                    <div><label style={label}>Delivery Terms</label><input value={form.deliveryTerms} onChange={(e) => setF('deliveryTerms', e.target.value)} style={inp} /></div>
                    <div><label style={label}>Prepared By</label><input value={form.preparedBy} onChange={(e) => setF('preparedBy', e.target.value)} style={inp} /></div>
                    <div style={{ gridColumn: 'span 2' }}><label style={label}>Warranty / Notes</label><input value={form.warrantyNotes} onChange={(e) => setF('warrantyNotes', e.target.value)} style={inp} /></div>
                    <div style={{ gridColumn: 'span 2' }}><label style={label}>Remarks</label><input value={form.remarks} onChange={(e) => setF('remarks', e.target.value)} style={inp} /></div>
                </div>

                {!isProspect && form.customerId && (
                    <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <div><strong>Name:</strong> {form.customerName || '—'}</div>
                        <div><strong>Company:</strong> {form.customerCompany || '—'}</div>
                        <div><strong>Code:</strong> {form.customerCode || '—'}</div>
                        <div><strong>Mobile:</strong> {form.customerPhone || '—'}</div>
                        <div><strong>Email:</strong> {form.customerEmail || '—'}</div>
                        <div><strong>City:</strong> {form.customerCity || '—'}</div>
                        <div><strong>GSTIN:</strong> {form.customerGstin || '—'}</div>
                        <div style={{ gridColumn: 'span 1' }}><strong>Address:</strong> {form.customerAddress || '—'}</div>
                    </div>
                )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 4, color: '#334155' }}>Products</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                    Finished Goods only. After you select a product, optional Qty breaks appear. Fill only the rates you want to offer. Blank rates are ignored.
                </div>
                {(form.products || []).map((prod, pi) => (
                    <div key={pi} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1, minWidth: 240 }}>
                                <label style={label}>Product</label>
                                <SearchableSelect
                                    options={items.map((it) => ({
                                        value: it._id,
                                        label: `${it.itemCode} — ${it.itemName}`,
                                        meta: `${it.itemCode} ${it.itemName || ''} ${it.modelNo || ''} ${it.productDescription || it.description || ''}`,
                                    }))}
                                    value={prod.itemId}
                                    onChange={(v) => onItem(v, pi)}
                                    placeholder="Finished Good..."
                                />
                            </div>
                            {form.products.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setForm((p) => ({ ...p, products: p.products.filter((_, idx) => idx !== pi) }))}
                                    style={{ border: 0, background: 'none', color: '#dc2626', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 18 }}
                                >
                                    Remove product
                                </button>
                            )}
                        </div>
                        {!!prod.itemId && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13, color: '#334155', marginBottom: 10 }}>
                                    <div><span style={label}>Product Name</span>{dash(prod.productName)}</div>
                                    <div><span style={label}>Model No.</span>{dash(prod.modelNo)}</div>
                                    <div><span style={label}>Item Code / SKU</span>{dash(prod.itemCode)}</div>
                                    <div style={{ gridColumn: 'span 3' }}><span style={label}>Item Description</span>{dash(prod.description)}</div>
                                </div>
                                {!!prod.priceSource && (
                                    <div style={{ fontSize: 12, color: '#0f766e', marginBottom: 8 }}>
                                        Price Source: {prod.priceSource}
                                    </div>
                                )}
                                <table style={{ width: '100%', maxWidth: 420, borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                            <th style={{ padding: '6px 8px', fontSize: 11, textTransform: 'uppercase' }}>Qty</th>
                                            <th style={{ padding: '6px 8px', fontSize: 11, textTransform: 'uppercase' }}>Rate</th>
                                            <th style={{ width: 36 }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(prod.breaks || []).map((b, bi) => (
                                            <tr key={bi}>
                                                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                                                    <input type="number" min="1" value={b.minQty} onChange={(e) => setBreak(pi, bi, { minQty: e.target.value })} style={inp} />
                                                    {Number(b.minQty) === 1 && (
                                                        <div style={{ fontSize: 11, color: '#0f766e', marginTop: 4 }}>1 pcs — Sample / Small Qty</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                                                    <input type="number" min="0" value={b.finalRate} onChange={(e) => setBreak(pi, bi, { finalRate: e.target.value })} style={inp} placeholder="optional" />
                                                </td>
                                                <td style={{ padding: '4px 0', verticalAlign: 'top' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setProduct(pi, { breaks: prod.breaks.filter((_, j) => j !== bi) })}
                                                        style={{ border: 0, background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '8px 4px' }}
                                                        title="Remove qty"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => setProduct(pi, { breaks: [...(prod.breaks || []), { minQty: '', finalRate: '' }] })}
                                        style={{ border: 0, background: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        + Add Qty
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openRecall(pi)}
                                        style={{ border: 0, background: 'none', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Recall Last Price
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => saveAsDefault(pi)}
                                        style={{ border: 0, background: 'none', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Save Current Prices as Default
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, products: [...p.products, emptyProduct()] }))}
                    style={{ marginTop: 4, border: 0, background: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer' }}
                >
                    + Add product
                </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LISTS)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 0, background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save Draft'}</button>
            </div>

            {recall.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 440, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.15)' }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>Recall Last Price</div>
                        {recall.loading && <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>}
                        {!recall.loading && !recall.data?.found && (
                            <div style={{ fontSize: 13, color: '#64748b' }}>No previous Price List found for this product.</div>
                        )}
                        {!recall.loading && recall.data?.found && (
                            <>
                                <div style={{ fontSize: 13, color: '#334155', marginBottom: 10 }}>
                                    <div><strong>Last Price List:</strong> {recall.data.priceListNo} {recall.data.version}</div>
                                    <div><strong>Date:</strong> {recall.data.date ? new Date(recall.data.date).toLocaleDateString('en-IN') : '—'}</div>
                                    <div><strong>Customer:</strong> {[recall.data.customerCompany, recall.data.customerName].filter(Boolean).join(' · ') || '—'}</div>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                            <th style={{ padding: '6px 0' }}>Qty</th>
                                            <th style={{ padding: '6px 0', textAlign: 'right' }}>Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(recall.data.breaks || []).map((b, i) => (
                                            <tr key={i}>
                                                <td style={{ padding: '4px 0' }}>{b.minQty}</td>
                                                <td style={{ padding: '4px 0', textAlign: 'right' }}>
                                                    ₹{Number(b.finalRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <button
                                type="button"
                                onClick={() => setRecall({ open: false, loading: false, productIndex: null, data: null })}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            {recall.data?.found && (
                                <button
                                    type="button"
                                    onClick={useRecalledPrices}
                                    style={{ padding: '8px 12px', borderRadius: 8, border: 0, background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Use These Prices
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
