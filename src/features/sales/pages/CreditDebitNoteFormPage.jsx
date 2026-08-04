import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    createCreditDebitNote,
    updateCreditDebitNote,
    getCreditDebitNote,
    finalizeCreditDebitNote,
    ensureCreditNoteSalesReturnLedger,
    mapCreditNoteSalesReturnLedger,
    listSalesReturnMappingCandidates,
} from '@/services/creditDebitNoteApi';
import { getInvoiceSeries, getSalesInvoices, getSalesInvoiceById, previewNextInvoiceNo } from '@/services/salesApi';
import { getCustomers, getCustomer } from '@/services/customerApi';
import { getItems } from '@/services/itemApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import { numberToWords } from '@/utils/numberToWords';
import toast from 'react-hot-toast';
import VoucherEntryTallyLayout from '@/features/accounts/components/voucherEntryTally';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/hooks/useAuth';

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

const fmtInvDate = (d) => {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '—';
    }
};

const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const emptyInvoiceLinkage = () => ({
    originalInvoiceId: '',
    originalInvoiceNumber: '',
    originalInvoiceDate: '',
    items: [BLANK_ITEM()],
    freightAmount: '',
    freightGstRate: 18,
});

/** CRM stores display name in company / contactPersons more often than customerName. */
function resolveCustomerDisplayName(c) {
    if (!c) return '';
    const primary = Array.isArray(c.contactPersons)
        ? (c.contactPersons.find((p) => p?.isPrimary) || c.contactPersons[0])
        : null;
    return String(
        c.company
        || c.name
        || c.customerName
        || c.legalName
        || c.tradeName
        || primary?.name
        || c.sticker
        || ''
    ).trim();
}

function resolveCustomerMobile(c) {
    if (!c) return '';
    const primary = Array.isArray(c.contactPersons)
        ? (c.contactPersons.find((p) => p?.isPrimary) || c.contactPersons[0])
        : null;
    return String(
        c.mobile
        || c.phone
        || primary?.mobile
        || primary?.whatsApp
        || ''
    ).trim();
}

function resolveCustomerGstin(c) {
    if (!c) return '';
    return String(c.gstin || c.gstNumber || '').trim();
}

export default function CreditDebitNoteFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const { selectedFY } = useFinancialYear();
    const { selectedCompany } = useCompany();
    const { user, hasPermission } = useAuth();
    const pathIsDebit = typeof window !== 'undefined' && window.location.pathname.includes('debit-notes');
    const defaultType = searchParams.get('type')
        || (pathIsDebit ? 'Debit Note' : 'Credit Note');

    const isLedgerAdmin = (() => {
        const role = String(user?.roleName || user?.role?.name || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin') return true;
        return Boolean(
            hasPermission?.('accounts.system_ledger.configure') ||
            hasPermission?.('accounts.ledger_master.add') ||
            hasPermission?.('accounts.ledger_master.edit'),
        );
    })();

    const [saving, setSaving] = useState(false);
    const [ledgerSetupModal, setLedgerSetupModal] = useState(null); // { message, candidates }
    const [ledgerBusy, setLedgerBusy] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
    const [seriesLoadDone, setSeriesLoadDone] = useState(false);
    const [previewNoteNo, setPreviewNoteNo] = useState('');
    const [invoices, setInvoices] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [allItems, setAllItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customersLoading, setCustomersLoading] = useState(false);
    const invoiceLoadSeq = useRef(0);
    const customerLoadSeq = useRef(0);
    const prevCompanyIdRef = useRef(selectedCompany?._id);

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

    const loadPreview = useCallback(async (seriesId) => {
        if (!seriesId) {
            setPreviewNoteNo('');
            return;
        }
        try {
            const res = await previewNextInvoiceNo(seriesId, 'CreditDebitNote');
            setPreviewNoteNo(res?.nextInvoiceNo || '');
        } catch {
            setPreviewNoteNo('');
        }
    }, []);

    const loadCustomerInvoices = useCallback(async (customerId, search = '') => {
        if (!customerId) {
            setInvoices([]);
            return;
        }
        const seq = ++invoiceLoadSeq.current;
        setInvoicesLoading(true);
        try {
            const params = {
                customerId,
                excludeEstimates: 'true',
                status: 'Confirmed',
                view: 'active',
                limit: 100,
                page: 1,
            };
            if (selectedFY) params.financialYear = selectedFY;
            if (search && String(search).trim()) params.search = String(search).trim();

            const res = await getSalesInvoices(params);
            if (seq !== invoiceLoadSeq.current) return;
            const list = (res.invoices || []).slice().sort((a, b) => {
                const da = new Date(a.invoiceDate || 0).getTime();
                const db = new Date(b.invoiceDate || 0).getTime();
                return db - da;
            });
            setInvoices(list);
        } catch {
            if (seq !== invoiceLoadSeq.current) return;
            setInvoices([]);
            toast.error('Failed to load customer invoices');
        } finally {
            if (seq === invoiceLoadSeq.current) setInvoicesLoading(false);
        }
    }, [selectedFY]);

    useEffect(() => {
        setSeriesLoadDone(false);
        getInvoiceSeries({ active: true }).then(s => {
            const all = s || [];
            const fyShort = String(selectedFY || '')
                .replace(/^20(\d{2})-20?(\d{2})$/, '$1-$2')
                .replace(/^20(\d{2})-(\d{2})$/, '$1-$2');
            const byType = all.filter((x) => x.documentType === form.noteType && x.isActive !== false);
            const byFy = fyShort
                ? byType.filter((x) => !x.financialYear || String(x.financialYear) === fyShort || String(x.financialYear) === String(selectedFY))
                : byType;
            const filtered = byFy.length ? byFy : byType;
            setSeriesList(filtered);
            setSeriesLoadDone(true);
            if (filtered.length === 1) {
                setForm((p) => {
                    if (p.seriesId === filtered[0]._id) return p;
                    return { ...p, seriesId: filtered[0]._id };
                });
                loadPreview(filtered[0]._id);
            } else if (filtered.length > 0) {
                setForm((p) => {
                    const stillValid = filtered.some((x) => String(x._id) === String(p.seriesId));
                    if (stillValid && p.seriesId) {
                        loadPreview(p.seriesId);
                        return p;
                    }
                    return { ...p, seriesId: '' };
                });
                setPreviewNoteNo('');
            } else {
                setForm((p) => ({ ...p, seriesId: '' }));
                setPreviewNoteNo('');
            }
        }).catch(() => {
            setSeriesList([]);
            setSeriesLoadDone(true);
        });

        getItems({ limit: 1000, active: true }).then(res => {
            setAllItems(res.data || []);
        });
    }, [form.noteType, selectedFY, loadPreview]);

    const loadAllCustomers = useCallback(async () => {
        const seq = ++customerLoadSeq.current;
        setCustomersLoading(true);
        try {
            // Customer list API enforces limit <= 100 — page until complete (same as Sales Invoice).
            const pageSize = 100;
            let page = 1;
            let totalPages = 1;
            const byId = new Map();
            do {
                const res = await getCustomers({
                    limit: pageSize,
                    page,
                    sortBy: '_id:asc',
                });
                if (seq !== customerLoadSeq.current) return;
                const list = res?.results || res?.data || [];
                if (Array.isArray(list)) {
                    for (const c of list) {
                        const cid = String(c?._id || c?.id || '');
                        if (!cid || byId.has(cid)) continue;
                        byId.set(cid, c);
                    }
                }
                totalPages = Number(res?.totalPages) || page;
                if (!Array.isArray(list) || list.length < pageSize) break;
                page += 1;
            } while (page <= totalPages && page <= 50);
            if (seq !== customerLoadSeq.current) return;
            setCustomers(Array.from(byId.values()));
        } catch (e) {
            if (seq !== customerLoadSeq.current) return;
            console.error('Error loading customers:', e);
            setCustomers([]);
            toast.error(e?.message || 'Failed to load customers');
        } finally {
            if (seq === customerLoadSeq.current) setCustomersLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAllCustomers();
    }, [loadAllCustomers, selectedCompany?._id]);

    // Company switch: clear customer/invoice linkage and rely on reload above.
    useEffect(() => {
        const nextId = selectedCompany?._id;
        const prevId = prevCompanyIdRef.current;
        prevCompanyIdRef.current = nextId;
        if (!prevId || !nextId || String(prevId) === String(nextId)) return;
        setForm((p) => ({
            ...p,
            customerId: '',
            customerName: '',
            customerGstin: '',
            billingAddress: '',
            billingStateCode: '',
            placeOfSupply: '',
            ...emptyInvoiceLinkage(),
        }));
        setInvoices([]);
    }, [selectedCompany?._id]);

    useEffect(() => {
        if (id) {
            getCreditDebitNote(id).then(data => {
                const cust = data.customerId && typeof data.customerId === 'object' ? data.customerId : null;
                const custId = cust?._id || data.customerId || '';
                const custName = resolveCustomerDisplayName(cust) || data.customerName || '';
                setForm({
                    ...data,
                    noteDate: data.noteDate.slice(0, 10),
                    originalInvoiceDate: data.originalInvoiceDate?.slice(0, 10) || '',
                    customerId: custId,
                    customerName: custName,
                    customerGstin: data.customerGstin || resolveCustomerGstin(cust) || '',
                });
                if (custId) loadCustomerInvoices(custId);
            });
        }
    }, [id, loadCustomerInvoices]);

    const hasLinkedInvoiceData = (f) => {
        if (f.originalInvoiceId) return true;
        if (f.originalInvoiceNumber) return true;
        if (f.originalInvoiceDate) return true;
        if (Number(f.freightAmount) > 0) return true;
        return (f.items || []).some((it) => it.itemId || it.itemName || Number(it.qty) > 0 || Number(it.rate) > 0);
    };

    const handleCustomerSelect = async (customerId) => {
        if (!customerId) {
            if (hasLinkedInvoiceData(form)) {
                const ok = window.confirm(
                    'Clearing customer will also clear the selected invoice and imported items. Continue?'
                );
                if (!ok) return;
            }
            setForm((p) => ({
                ...p,
                customerId: '',
                customerName: '',
                customerGstin: '',
                billingAddress: '',
                billingStateCode: '',
                placeOfSupply: '',
                ...emptyInvoiceLinkage(),
            }));
            setInvoices([]);
            return;
        }

        if (
            form.customerId
            && String(form.customerId) !== String(customerId)
            && hasLinkedInvoiceData(form)
        ) {
            const ok = window.confirm(
                'Changing customer will clear the selected invoice and imported items. Continue?'
            );
            if (!ok) return;
        }

        try {
            const fullCustomer = await getCustomer(customerId);
            const name = resolveCustomerDisplayName(fullCustomer);
            const gstin = resolveCustomerGstin(fullCustomer);
            const sameCustomer = String(form.customerId) === String(customerId);
            setForm((p) => ({
                ...p,
                customerId,
                customerName: name,
                customerGstin: gstin,
                billingAddress: fullCustomer.billingAddress || fullCustomer.address || '',
                billingStateCode: fullCustomer.stateCode || fullCustomer.billingStateCode || '',
                placeOfSupply: fullCustomer.stateCode || fullCustomer.billingStateCode || p.placeOfSupply || '',
                ...(sameCustomer ? {} : emptyInvoiceLinkage()),
            }));
            await loadCustomerInvoices(customerId);
        } catch {
            toast.error('Failed to load customer details');
        }
    };

    const handleInvoiceSelect = async (invId) => {
        if (!invId) {
            setForm((p) => ({ ...p, ...emptyInvoiceLinkage() }));
            return;
        }
        if (!form.customerId) {
            toast.error('Select customer first');
            return;
        }
        try {
            const inv = await getSalesInvoiceById(invId);
            const invCustomerId = inv.customerId?._id || inv.customerId;
            if (String(invCustomerId) !== String(form.customerId)) {
                toast.error('Selected invoice does not belong to this customer');
                return;
            }
            const series = inv.seriesId;
            if (series?.isEstimate === true || series?.documentType === 'Estimate') {
                toast.error('Estimate documents cannot be linked');
                return;
            }
            setForm(p => ({
                ...p,
                originalInvoiceId: inv._id,
                originalInvoiceNumber: inv.invoiceNumber,
                originalInvoiceDate: inv.invoiceDate.slice(0, 10),
                customerId: invCustomerId,
                customerName: inv.customerName || p.customerName,
                customerGstin: inv.customerGstin || p.customerGstin || '',
                billingAddress: inv.billingAddress || p.billingAddress || '',
                billingStateCode: inv.billingStateCode || p.billingStateCode || '',
                placeOfSupply: inv.placeOfSupply || p.placeOfSupply || '',
                gstType: inv.gstType || 'CGST / SGST',
                freightAmount: inv.freightAmount ?? '',
                freightGstRate: inv.freightGstRate ?? 18,
                items: (inv.items || []).map(i => ({
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
        if (!form.customerId || !form.customerName) return toast.error('Customer is required');
        if (form.originalInvoiceId) {
            const linked = invoices.find((inv) => String(inv._id) === String(form.originalInvoiceId));
            if (linked) {
                const linkedCust = linked.customerId?._id || linked.customerId;
                if (linkedCust && String(linkedCust) !== String(form.customerId)) {
                    return toast.error('Customer must match the selected invoice');
                }
            }
        }

        setSaving(true);
        try {
            const payload = {
                ...form,
                customerId: form.customerId,
                items: processedItems,
                subTotal: processedItems.reduce((s, i) => s + i.taxable, 0),
                totalTaxableAmount: totalTaxable,
                totalGst,
                totalCgst: isIGST ? 0 : totalGst / 2,
                totalSgst: isIGST ? 0 : totalGst / 2,
                totalIgst: isIGST ? totalGst : 0,
                grandTotal,
                roundedTotal,
                amountInWords: numberToWords(roundedTotal),
                financialYear: selectedFY || form.financialYear,
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
            const errData = e.response?.data || {};
            const msg = errData.message || 'Save failed';
            const isSalesReturnMissing =
                errData.errorCode === 'LEDGER_SALES_RETURN_MISSING' ||
                /Credit Note ledger is not configured/i.test(msg) ||
                /Sales Return ledger/i.test(msg) ||
                /System ledger matching 'Sales Return'/i.test(msg);

            if (finalize && isSalesReturnMissing) {
                let candidates = [];
                try {
                    if (isLedgerAdmin) {
                        const c = await listSalesReturnMappingCandidates();
                        candidates = c?.candidates || [];
                    }
                } catch {
                    /* ignore */
                }
                setLedgerSetupModal({
                    message: 'Credit Note ledger is not configured.',
                    candidates,
                    pendingFinalizeId: null,
                });
                toast.error('Credit Note ledger is not configured');
            } else {
                toast.error(msg);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleEnsureSalesReturnLedger = async () => {
        if (!isLedgerAdmin) return toast.error('Only authorised users can create system ledgers');
        setLedgerBusy(true);
        try {
            await ensureCreditNoteSalesReturnLedger();
            toast.success('Ledger ready. Click Finalize & Issue again.');
            setLedgerSetupModal(null);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not create ledger');
        } finally {
            setLedgerBusy(false);
        }
    };

    const handleMapSalesReturnLedger = async (ledgerId) => {
        if (!isLedgerAdmin) return toast.error('Only authorised users can map system ledgers');
        setLedgerBusy(true);
        try {
            await mapCreditNoteSalesReturnLedger(ledgerId);
            toast.success('Ledger mapped to SALES_RETURN. Click Finalize & Issue again.');
            setLedgerSetupModal(null);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Mapping failed');
        } finally {
            setLedgerBusy(false);
        }
    };

    const openLedgerConfig = (action = '') => {
        const base = PATHS.ACCOUNTS.CREDIT_NOTE_LEDGER_CONFIG;
        navigate(action ? `${base}?mode=${action}` : base);
    };

    const customerOptions = (() => {
        const base = customers.map((c) => {
            const name = resolveCustomerDisplayName(c);
            const code = c.customerCode || c.code || '';
            const mobile = resolveCustomerMobile(c);
            const gstin = resolveCustomerGstin(c);
            const city = String(c.city || c.shippingCity || '').trim();
            const sticker = Array.isArray(c.stickers) && c.stickers[0]?.name
                ? c.stickers[0].name
                : String(c.sticker || '').trim();
            const metaParts = [];
            if (gstin) metaParts.push(`GSTIN: ${gstin}`);
            if (city) metaParts.push(`City: ${city}`);
            if (code) metaParts.push(`Code: ${code}`);
            if (mobile) metaParts.push(`Mobile: ${mobile}`);
            return {
                value: c._id,
                label: name || code || 'Unnamed customer',
                meta: metaParts.join(' | '),
                // Extra haystack so SearchableSelect progressive search covers all fields
                searchText: `${name} ${code} ${gstin} ${mobile} ${city} ${sticker}`.toLowerCase(),
            };
        });
        if (form.customerId && !base.find((b) => String(b.value) === String(form.customerId))) {
            base.unshift({
                value: form.customerId,
                label: form.customerName || 'Customer',
                meta: form.customerGstin ? `GSTIN: ${form.customerGstin}` : '',
                searchText: `${form.customerName || ''} ${form.customerGstin || ''}`.toLowerCase(),
            });
        }
        return base;
    })();

    const invoiceOptions = invoices.map((inv) => {
        const amt = inv.roundedTotal ?? inv.grandTotal ?? 0;
        const label = `${inv.invoiceNumber} | ${fmtInvDate(inv.invoiceDate)} | ${fmtAmt(amt)}`;
        return {
            value: inv._id,
            label,
            meta: String(inv.invoiceNumber || ''),
        };
    });

    return (
    <>
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
                    <select
                        value={String(form.seriesId || '')}
                        onChange={(e) => {
                            const val = e.target.value;
                            setF('seriesId', val);
                            loadPreview(val);
                        }}
                        style={inp}
                    >
                        <option value="">-- Select Series --</option>
                        {seriesList.map(s => (
                            <option key={s._id} value={String(s._id)}>{s.seriesName}{s.prefix ? ` (${s.prefix})` : ''}</option>
                        ))}
                    </select>
                    {seriesLoadDone && seriesList.length === 0 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
                            {form.noteType === 'Debit Note'
                                ? 'No active Debit Note series is configured.'
                                : 'No active Credit Note series is configured.'}
                        </div>
                    )}
                    {previewNoteNo && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Number preview</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0d9488', fontFamily: 'monospace' }}>
                                {previewNoteNo}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>Preview only — number is not reserved until you save.</div>
                        </div>
                    )}
                </Field>

                <Field label="Customer" style={{ gridColumn: '1 / -1' }}>
                    <SearchableSelect
                        options={customerOptions}
                        value={form.customerId}
                        onChange={handleCustomerSelect}
                        placeholder={customersLoading ? 'Loading customers...' : 'Search customer (name / mobile / GSTIN / code)...'}
                        disabled={customersLoading}
                        dropdownMinWidth={560}
                        style={inp}
                        renderOption={(opt) => (
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                                    {opt.label}
                                </div>
                                {opt.meta ? (
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                        {opt.meta}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    />
                    {form.customerId && form.customerName && (
                        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {form.customerName}
                        </div>
                    )}
                    {form.customerGstin && (
                        <div style={{ marginTop: 2, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                            GSTIN: {form.customerGstin}
                        </div>
                    )}
                </Field>

                <Field label="Link Original Invoice">
                    <SearchableSelect
                        options={invoiceOptions}
                        value={form.originalInvoiceId}
                        onChange={handleInvoiceSelect}
                        placeholder={form.customerId ? (invoicesLoading ? 'Loading invoices...' : 'Search invoice number...') : 'Select customer first'}
                        disabled={!form.customerId || invoicesLoading}
                        noOptionsMessage={form.customerId ? 'No eligible invoices for this customer' : 'Select customer first'}
                        style={{ ...inp, background: form.customerId ? '#fff' : '#f9fafb' }}
                    />
                </Field>
                <Field label="Original Date">
                    <input type="date" value={form.originalInvoiceDate} readOnly style={{ ...inp, background: '#f9fafb' }} />
                </Field>
                <Field label="Reason for Issuing Note" style={{ gridColumn: '1 / -1' }}>
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

        {ledgerSetupModal && (
            <div
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                }}
                onClick={() => !ledgerBusy && setLedgerSetupModal(null)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.15)', padding: 22,
                    }}
                >
                    <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>Credit Note ledger is not configured</h3>
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                        {ledgerSetupModal.message}
                    </p>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                        Internal system code: <strong>SALES_RETURN</strong>. The note stays Draft until a valid ledger is mapped.
                    </p>
                    {isLedgerAdmin && ledgerSetupModal.candidates?.length > 0 && (
                        <div style={{ marginBottom: 12, maxHeight: 160, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            {(ledgerSetupModal.candidates || []).map((c) => (
                                <button
                                    key={String(c._id)}
                                    type="button"
                                    disabled={ledgerBusy}
                                    onClick={() => handleMapSalesReturnLedger(c._id)}
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                                        border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff',
                                        cursor: 'pointer', fontSize: 12,
                                    }}
                                >
                                    <strong>{c.name}</strong>
                                    <span style={{ color: '#94a3b8' }}> · {c.groupName || '—'}{c.systemCode ? ` · ${c.systemCode}` : ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                        {isLedgerAdmin && (
                            <>
                                <button
                                    type="button"
                                    disabled={ledgerBusy}
                                    onClick={() => openLedgerConfig('select_existing')}
                                    style={{
                                        padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
                                        background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12,
                                    }}
                                >
                                    Select Existing Ledger
                                </button>
                                <button
                                    type="button"
                                    disabled={ledgerBusy}
                                    onClick={handleEnsureSalesReturnLedger}
                                    style={{
                                        padding: '8px 14px', borderRadius: 8, border: 'none',
                                        background: '#0d9488', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12,
                                    }}
                                >
                                    {ledgerBusy ? 'Working…' : 'Create New Ledger'}
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            disabled={ledgerBusy}
                            onClick={() => setLedgerSetupModal(null)}
                            style={{
                                padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                                background: '#f8fafc', fontWeight: 600, cursor: 'pointer', fontSize: 12,
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
}
