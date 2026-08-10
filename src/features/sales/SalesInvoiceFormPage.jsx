import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createSalesInvoice, getSalesOrderById, getInvoiceSeries, createInvoiceSeries, previewNextInvoiceNo } from '@/services/salesApi';
import { createEwayBillDraft } from '@/services/ewayBillApi';
import { getItems } from '@/services/itemApi';
import { getCustomers, getCustomer } from '@/services/customerApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import { numberToWords } from '@/utils/numberToWords';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { scanEntryApi } from '@/services/scanEntryApi';
import gridStyles from '@/features/sales/styles/salesOrderItemGrid.module.scss';
import api from '@/services/api';
import GstinStatusWarningModal from '@/features/sales/components/GstinStatusWarningModal';
import { useAuth } from '@/hooks/useAuth';


const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const tableInp = { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#111827', fontWeight: 600, textAlign: 'center' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };
const lbl = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' };

// E-Way Bill threshold (CGST Rule 138) — invoices at/above this need an EWB.
const EWAY_BILL_THRESHOLD = 50000;

const BLANK_ITEM = () => ({
    itemId: '',
    salesOrderLineId: null,
    itemCode: '',
    itemName: '',
    modelNo: '',
    description: '',
    additionalNotes: '',
    hsnCode: '',
    uom: 'NOS',
    qty: '',
    rate: '',
    gstRate: 18,
    discountPercent: 0,
    saleType: 'MANUFACTURED_SALE'
});

const Section = ({ title, children }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{title}</h3>
        {children}
    </div>
);
const Grid = ({ cols = 3, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
const Field = ({ label, children, style = {} }) => <div style={style}><label style={labelStyle}>{label}</label>{children}</div>;

const AddSeriesModal = ({ isOpen, onClose, onSave }) => {
    const [submitting, setSubmitting] = useState(false);
    const [data, setData] = useState({
        seriesName: '',
        financialYear: '2025-26',
        prefix: '',
        startNumber: 1,
        padLength: 5,
        gstApplicable: true,
        isDefault: false,
        documentType: 'Tax Invoice'
    });

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!data.seriesName || !data.financialYear || !data.prefix) return toast.error('Name, FY and Prefix are required');
        setSubmitting(true);
        try {
            const res = await createInvoiceSeries(data);
            toast.success('Series created!');
            onSave(res);
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to create series');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 450, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>+ Create New Invoice Series</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="Series Name *" style={{ gridColumn: 'span 2' }}>
                        <input value={data.seriesName} onChange={e => setData(p => ({ ...p, seriesName: e.target.value }))} style={inp} placeholder="e.g. GST/SALE" />
                    </Field>
                    <Field label="Prefix (Unique) *">
                        <input value={data.prefix} onChange={e => setData(p => ({ ...p, prefix: e.target.value }))} style={inp} placeholder="GST" />
                    </Field>
                    <Field label="Financial Year *">
                        <input value={data.financialYear} onChange={e => setData(p => ({ ...p, financialYear: e.target.value }))} style={inp} placeholder="2025-26" />
                    </Field>
                    <Field label="Start Number">
                        <input type="number" value={data.startNumber} onChange={e => setData(p => ({ ...p, startNumber: e.target.value }))} style={inp} />
                    </Field>
                    <Field label="Digits Padding">
                        <input type="number" value={data.padLength} onChange={e => setData(p => ({ ...p, padLength: e.target.value }))} style={inp} />
                    </Field>
                    <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 4 }}>
                        <input type="checkbox" checked={data.gstApplicable} onChange={e => setData(p => ({ ...p, gstApplicable: e.target.checked }))} style={{ width: 16, height: 16 }} />
                        <span style={{ fontWeight: 600 }}>GST Applicable (Enabled by default)</span>
                    </label>
                    <Field label="Document Type *" style={{ gridColumn: 'span 2' }}>
                        <select 
                            value={data.documentType} 
                            onChange={e => {
                                const val = e.target.value;
                                setData(p => ({ 
                                    ...p, 
                                    documentType: val, 
                                    gstApplicable: val === 'Estimate' ? false : p.gstApplicable 
                                }));
                            }} 
                            style={{ ...inp, fontWeight: 700 }}
                        >
                            <option value="Tax Invoice">Tax Invoice</option>
                            <option value="Estimate">Estimate (Non-GST)</option>
                            <option value="Credit Note">Credit Note</option>
                            <option value="Debit Note">Debit Note</option>
                            <option value="Delivery Challan">Delivery Challan</option>
                        </select>
                    </Field>
                </div>
                <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) onClose(); }} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={handleSave} disabled={submitting} style={{ padding: '8px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                        {submitting ? 'Creating...' : 'ADD & CONTINUE'}
                    </button>
                </div>
            </div>
        </div>
    );
};

function isEstimateSeriesDoc(s) {
    return s?.isEstimate === true || s?.documentType === 'Estimate';
}

export default function SalesInvoiceFormPage({ listMode = 'invoice' }) {
    const isEstimateForm = listMode === 'estimate';
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { isFeatureEnabled } = useFeatureSettings();
    const { selectedFY } = useFinancialYear();
    const { hasPermission } = useAuth();
    const scanEntryEnabled = isFeatureEnabled('accounting.enableAiSmartImport');
    const soId = searchParams.get('soId') || searchParams.get('sold');
    const [saving, setSaving] = useState(false);
    const [gstWarning, setGstWarning] = useState(null);
    const [gstSnapshot, setGstSnapshot] = useState(null);
    const [gstBusy, setGstBusy] = useState(false);
    const pendingSubmitRef = useRef(false);
    const gstDecisionRef = useRef(null); // { confirmedB2c, override }
    const [uploadingScan, setUploadingScan] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
    const [previewInvoiceNo, setPreviewInvoiceNo] = useState('');
    /** Sales Order series to apply once Tax Invoice series list is ready */
    const soSeriesPrefRef = useRef({ id: '', name: '' });

    // Fetch accurate next invoice number from backend (self-healing sync)
    const fetchPreviewNo = async (seriesId) => {
        if (!seriesId) { setPreviewInvoiceNo(''); return; }
        try {
            const res = await previewNextInvoiceNo(seriesId, 'SalesInvoice');
            setPreviewInvoiceNo(res.nextInvoiceNo || '');
        } catch { setPreviewInvoiceNo(''); }
    };
    const [showAddSeries, setShowAddSeries] = useState(false);
    const [form, setForm] = useState({
        invoiceDate: new Date().toISOString().slice(0, 10),
        seriesId: '',
        soId: soId || '',
        soNumber: '',
        orderType: '',
        dispatchThrough: '',
        buyerOrderNo: '',
        buyerOrderDate: '',
        paymentDueDate: '',
        customerName: '',
        customerId: '',
        customerGstin: '',
        customerPhone: '',
        billingState: '',
        billingStateCode: '',
        shippingAddress: '',
        shippingCity: '',
        shippingState: '',
        shippingStateCode: '',
        shippingPostalCode: '',
        shippingCountry: 'India',
        shippingGstin: '',
        shippingPhone: '',
        gstType: 'CGST / SGST',
        placeOfSupply: '',
        paymentType: 'Credit',
        paymentTerms: '',
        gstApplicable: true,
        freightGstRate: 0,
        referralDetails: {
            sourceType: 'Direct',
            salespersonId: null,
            distributorId: null,
            incentiveApplicable: false,
            incentiveType: 'Percentage of sales',
            incentiveValue: 0,
        },
        remarks: '',
        items: [BLANK_ITEM()],
    });

    const [allItems, setAllItems] = useState([]);
    const [allCustomers, setAllCustomers] = useState([]);

    useEffect(() => {
        // Pre-load all active items (inclusive of all saleable categories)
        getItems({ limit: 5000, active: true }).then(res => {
            const list = res?.data || res?.results || res || [];
            if (Array.isArray(list)) {
                const sorted = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setAllItems(sorted);
            }
        }).catch(e => console.error('Error loading items:', e));

        // Customer list API enforces limit <= 100 — page until complete.
        (async () => {
            try {
                const pageSize = 100;
                let page = 1;
                let all = [];
                let totalPages = 1;
                do {
                    const res = await getCustomers({ limit: pageSize, page });
                    const list = res?.results || res?.data || [];
                    if (Array.isArray(list) && list.length) all = all.concat(list);
                    totalPages = Number(res?.totalPages) || page;
                    if (!Array.isArray(list) || list.length < pageSize) break;
                    page += 1;
                } while (page <= totalPages && page <= 50);
                setAllCustomers(all);
            } catch (e) {
                console.error('Error loading customers:', e);
            }
        })();
    }, []);

    useEffect(() => {
        const state = (form.billingState || '').trim().toLowerCase();
        const code = (form.billingStateCode || '').trim();
        const isMH = state === 'maharashtra' || code === '27';
        const newGst = isMH ? 'CGST / SGST' : ((state || code) ? 'IGST' : form.gstType);
        if (newGst !== form.gstType) setF('gstType', newGst);
    }, [form.billingState, form.billingStateCode]);

    const loadSeries = useCallback(() => {
        getInvoiceSeries({ active: true }).then(async s => {
            const all = s || [];
            const list = isEstimateForm
                ? all.filter(isEstimateSeriesDoc)
                : all.filter((x) => !isEstimateSeriesDoc(x));
            setSeriesList(list);

            // From Sales Order: pull the same series the SO used (by id, then by name).
            if (soId) {
                const prefId = String(soSeriesPrefRef.current.id || '').trim();
                const prefName = String(soSeriesPrefRef.current.name || '').trim().toLowerCase();
                let match = null;
                if (prefId) {
                    match = list.find((x) => String(x._id) === prefId) || null;
                }
                if (!match && prefName) {
                    match = list.find(
                        (x) => String(x.seriesName || '').trim().toLowerCase() === prefName
                    ) || null;
                }
                if (match) {
                    const matchId = String(match._id);
                    const gstOn = isEstimateForm
                        ? false
                        : (match.gstApplicable !== undefined ? match.gstApplicable !== false : true);
                    setForm((p) => {
                        if (String(p.seriesId || '') === matchId) return p;
                        return { ...p, seriesId: matchId, gstApplicable: p.gstApplicable !== undefined ? p.gstApplicable : gstOn };
                    });
                    await fetchPreviewNo(matchId);
                }
                return;
            }

            if (!form.seriesId && list.length > 0) {
                const autoSelect = isEstimateForm
                    ? (list.find((x) => x.isDefault) || list[0])
                    : list.find((x) => x.isDefaultForTaxInvoice);
                if (autoSelect) {
                    const gstOn = isEstimateForm
                        ? false
                        : (autoSelect.gstApplicable !== undefined ? autoSelect.gstApplicable : true);
                    setForm((p) => ({ ...p, seriesId: String(autoSelect._id), gstApplicable: gstOn }));
                    await fetchPreviewNo(autoSelect._id);
                } else {
                    toast.error(
                        isEstimateForm
                            ? 'Please create an active Estimate series in Invoice Series master.'
                            : 'Please set default series in Series Master.',
                        { id: 'inv-no-default' }
                    );
                }
            }
        }).catch(() => { });
    }, [form.seriesId, soId, isEstimateForm]);

    useEffect(() => {
        loadSeries();
    }, [loadSeries]);

    useEffect(() => {
        if (!soId) return;
        getSalesOrderById(soId).then(so => {
            // Inherit series from the Sales Order — so.seriesId may be populated (object) or raw id.
            const soSeries = so.seriesId && typeof so.seriesId === 'object' ? so.seriesId : null;
            const soSeriesId = String(soSeries?._id || so.seriesId || '').trim();
            const soSeriesName = String(
                soSeries?.seriesName || so.seriesName || ''
            ).trim();
            soSeriesPrefRef.current = { id: soSeriesId, name: soSeriesName };

            if (soSeriesId) fetchPreviewNo(soSeriesId);
            setForm(p => ({
                ...p,
                soId,
                soNumber: so.soNumber,
                seriesId: soSeriesId || p.seriesId,
                customerName: so.customerName,
                customerId: so.customerId || '',
                customerGstin: so.customerGstin || '',
                customerPhone: so.customerPhone || '',
                billingAddress: so.billingAddress || '',
                billingState: so.customerState || '',
                billingStateCode: so.customerStateCode || '',
                shippingAddress: so.shippingAddress || '',
                gstType: so.gstType || 'CGST / SGST',
                gstApplicable: so.gstApplicable !== undefined ? so.gstApplicable : true,
                buyerOrderNo: so.customerPO || '',
                buyerOrderDate: so.customerPODate ? so.customerPODate.slice(0, 10) : '',
                paymentType: so.paymentType || 'Credit',
                remarks: so.remarks || '',
                freightAmount: so.freightAmount || '',
                freightGstRate: so.freightGstRate || 0,
                referralDetails: so.referralDetails || {
                    sourceType: 'Direct',
                    salespersonId: null,
                    distributorId: null,
                    incentiveApplicable: false,
                    incentiveType: 'Percentage of sales',
                    incentiveValue: 0,
                },
                items: so.items?.length ? so.items.map(i => {
                    const lineBilling = (so.billingState?.lines || []).find(
                        (l) => String(l.lineId) === String(i._id)
                    );
                    const remaining = lineBilling != null
                        ? Number(lineBilling.remainingQty)
                        : Number(i.qty) || 0;
                    return {
                    itemId: i.itemId || null,
                    salesOrderLineId: i._id || null,
                    itemCode: i.itemCode || i.code || i.sku || '', 
                    itemName: i.itemName || i.name || '', 
                    modelNo: i.modelNo || '', 
                    description: i.description || i.productDescription || i.itemName || i.name || '',
                    additionalNotes: i.additionalNotes || i.itemNotes || i.notes || i.addNotes || i.remark || '', 
                    hsnCode: i.hsnCode || '', 
                    uom: i.uom || 'NOS', 
                    qty: remaining > 0 ? remaining : (i.qty || ''),
                    rate: i.rate || '', 
                    gstRate: so.gstApplicable === false ? 0 : (i.gstRate || 18), 
                    discountPercent: 0,
                    saleType: i.saleType || 'MANUFACTURED_SALE'
                };
                }).filter((row) => Number(row.qty) > 0) : [BLANK_ITEM()],
            }));

            // Series list may already be loaded — re-apply SO series into the dropdown now.
            getInvoiceSeries({ active: true }).then(async (all) => {
                const list = isEstimateForm
                    ? (all || []).filter(isEstimateSeriesDoc)
                    : (all || []).filter((x) => !isEstimateSeriesDoc(x));
                setSeriesList(list);
                let match = list.find((x) => String(x._id) === soSeriesId) || null;
                if (!match && soSeriesName) {
                    const nameKey = soSeriesName.toLowerCase();
                    match = list.find(
                        (x) => String(x.seriesName || '').trim().toLowerCase() === nameKey
                    ) || null;
                }
                if (match) {
                    const matchId = String(match._id);
                    setForm((p) => ({ ...p, seriesId: matchId }));
                    await fetchPreviewNo(matchId);
                }
            }).catch(() => {});
        }).catch(() => toast.error('Failed to load SO details'));
    }, [soId, isEstimateForm]);

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const setItem = (i, k, v) => setForm(p => ({
        ...p,
        items: p.items.map((item, idx) => (idx === i ? { ...item, [k]: v } : item))
    }));
    const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
    const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

    const handleItemSelect = (val, index) => {
        const selected = allItems.find(it => it._id === val);
        if (!selected) return;
        setForm(p => {
            const items = p.items.map((item, idx) => {
                if (idx !== index) return item;
                const rate = selected.standardRate || selected.rate || selected.sellingPrice || selected.salesPrice || 0;
                return {
                    ...item,
                    itemId: selected._id,
                    itemCode: selected.itemCode || selected.code || '',
                    itemName: selected.itemName || selected.name || '',
                    description: selected.description || selected.productDescription || selected.itemName || selected.name || '',
                    modelNo: selected.modelNo || '',
                    hsnCode: selected.hsnCode || '',
                    uom: selected.uom || 'NOS',
                    rate,
                    gstRate: selected.taxRate || selected.salesGst || selected.gstRate || 18,
                    qty: item.qty || 1,
                    additionalNotes: item.additionalNotes || '',
                    saleType: selected.itemCategory === 'TRADING' ? 'TRADING_SALE' : 'MANUFACTURED_SALE'
                };
            });
            return { ...p, items };
        });
    };

    const resolveGstForForm = async ({ forceRefresh = false, customerId, gstin, invoiceDate } = {}) => {
        const cid = customerId || form.customerId;
        const g = gstin || form.customerGstin;
        const d = invoiceDate || form.invoiceDate;
        if (!g || String(g).trim().length < 15) {
            setGstWarning(null);
            setGstSnapshot(null);
            return null;
        }
        try {
            setGstBusy(true);
            const { data } = await api.post('/gst-verification/resolve-transaction', {
                customerId: cid,
                gstin: g,
                transactionDate: d,
                documentType: 'Sales Invoice',
                forceRefresh,
            });
            const res = data?.data;
            if (!res) return null;
            const snap = {
                gstinUsed: res.gstin,
                gstLegalNameSnapshot: res.verification?.legalName || '',
                gstTradeNameSnapshot: res.verification?.tradeName || '',
                gstStatusSnapshot: res.currentPortalStatus || '',
                gstStatusOnTransactionDate: res.statusOnTransactionDate || '',
                gstRegistrationTypeSnapshot: res.verification?.registrationType || '',
                gstTreatmentSnapshot: res.recommendedGSTTreatment || '',
                gstr1CategorySnapshot: res.recommendedReturnCategory || '',
                cancellationDateSnapshot: res.cancellationDate || null,
                verificationDateSnapshot: res.verification?.fetchedAt || null,
                verificationProviderSnapshot: res.verification?.providerName || '',
                gstHistoryId: res.sourceHistoryId || null,
                decisionReason: res.resolutionReason || '',
                manualOverride: false,
                overrideReason: '',
            };
            setGstSnapshot(snap);
            if (res.statusOnTransactionDate === 'Cancelled' || res.requiresUserConfirmation) {
                setGstWarning({ ...res, invoiceDate: d });
            } else {
                setGstWarning(null);
            }
            return res;
        } catch (e) {
            // Provider absent / permission — do not block invoice; no false cancellation
            console.warn('[GST verify]', e?.response?.data?.message || e.message);
            return null;
        } finally {
            setGstBusy(false);
        }
    };

    const handleCustomerSelect = async (customerId) => {
        const selected = allCustomers.find(c => c._id === customerId);
        if (!selected) return;

        try {
            // Fetch full customer details to get referral info
            const fullCustomer = await getCustomer(customerId);
            setForm(p => ({
                ...p,
                customerName: fullCustomer.name,
                customerId: customerId,
                customerGstin: fullCustomer.gstin || fullCustomer.gstNumber || '',
                customerPhone: fullCustomer.mobile || '',
                billingAddress: fullCustomer.billingAddress || '',
                billingState: fullCustomer.state || '',
                billingStateCode: fullCustomer.stateCode || '',
                shippingAddress: fullCustomer.shippingAddress || fullCustomer.billingAddress || '',
                referralDetails: fullCustomer.referralDetails || {
                    sourceType: 'Direct',
                    salespersonId: null,
                    distributorId: null,
                    incentiveApplicable: false,
                    incentiveType: 'Percentage of sales',
                    incentiveValue: 0,
                }
            }));
            await resolveGstForForm({
                customerId,
                gstin: fullCustomer.gstin || fullCustomer.gstNumber || '',
                invoiceDate: form.invoiceDate,
            });
        } catch (error) {
            toast.error('Failed to load customer details');
        }
    };

    // Live totals
    const isIGST = form.gstType === 'IGST';
    const gstApplicable = form.gstApplicable !== false;

    const processedItems = form.items.map(item => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.rate) || 0;
        const gross = qty * rate;
        const disc = Number(item.discountPercent) || 0;
        const discAmt = Math.round(gross * disc / 100 * 100) / 100;
        const taxable = gross - discAmt;
        const gstRate = gstApplicable ? (Number(item.gstRate) || 18) : 0;
        const cgstAmt = isIGST ? 0 : Math.round(taxable * gstRate / 2 / 100 * 100) / 100;
        const igstAmt = isIGST ? Math.round(taxable * gstRate / 100 * 100) / 100 : 0;
        return { ...item, gross, discAmt, taxable, cgstAmt, igstAmt, lineTotal: taxable + (gstApplicable ? (isIGST ? igstAmt : cgstAmt * 2) : 0) };
    });
    const totalItemTaxable = processedItems.reduce((s, i) => s + i.taxable, 0);
    const totalItemGst = gstApplicable ? processedItems.reduce((s, i) => s + (isIGST ? i.igstAmt : i.cgstAmt * 2), 0) : 0;

    const freight = Number(form.freightAmount) || 0;
    
    // Add freight to taxable amount
    const totalTaxable = totalItemTaxable + freight;

    // Use first item's GST rate if available, else default to 18
    const freightGstRate = gstApplicable ? (Number(form.freightGstRate) || (processedItems[0]?.gstRate || 18)) : 0;
    const freightGst = gstApplicable ? Math.round(freight * freightGstRate / 100 * 100) / 100 : 0;

    const totalGst = totalItemGst + freightGst;
    
    const grandTotal = totalTaxable + totalGst;
    const roundedTotal = Math.round(grandTotal);

    // ── Keyboard Navigation ───────────────────────────────────────────────
    const handleRowKeyDown = (e, rowIdx, colIdx) => {
        if (e.key === 'ArrowDown') {
            const next = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`);
            if (next) {
                e.preventDefault();
                next.focus();
            } else if (rowIdx === form.items.length - 1 && form.items[rowIdx].itemId) {
                addItem();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            const nextColTargets = [1, 3, 4, 5, 6, 7]; // Inputs only (Disc%/GST% hidden from row UI; values still in form/calc)
            const currentTargetIdx = nextColTargets.indexOf(colIdx);
            
            if (currentTargetIdx < nextColTargets.length - 1) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColTargets[currentTargetIdx + 1]}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
                if (rowIdx < form.items.length - 1) {
                    const nextRowCol1 = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="1"]`);
                    if (nextRowCol1) {
                        e.preventDefault();
                        nextRowCol1.focus();
                    }
                } else {
                    addItem();
                }
            }
        }
    };

    const handleSubmit = async () => {
        if (!form.seriesId) return toast.error('⚠️ Please select an Invoice Series. The invoice number is generated from the selected series.');
        
        const selectedSeries = seriesList.find(s => s._id === form.seriesId);
        const isEstimate = selectedSeries?.isEstimate === true || selectedSeries?.documentType === 'Estimate';
        if (isEstimate && form.gstApplicable === true) {
            return toast.error('Estimate document is non-GST document and cannot be included in GSTR-1 or GSTR-3B. Please disable GST or use a Tax Invoice series.');
        }

        if (!form.customerName) return toast.error('Customer name is required');
        if (form.items.some(i => !i.itemName || !i.qty || !i.rate)) return toast.error('All items need name, qty, and rate');

        if (form.customerGstin && String(form.customerGstin).length >= 15) {
            const res = await resolveGstForForm({ forceRefresh: false });
            const decided = gstDecisionRef.current;
            const confirmedB2c = decided?.confirmedB2c || ['B2C', 'B2CS', 'B2CL'].includes(String(gstSnapshot?.gstr1CategorySnapshot || ''));
            const overridden = decided?.override || gstSnapshot?.manualOverride;
            if (res && (res.statusOnTransactionDate === 'Cancelled' || res.requiresUserConfirmation) && !overridden && !confirmedB2c) {
                pendingSubmitRef.current = true;
                setGstWarning({ ...res, invoiceDate: form.invoiceDate });
                return;
            }
        }

        setSaving(true);
        try {
            const payload = {
                ...form,
                gstApplicable: isEstimate ? false : gstApplicable,
                gstVerificationSnapshot: gstSnapshot || undefined,
                items: processedItems.map(i => {
                    const itemGstRate = gstApplicable ? (Number(i.gstRate) || 18) : 0;
                    return {
                        itemId: i.itemId,
                        salesOrderLineId: i.salesOrderLineId || null,
                        itemCode: i.itemCode,
                        itemName: i.itemName,
                        modelNo: i.modelNo,
                        description: i.description,
                        additionalNotes: i.additionalNotes,
                        hsnCode: i.hsnCode,
                        uom: i.uom,
                        qty: Number(i.qty),
                        rate: Number(i.rate),
                        saleType: i.saleType || 'MANUFACTURED_SALE',
                        gstRate: itemGstRate,
                        discountPercent: Number(i.discountPercent) || 0,
                        discountAmount: Number(i.discAmt) || 0,
                        taxableAmount: Number(i.taxable) || 0,
                        cgstRate: isIGST ? 0 : itemGstRate / 2,
                        cgstAmount: gstApplicable ? (Number(i.cgstAmt) || 0) : 0,
                        sgstRate: isIGST ? 0 : itemGstRate / 2,
                        sgstAmount: gstApplicable ? (Number(i.cgstAmt) || 0) : 0,
                        igstRate: isIGST ? itemGstRate : 0,
                        igstAmount: gstApplicable ? (Number(i.igstAmt) || 0) : 0,
                        totalAmount: Number(i.lineTotal) || 0,
                    };
                }),
                totalQty: form.items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0),
                subTotal: totalItemTaxable,
                totalTaxableAmount: totalTaxable,
                totalCgst: isIGST ? 0 : totalGst / 2,
                totalSgst: isIGST ? 0 : totalGst / 2,
                totalIgst: isIGST ? totalGst : 0,
                totalGst: totalGst,
                freightAmount: freight,
                freightGstAmount: freightGst,
                grandTotal: grandTotal,
                roundedTotal: roundedTotal,
                roundOff: Number((roundedTotal - grandTotal).toFixed(2)),
                amountInWords: numberToWords(roundedTotal)
            };
            const resBody = await createSalesInvoice(payload);
            const inv = resBody?.data || resBody;
            if (resBody?.soOverInvoice?.overInvoiced) {
                const msg =
                    resBody.warning ||
                    resBody.soOverInvoice.warnings?.[0]?.message ||
                    'Warning: Invoice quantity exceeds Sales Order remaining quantity.';
                toast(msg, { icon: '⚠️', duration: 8000 });
            }
            toast.success('Invoice created!');

            // E-Way Bill reminder: prompt only for GST tax invoices above the threshold.
            const needsEwb = !isEstimateForm && form.gstApplicable === true && Number(roundedTotal) >= EWAY_BILL_THRESHOLD;
            if (needsEwb) {
                const proceed = window.confirm(
                    `E-Way Bill Required\n\n` +
                    `Invoice Value: ₹${Number(roundedTotal).toLocaleString('en-IN')}\n` +
                    `Threshold: ₹${EWAY_BILL_THRESHOLD.toLocaleString('en-IN')}\n\n` +
                    `This invoice is above the E-Way Bill limit. ` +
                    `Please insert transport details for Part A / Part B.\n\n` +
                    `Click OK to open the E-Way Bill draft now, or Cancel to skip for later.`
                );
                if (proceed) {
                    try {
                        const draftRes = await createEwayBillDraft(inv._id);
                        const draft = draftRes?.data || draftRes;
                        if (draft && draft._id) {
                            navigate(PATHS.EWAY_BILL.DRAFT(draft._id));
                            return;
                        }
                    } catch (err) {
                        toast.error('Could not open E-Way Bill draft. You can create it later from the invoice page.');
                    }
                }
            }
            navigate(PATHS.SALES.INVOICE_DETAIL(inv._id));
        } catch (e) {
            const msg = e.code === 'ECONNABORTED'
                ? 'Request timed out — the invoice may still have been created. Check the invoice list.'
                : (e.response?.data?.message || 'Create failed');
            toast.error(msg);
        }
        finally { setSaving(false); }
    };

    const onUploadSalesScan = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingScan(true);
        try {
            const d = await scanEntryApi.upload({ file, moduleType: 'sales_invoice', financialYear: selectedFY });
            toast.success('Scan draft uploaded');
            navigate(PATHS.DOCUMENTS.SCAN_ENTRY_REVIEW(d?._id || d?.id));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Scan upload failed');
        } finally {
            setUploadingScan(false);
            e.target.value = '';
        }
    };


    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(isEstimateForm ? PATHS.SALES.ESTIMATES : PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← {isEstimateForm ? 'Sales Estimates' : 'Sales Invoices'}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                        {isEstimateForm
                            ? '📄 New Sales Estimate'
                            : (form.gstApplicable ? '🧾 New GST Tax Invoice' : '📄 New Estimate / Non-GST Document')}
                    </h1>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {scanEntryEnabled && (
                            <label style={{ padding: '8px 14px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 7, cursor: uploadingScan ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: uploadingScan ? 0.7 : 1 }}>
                                {uploadingScan ? 'Uploading…' : 'Upload / Import Sales Data / Customer PO'}
                                <input type="file" accept=".pdf,image/*" onChange={onUploadSalesScan} style={{ display: 'none' }} disabled={uploadingScan} />
                            </label>
                        )}
                        <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                            {saving ? 'Creating...' : '✓ Create Invoice'}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px 24px', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                {/* PRIMARY HEADER INFO (TALLY STYLE) */}
                <div style={{ background: '#fff', border: '1px solid #1e293b', borderLeft: '8px solid #0d9488', borderRadius: '8px 12px 12px 8px', padding: '20px', marginBottom: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                    <Field label="Invoice Series">
                        <div style={{ display: 'flex', gap: 6 }}>
                            <select value={String(form.seriesId || '')} onChange={async e => {
                                const val = e.target.value;
                                const selected = seriesList.find(s => String(s._id) === String(val));
                                const isEstimate = selected?.isEstimate === true || selected?.documentType === 'Estimate';
                                const isGst = isEstimate ? false : (selected ? (selected.gstApplicable !== false) : true);
                                
                                await fetchPreviewNo(val);
                                setForm(p => ({
                                    ...p,
                                    seriesId: val,
                                    gstApplicable: isGst,
                                    items: p.items.map(item => ({
                                        ...item,
                                        gstRate: isGst ? (item.gstRate || 18) : 0
                                    })),
                                    freightGstRate: isGst ? (p.freightGstRate || 18) : 0
                                }));
                                if (isEstimate) toast.success('Estimate series selected. GST automatically disabled.', { icon: 'ℹ️' });
                            }}
                                style={{ ...inp, cursor: 'pointer', fontWeight: 700, fontSize: 14, borderColor: !form.seriesId ? '#fca5a5' : '#1e293b' }}
                            >
                                <option value="">-- Select Series --</option>
                                {seriesList.map(s => <option key={s._id} value={String(s._id)}>{s.seriesName} ({s.prefix})</option>)}
                            </select>
                            <button type="button" onClick={() => setShowAddSeries(true)} style={{ width: 32, height: 35, background: '#f8fafc', border: '1px solid #1e293b', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Add Series">＋</button>
                        </div>
                        {(() => {
                            const s = seriesList.find(x => x._id === form.seriesId);
                            return (s?.isEstimate === true || s?.documentType === 'Estimate') && (
                                <div style={{ marginTop: 6, fontSize: 10, color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    ⚠️ Non-GST Document (Excluded from Returns)
                                </div>
                            );
                        })()}
                        {previewInvoiceNo && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#0d9488', fontFamily: 'monospace', background: '#f0fdfa', border: '2px solid #0d9488', padding: '6px 14px', borderRadius: 8, display: 'inline-block', boxShadow: '0 2px 4px rgba(13,148,136,0.1)' }}>
                                    NO: {previewInvoiceNo}
                                </div>
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginLeft: 2 }}>System Generated Serial Number</span>
                            </div>
                        )}
                    </Field>
                    
                    <Field label="Invoice Date *">
                        <input type="date" value={form.invoiceDate} onChange={e => setF('invoiceDate', e.target.value)} style={{ ...inp, fontWeight: 700, fontSize: 14, border: '1px solid #1e293b' }} />
                    </Field>

                    <Field label="Customer (Buyer) *">
                        <SearchableSelect
                            options={(() => {
                                const base = allCustomers.map(c => ({
                                    value: c._id,
                                    label: `${c.name} ${c.gstin ? `(${c.gstin})` : ''}`,
                                    meta: `${c.name} ${c.gstin || ''} ${c.mobile || ''}`
                                }));
                                // If current selection is not in list (e.g. pagination), add it
                                if (form.customerId && !base.find(b => b.value === form.customerId)) {
                                    base.unshift({
                                        value: form.customerId,
                                        label: `${form.customerName} ${form.customerGstin ? `(${form.customerGstin})` : ''}`,
                                        meta: ''
                                    });
                                }
                                return base;
                            })()}
                            value={form.customerId}
                            onChange={handleCustomerSelect}
                            placeholder="Search Customer..."
                            style={{ ...inp, fontWeight: 700, fontSize: 14, border: '1px solid #1e293b' }}
                        />
                        {form.customerGstin && <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontWeight: 600 }}>GSTIN: {form.customerGstin}</div>}
                    </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
                    {/* Secondary Details (Compact) */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Shipment & Payment Info</span>
                            {soId && <span style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>SO: {form.soNumber}</span>}
                        </div>
                        <Grid cols={3}>
                            <Field label="Payment Type">
                                <select value={form.paymentType} onChange={e => setF('paymentType', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }}>
                                    <option>Credit</option><option>Cash</option>
                                </select>
                            </Field>
                            <Field label="Due Date"><input type="date" value={form.paymentDueDate || ''} onChange={e => setF('paymentDueDate', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                            <Field label="Dispatch Thru"><input value={form.dispatchThrough} onChange={e => setF('dispatchThrough', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} placeholder="Road/Courier" /></Field>
                        </Grid>
                    </div>

                    {/* Address & GST (Compact) */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '15px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Supply Details</span>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{form.gstType}</span>
                        </div>
                        <Grid cols={2}>
                            <Field label="GSTIN"><input value={form.customerGstin} onChange={e => setF('customerGstin', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                            <Field label="State Code"><input value={form.billingStateCode} onChange={e => setF('billingStateCode', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} /></Field>
                        </Grid>
                    </div>
                </div>

                {/* Items */}
                <Section title="Items">
                    <div className={gridStyles.wrap}>
                        <table className={gridStyles.table}>
                            <thead>
                                <tr>
                                    <th className={`${gridStyles.th} ${gridStyles.colSr}`}>Sr</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colCode}`}>Item Code</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colDesc}`}>Description *</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colNotes}`}>Additional Notes</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colHsn}`}>HSN</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colUom}`}>UOM</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colQty} ${gridStyles.center}`}>Qty *</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colRate} ${gridStyles.num}`}>Rate *</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colAmount} ${gridStyles.num}`}>Amount</th>
                                    <th className={`${gridStyles.th} ${gridStyles.colAction}`} />
                                </tr>
                            </thead>
                            <tbody>
                                {processedItems.map((item, i) => (
                                    <tr key={i}>
                                        <td className={`${gridStyles.td} ${gridStyles.colSr}`} style={{ color: '#94a3b8' }}>{i + 1}</td>
                                        <td className={`${gridStyles.td} ${gridStyles.colCode}`}>
                                            <SearchableSelect
                                                options={(() => {
                                                    const base = allItems.map(it => ({ 
                                                        value: it._id, 
                                                        label: `${it.itemCode} — ${it.itemName || ''}`, 
                                                        meta: `${it.itemCode} ${it.itemName || ''} ${it.description || ''} ${it.hsnCode || ''}` 
                                                    }));
                                                    if (item.itemId && !base.find(b => b.value === item.itemId)) {
                                                        base.unshift({
                                                            value: item.itemId,
                                                            label: `${item.itemCode} — ${item.itemName}`,
                                                            meta: ''
                                                        });
                                                    }
                                                    return base;
                                                })()}
                                                value={item.itemId}
                                                onChange={v => handleItemSelect(v, i)}
                                                onKeyDown={(e) => handleRowKeyDown(e, i, 1)}
                                                data-row={i}
                                                data-col={1}
                                                placeholder="Item Code..."
                                            />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colDesc}`}>
                                            <input value={item.description || item.itemName || ''} readOnly className={`${gridStyles.inp} ${gridStyles.readonly}`} placeholder="Description" tabIndex="-1" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colNotes}`}>
                                            <input value={item.additionalNotes} onChange={e => setItem(i, 'additionalNotes', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 3)} data-row={i} data-col={3} className={gridStyles.inp} placeholder="Additional Notes" autoComplete="off" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colHsn}`}>
                                            <input value={item.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 4)} data-row={i} data-col={4} className={gridStyles.inp} placeholder="HSN" autoComplete="off" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colUom}`}>
                                            <input value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 5)} data-row={i} data-col={5} className={gridStyles.inp} placeholder="UOM" autoComplete="off" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colQty}`}>
                                            <input type="number" min="0" step="any" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 6)} data-row={i} data-col={6} className={`no-spin ${gridStyles.tableInpNum}`} style={{ textAlign: 'center', borderColor: !item.qty ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colRate}`}>
                                            <input type="number" min="0" step="any" value={item.rate} onChange={e => setItem(i, 'rate', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 7)} data-row={i} data-col={7} className={`no-spin ${gridStyles.tableInpNum}`} style={{ borderColor: !item.rate ? '#fca5a5' : '#e5e7eb' }} autoComplete="off" />
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colAmount} ${gridStyles.num} ${gridStyles.money}`}>
                                            ₹{(item.taxable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className={`${gridStyles.td} ${gridStyles.colAction}`}>
                                            {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }} aria-label="Remove item">✕</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" onClick={addItem} className={gridStyles.addBtn}>+ Add Item</button>
                </Section>

                {/* Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Section title="Payment & Remarks">
                        <div style={{ marginTop: 0 }}><label style={lbl}>Payment Terms</label><input value={form.paymentTerms} onChange={e => setF('paymentTerms', e.target.value)} style={inp} placeholder="e.g. Net 30" /></div>
                        
                        <div style={{ marginTop: 12, padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <label style={{ ...lbl, color: '#0d9488' }}>Sales / Referral Details</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '11px' }}>
                                <div><strong>Source:</strong> {form.referralDetails?.sourceType}</div>
                                <div><strong>Incentive:</strong> {form.referralDetails?.incentiveApplicable ? 'Yes' : 'No'}</div>
                                {form.referralDetails?.incentiveApplicable && (
                                    <div style={{ gridColumn: 'span 2', color: '#16a34a', fontWeight: 600 }}>
                                        {form.referralDetails.incentiveType}: {form.referralDetails.incentiveValue}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: 12 }}><label style={lbl}>Remarks</label><textarea value={form.remarks} onChange={e => setF('remarks', e.target.value)} style={{ ...inp, height: 56, resize: 'vertical' }} /></div>
                    </Section>
                    <Section title="Invoice Summary">
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
                                <span>Total Item Amount</span>
                                <span style={{ fontWeight: 600 }}>₹{totalItemTaxable.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280', padding: '4px 0' }}>
                                <span>+ Freight / Shipping</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input type="number" min="0" value={form.freightAmount} onChange={e => setF('freightAmount', e.target.value)} style={{ ...inp, width: 80, padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" />
                                    <span style={{ fontWeight: 600, color: '#4b5563', minWidth: 60, textAlign: 'right' }}>₹{freight.toFixed(2)}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', fontWeight: 700, borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 4 }}>
                                <span>Total Taxable Amount</span>
                                <span>₹{totalTaxable.toFixed(2)}</span>
                            </div>
                            {gstApplicable && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2563eb', paddingTop: 4 }}>
                                    <span>+ GST ({form.gstType})</span>
                                    <span>₹{totalGst.toFixed(2)}</span>
                                </div>
                            )}
                            {!gstApplicable && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#f59e0b', paddingTop: 4, fontWeight: 700 }}>
                                    <span>TAX MODE</span>
                                    <span>WITHOUT GST</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#16a34a', fontWeight: 800, padding: '12px 0 0', borderTop: '2px solid #16a34a' }}>
                                <span>Rounded Total</span>
                                <span>₹{roundedTotal.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </Section>
                </div>
            </div>



            <AddSeriesModal

                isOpen={showAddSeries}
                onClose={() => setShowAddSeries(false)}
                onSave={(newSeries) => {
                    setSeriesList(p => [newSeries, ...p]);
                    setF('seriesId', newSeries._id);
                }}
            />
            <GstinStatusWarningModal
                open={Boolean(gstWarning)}
                data={gstWarning}
                busy={gstBusy}
                canApprove={Boolean(hasPermission?.('gst.transaction.override'))}
                onConfirmB2C={() => {
                    gstDecisionRef.current = { confirmedB2c: true };
                    setGstSnapshot((prev) => ({
                        ...(prev || {}),
                        gstTreatmentSnapshot: 'Unregistered',
                        gstr1CategorySnapshot: 'B2C',
                        decisionReason: gstWarning?.resolutionReason || 'User confirmed B2C for this transaction',
                        manualOverride: false,
                        overrideReason: 'User confirmed B2C for this transaction',
                    }));
                    setForm((p) => ({
                        ...p,
                        customerRegistrationType: 'Consumer',
                    }));
                    setGstWarning(null);
                    if (pendingSubmitRef.current) {
                        pendingSubmitRef.current = false;
                        setTimeout(() => handleSubmit(), 0);
                    }
                }}
                onEnterAnotherGstin={() => {
                    gstDecisionRef.current = null;
                    setGstWarning(null);
                    setForm((p) => ({ ...p, customerGstin: '' }));
                    toast('Enter another GSTIN on the invoice');
                }}
                onRefresh={async () => {
                    await resolveGstForForm({ forceRefresh: true });
                }}
                onContinueWithApproval={() => {
                    const reason = window.prompt('Override reason (required):');
                    if (!reason) return;
                    gstDecisionRef.current = { override: true };
                    setGstSnapshot((prev) => ({
                        ...(prev || {}),
                        gstTreatmentSnapshot: prev?.gstTreatmentSnapshot || 'Registered',
                        gstr1CategorySnapshot: prev?.gstr1CategorySnapshot || 'B2B',
                        manualOverride: true,
                        overrideReason: reason,
                        decisionReason: `Approved override: ${reason}`,
                    }));
                    setGstWarning(null);
                    if (pendingSubmitRef.current) {
                        pendingSubmitRef.current = false;
                        setTimeout(() => handleSubmit(), 0);
                    }
                }}
                onCancel={() => {
                    pendingSubmitRef.current = false;
                    setGstWarning(null);
                }}
            />
        </div>
    );
}
