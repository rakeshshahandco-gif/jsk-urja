import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { scanEntryApi } from '@/services/scanEntryApi';
import { getSuppliers, getSupplierById } from '@/services/purchaseApi';
import { getCustomers } from '@/services/customerApi';
import { getLedgers, getVoucherTypes, getCashBankAccounts } from '@/services/accountApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 };
const btn = { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' };

const formatMoney = (n) => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return Number.isFinite(v) ? v.toFixed(2) : '';
};

const roundMoneyInput = (n) => Math.round((Number(n) || 0) * 100) / 100;

const filePreviewUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // Same-origin relative URL — vite proxies /uploads → backend:5000 on localhost:4000
    return url.startsWith('/') ? url : `/${url}`;
};

const confStyle = (level) => {
    if (level === 'high') return { color: '#166534' };
    if (level === 'medium') return { color: '#92400e' };
    if (level === 'low') return { color: '#b91c1c', fontWeight: 700 };
    return { color: '#64748b' };
};

function ScanFilePreview({ src, fileName, mimeType }) {
    const [zoom, setZoom] = useState(100);
    const [fitWidth, setFitWidth] = useState(true);

    if (!src) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
                No preview available
            </div>
        );
    }

    const isImage = mimeType?.includes('image');
    const isPdf = mimeType?.includes('pdf') || /\.pdf$/i.test(fileName || '');
    const widthPct = fitWidth ? 100 : zoom;
    const previewStyle = { width: `${widthPct}%`, height: 620, border: '1px solid #e5e7eb', borderRadius: 8, minWidth: '100%', background: '#525659' };

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {!isImage && (
                    <>
                        <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => { setFitWidth(false); setZoom((z) => Math.min(z + 15, 200)); }}>Zoom In</button>
                        <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => { setFitWidth(false); setZoom((z) => Math.max(z - 15, 50)); }}>Zoom Out</button>
                        <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => { setFitWidth(true); setZoom(100); }}>Fit Width</button>
                    </>
                )}
                <a href={src} download={fileName} target="_blank" rel="noreferrer" style={{ ...btn, fontSize: 12, textDecoration: 'none' }}>
                    Download Original
                </a>
                <a href={src} target="_blank" rel="noreferrer" style={{ ...btn, fontSize: 12, textDecoration: 'none' }}>
                    Open in New Tab
                </a>
            </div>
            {isImage ? (
                <img src={src} alt={fileName} style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            ) : isPdf ? (
                <>
                    <iframe title="scan-preview" src={`${src}#view=FitH`} style={previewStyle} />
                    <object data={src} type="application/pdf" style={{ ...previewStyle, display: 'none' }} aria-hidden="true" />
                </>
            ) : (
                <iframe title="scan-preview" src={src} style={previewStyle} />
            )}
        </div>
    );
}

/** Normalize paginated API payloads to a plain array for .map(). */
const normalizeList = (payload, keys = ['results', 'suppliers', 'data', 'items', 'rows']) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
};

const entityId = (value) => String(value?._id || value || '');

const mergeSupplierOption = (list, mappedSup) => {
    if (!mappedSup) return list;
    const id = entityId(mappedSup);
    if (!id) return list;
    const row = typeof mappedSup === 'object' && mappedSup.supplierName
        ? mappedSup
        : { _id: id, supplierName: mappedSup.supplierName || 'Mapped supplier' };
    if (list.some((s) => entityId(s) === id)) return list;
    return [row, ...list];
};

const hydrateDraftSupplier = async (draft) => {
    if (!draft) return draft;
    const id = entityId(draft.mappedSupplierId);
    if (!id) return draft;
    if (draft.mappedSupplierId?.supplierName) return draft;
    try {
        const sup = await getSupplierById(id);
        return { ...draft, mappedSupplierId: sup };
    } catch {
        return {
            ...draft,
            mappedSupplierId: {
                _id: id,
                supplierName: draft.extractedData?.supplierName || 'Mapped supplier',
            },
        };
    }
};

export default function ScanEntryReviewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [posting, setPosting] = useState(false);
    const [draft, setDraft] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [catalogItems, setCatalogItems] = useState([]);
    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [overrideReason, setOverrideReason] = useState('');
    const [rematching, setRematching] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [repostingLedger, setRepostingLedger] = useState(false);

    const load = async () => {
        setLoading(true);
        setLoadError('');
        try {
            let d = await scanEntryApi.getDraft(id);
            d = await hydrateDraftSupplier(d);
            setDraft(d);

            const needsItems = d?.moduleType === 'purchase_invoice' || d?.moduleType === 'sales_invoice';
            const needsExpenseMeta = d?.moduleType === 'expense_bill';
            const [sups, custs, leds, itemsRes, vTypes, cbAccs] = await Promise.all([
                getSuppliers({ limit: 500 }).catch(() => ({ results: [] })),
                getCustomers({ limit: 500 }).catch(() => ({ results: [] })),
                getLedgers().catch(() => []),
                needsItems ? getItems({ limit: 500 }).catch(() => ({ results: [] })) : Promise.resolve(null),
                needsExpenseMeta ? getVoucherTypes({ nature: 'Expense', active: true }).catch(() => []) : Promise.resolve([]),
                needsExpenseMeta ? getCashBankAccounts({ status: 'Active' }).catch(() => []) : Promise.resolve([]),
            ]);

            try {
                if (!entityId(d?.mappedSupplierId)) {
                    const rematched = await scanEntryApi.rematchMaster(id, d?.extractedData);
                    d = await hydrateDraftSupplier(rematched);
                    setDraft(d);
                }
            } catch {
                // keep loaded draft if rematch fails
            }

            if (d?.moduleType === 'purchase_invoice' && !entityId(d?.mappedSupplierId) && d?.extractedData?.supplierName) {
                try {
                    const searchName = String(d.extractedData.supplierName).trim();
                    const searchRes = await getSuppliers({ search: searchName, limit: 20 });
                    const hits = normalizeList(searchRes, ['suppliers', 'results', 'data']);
                    const gst = String(d.extractedData.supplierGstin || '').toUpperCase();
                    const hit = hits.find((s) => gst && String(s.gstNumber || '').toUpperCase() === gst)
                        || hits.find((s) => String(s.supplierName || '').toLowerCase().includes(searchName.toLowerCase().slice(0, 8)))
                        || hits[0];
                    if (hit?._id) {
                        d = await scanEntryApi.matchSupplier(id, entityId(hit));
                        d = await hydrateDraftSupplier(d);
                        setDraft(d);
                    }
                } catch {
                    // manual selection still available
                }
            }

            let supplierList = normalizeList(sups, ['suppliers', 'results', 'data']);
            supplierList = mergeSupplierOption(supplierList, d?.mappedSupplierId);

            setSuppliers(supplierList);
            setCustomers(normalizeList(custs, ['results', 'data']));
            setLedgers(normalizeList(leds, ['data', 'results']));
            setCatalogItems(normalizeList(itemsRes, ['data', 'results', 'items']));
            setVoucherTypes(normalizeList(vTypes, ['data', 'results']));
            setCashBankAccounts(normalizeList(cbAccs, ['data', 'results', 'accounts']));
        } catch (e) {
            const msg = e?.code === 'ECONNABORTED'
                ? 'Loading timed out — try again or open from Drafts list'
                : (e?.response?.data?.message || 'Failed to load draft');
            setLoadError(msg);
            setDraft(null);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const runMasterMatch = async () => {
        if (!draft) return;
        setRematching(true);
        try {
            const d = await scanEntryApi.rematchMaster(id, draft.extractedData);
            const hydrated = await hydrateDraftSupplier(d);
            setDraft(hydrated);
            if (hydrated?.mappedSupplierId) {
                setSuppliers((prev) => mergeSupplierOption(prev, hydrated.mappedSupplierId));
            }
            toast.success('Matched with master (GSTIN / name / ledger)');
        } catch (e) {
            const msg = e?.code === 'ECONNABORTED'
                ? 'Master match timed out — try again or map supplier manually'
                : (e?.response?.data?.message || 'Master match failed');
            toast.error(msg);
        } finally {
            setRematching(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const ex = draft?.extractedData || {};
    const postingMode = ex.postingMode || 'with_inventory';
    const isLedgerOnly = draft?.moduleType === 'purchase_invoice' && postingMode === 'ledger_only';
    const confidence = draft?.confidence || {};
    const duplicateMatches = Array.isArray(draft?.duplicateCheckResult?.matches) ? draft.duplicateCheckResult.matches : [];
    const canPost = draft && !['posted', 'rejected', 'ocr_processing'].includes(draft.status);
    const pendingSupplier = (draft?.pendingMasters || []).find((p) => p.type === 'supplier' && p.status === 'pending');
    const previewSrc = filePreviewUrl(draft?.uploadFileUrl);
    const blockingErrors = (draft?.validationErrors || []).filter((e) => !String(e).startsWith('GST warning:'));
    const gstWarnings = (draft?.validationErrors || []).filter((e) => String(e).startsWith('GST warning:'));

    const createDraftSupplier = async () => {
        try {
            const d = await scanEntryApi.createDraftSupplier(id);
            setDraft(d);
            toast.success('Draft supplier prepared — approve to use for posting');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed');
        }
    };

    const approvePendingSupplier = async () => {
        try {
            const d = await scanEntryApi.approvePendingMaster(id, 0);
            setDraft(d);
            toast.success('Supplier approved and linked');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Approve failed');
        }
    };

    const updateExtractField = (key, value) => {
        setDraft((prev) => ({ ...prev, extractedData: { ...(prev?.extractedData || {}), [key]: value } }));
    };

    const mappedItems = useMemo(() => (Array.isArray(draft?.mappedItems) ? draft.mappedItems : []), [draft]);

    const requiredMissing = useMemo(() => {
        if (!draft) return [];
        const missing = [];
        const invNo = ex.supplierInvoiceNo || ex.invoiceNo || ex.billNo;
        const invDate = ex.invoiceDate || ex.billDate;
        if (!String(ex.supplierName || ex.vendorName || ex.customerName || '').trim()) missing.push('Supplier / party name');
        if (!String(invNo || '').trim()) missing.push('Invoice / bill number');
        if (!String(invDate || '').slice(0, 10)) missing.push('Invoice / bill date');
        if (draft.moduleType === 'purchase_invoice' && !String(ex.supplierGstin || '').trim()) missing.push('GSTIN');
        if (!(Number(ex.grandTotal) > 0)) missing.push('Total amount');
        if (!isLedgerOnly && (draft.moduleType === 'purchase_invoice' || draft.moduleType === 'sales_invoice') && (!mappedItems.length || mappedItems.some((m) => !m.itemId))) {
            missing.push('All line items must be mapped');
        }
        if (isLedgerOnly && !(Number(ex.taxableAmount) > 0 || Number(ex.grandTotal) > 0)) {
            missing.push('Taxable amount (for ledger posting)');
        }
        if (draft.moduleType === 'purchase_invoice' && !entityId(draft.mappedSupplierId)) missing.push('Supplier master mapping');
        return missing;
    }, [draft, ex, mappedItems, isLedgerOnly]);

    const canApprovePost = canPost && blockingErrors.length === 0 && requiredMissing.length === 0;

    const setItemMapping = (lineIndex, itemId) => {
        const item = catalogItems.find((i) => i._id === itemId);
        setDraft((prev) => {
            const next = [...(prev.mappedItems || [])];
            const row = next[lineIndex] || {};
            next[lineIndex] = {
                ...row,
                itemId: itemId || null,
                itemName: item?.itemName || row.ocrItemName || '',
                itemCode: item?.itemCode || row.ocrItemCode || '',
                hsnCode: item?.hsnCode || row.ocrHsn || '',
                uom: item?.uom || row.uom || 'NOS',
            };
            return { ...prev, mappedItems: next };
        });
    };

    const saveDraft = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const payload = {
                extractedData: draft.extractedData,
                mappedSupplierId: draft.mappedSupplierId?._id || draft.mappedSupplierId || null,
                mappedCustomerId: draft.mappedCustomerId?._id || draft.mappedCustomerId || null,
                mappedLedgerId: draft.mappedLedgerId?._id || draft.mappedLedgerId || null,
                mappedItems,
                userRemarks: draft.userRemarks || '',
                assignedTo: draft.assignedTo?._id || draft.assignedTo || null,
            };
            const d = await scanEntryApi.saveDraft(id, payload);
            setDraft(d);
            toast.success('Draft saved');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const runValidate = async () => {
        try {
            const d = await scanEntryApi.validateDraft(id);
            setDraft(d);
            toast.success('Validation complete');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Validation failed');
        }
    };

    const doOverrideDuplicate = async () => {
        try {
            const d = await scanEntryApi.overrideDuplicate(id, overrideReason);
            setDraft(d);
            toast.success('Duplicate overridden');
            setOverrideReason('');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Override failed');
        }
    };

    const doPost = async () => {
        if (!canPost) return;
        if (!window.confirm('Post this draft using existing posting flow?')) return;
        setPosting(true);
        try {
            const result = await scanEntryApi.postDraft(id);
            toast.success('Draft posted successfully');
            if (result?.linkedId) {
                if (draft.moduleType === 'purchase_invoice') {
                    navigate(PATHS.PURCHASE.INVOICE_DETAIL(result.linkedId));
                    return;
                }
                if (draft.moduleType === 'sales_invoice') {
                    navigate(PATHS.SALES.INVOICE_DETAIL(result.linkedId));
                    return;
                }
            }
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Post failed');
        } finally {
            setPosting(false);
        }
    };

    const doRepostLedger = async () => {
        const invoiceId = entityId(draft?.finalLinkedInvoiceId);
        if (!invoiceId) {
            toast.error('No linked purchase invoice found');
            return;
        }
        if (!window.confirm('Post this purchase to accounts ledger now?')) return;
        setRepostingLedger(true);
        try {
            await scanEntryApi.repostPurchaseLedger(invoiceId);
            toast.success('Ledger posted — check Day Book / Ledger Report (FY 2026-2027)');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Ledger posting failed');
        } finally {
            setRepostingLedger(false);
        }
    };

    const doReject = async () => {
        const remark = window.prompt('Reason for reject (optional):', '') || '';
        try {
            const d = await scanEntryApi.rejectDraft(id, remark);
            setDraft(d);
            toast.success('Draft rejected');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Reject failed');
        }
    };

    if (loading) {
        return <div style={page}><div style={card}>Loading draft…</div></div>;
    }
    if (!draft) {
        return (
            <div style={page}>
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Draft not found</h3>
                    <p style={{ color: '#64748b', marginBottom: 12 }}>
                        {loadError || 'This draft may have been deleted, or the link is outdated.'}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" style={btn} onClick={load}>Retry</button>
                        <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS} style={{ ...btn, textDecoration: 'none' }}>Open Drafts list</Link>
                        <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_BULK} style={{ ...btn, textDecoration: 'none' }}>Bulk Upload again</Link>
                    </div>
                </div>
            </div>
        );
    }

    const confLabel = (key) => confidence?.fields?.[key] || 'low';
    const confBadge = (key) => {
        const level = confLabel(key);
        const empty = key === 'grandTotal' ? !(Number(ex.grandTotal) > 0)
            : key === 'supplierInvoiceNo' ? !String(ex.supplierInvoiceNo || ex.invoiceNo || ex.billNo || '').trim()
                : key === 'supplierGstin' ? !String(ex.supplierGstin || '').trim()
                    : !String(ex[key] || '').trim();
        const shown = empty ? 'low' : level;
        return <span style={confStyle(shown)}>({shown}{empty ? ' — missing' : ''})</span>;
    };
    const mappingNotes = Array.isArray(ex._mappingNotes) ? ex._mappingNotes : [];
    const linkedLedger = draft?.mappedSupplierId?.ledgerId;
    const mappedSupplierIdValue = entityId(draft?.mappedSupplierId);
    const setSupplier = async (supplierId) => {
        if (!supplierId) return;
        try {
            const d = await scanEntryApi.matchSupplier(id, supplierId);
            setDraft(d);
            if (d?.mappedSupplierId) setSuppliers((prev) => mergeSupplierOption(prev, d.mappedSupplierId));
            toast.success('Supplier mapped');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Supplier mapping failed');
        }
    };

    return (
        <div style={page}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>AI Smart Import Review</h2>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                        Upload → OCR → Review → Validate → Approve &amp; Post
                    </p>
                </div>
                <Link to={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS} style={{ ...btn, textDecoration: 'none' }}>Back to Drafts</Link>
            </div>

            {draft.status === 'posted' && (
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                    <strong>This draft was already posted.</strong>
                    {draft.finalLinkedInvoiceId && draft.moduleType === 'purchase_invoice' && (
                        <>
                            {' '}
                            <Link to={PATHS.PURCHASE.INVOICE_DETAIL(draft.finalLinkedInvoiceId)} style={{ color: '#15803d', fontWeight: 700 }}>
                                Open purchase invoice
                            </Link>
                            {' · '}
                            <button
                                type="button"
                                style={{ ...btn, padding: '4px 10px', fontSize: 12, borderColor: '#86efac' }}
                                onClick={doRepostLedger}
                                disabled={repostingLedger}
                            >
                                {repostingLedger ? 'Posting to ledger…' : 'Post to ledger'}
                            </button>
                        </>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
                <div style={card}>
                    <h4 style={{ marginTop: 0 }}>File Preview</h4>
                    <ScanFilePreview src={previewSrc} fileName={draft.originalFileName} mimeType={draft.mimeType} />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                        <div><strong>File:</strong> {draft.originalFileName}</div>
                        <div><strong>Status:</strong> {draft.status}</div>
                        <div><strong>Overall confidence:</strong> <span style={confStyle(confidence?.overall || 'low')}>{confidence?.overall || 'low'}</span></div>
                    </div>
                </div>

                <div style={card}>
                    <h4 style={{ marginTop: 0 }}>Review & Mapping</h4>
                    <div style={{ display: 'grid', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Invoice / Bill No {confBadge('supplierInvoiceNo')}</label>
                            <input style={inp} value={ex.supplierInvoiceNo || ex.invoiceNo || ex.billNo || ''} onChange={(e) => updateExtractField('supplierInvoiceNo', e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Date</label>
                            <input type="date" style={inp} value={(ex.invoiceDate || ex.billDate || '').slice(0, 10)} onChange={(e) => updateExtractField('invoiceDate', e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Total Amount {confBadge('grandTotal')}</label>
                            <input
                                type="number"
                                step="0.01"
                                style={inp}
                                value={ex.grandTotal != null && ex.grandTotal !== '' ? formatMoney(ex.grandTotal) : ''}
                                onChange={(e) => updateExtractField('grandTotal', roundMoneyInput(e.target.value))}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Supplier GSTIN {confBadge('supplierGstin')}</label>
                            <input
                                style={inp}
                                value={ex.supplierGstin || ''}
                                onChange={(e) => updateExtractField('supplierGstin', e.target.value.toUpperCase())}
                                onBlur={runMasterMatch}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Supplier Name (from bill)</label>
                            <input
                                style={inp}
                                value={ex.supplierName || ''}
                                onChange={(e) => updateExtractField('supplierName', e.target.value)}
                                onBlur={runMasterMatch}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Taxable / CGST / SGST / IGST</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                <input type="number" step="0.01" style={inp} placeholder="Taxable" value={ex.taxableAmount != null && ex.taxableAmount !== '' ? formatMoney(ex.taxableAmount) : ''} onChange={(e) => updateExtractField('taxableAmount', roundMoneyInput(e.target.value))} />
                                <input type="number" step="0.01" style={inp} placeholder="CGST" value={ex.cgst != null && ex.cgst !== '' ? formatMoney(ex.cgst) : ''} onChange={(e) => updateExtractField('cgst', roundMoneyInput(e.target.value))} />
                                <input type="number" step="0.01" style={inp} placeholder="SGST" value={ex.sgst != null && ex.sgst !== '' ? formatMoney(ex.sgst) : ''} onChange={(e) => updateExtractField('sgst', roundMoneyInput(e.target.value))} />
                                <input type="number" step="0.01" style={inp} placeholder="IGST" value={ex.igst != null && ex.igst !== '' ? formatMoney(ex.igst) : ''} onChange={(e) => updateExtractField('igst', roundMoneyInput(e.target.value))} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700 }}>Freight</label>
                                <input type="number" step="0.01" style={inp} value={ex.freight != null && ex.freight !== '' ? formatMoney(ex.freight) : ''} onChange={(e) => updateExtractField('freight', roundMoneyInput(e.target.value))} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700 }}>Other Charges</label>
                                <input type="number" step="0.01" style={inp} value={ex.otherCharges != null && ex.otherCharges !== '' ? formatMoney(ex.otherCharges) : ''} onChange={(e) => updateExtractField('otherCharges', roundMoneyInput(e.target.value))} />
                            </div>
                        </div>

                        {draft.moduleType === 'purchase_invoice' && (
                            <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc' }}>
                                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Import type</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="postingMode"
                                            checked={postingMode === 'with_inventory'}
                                            onChange={() => updateExtractField('postingMode', 'with_inventory')}
                                            style={{ marginTop: 3 }}
                                        />
                                        <span>
                                            <strong>With inventory</strong>
                                            <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Map each line to a stock item — updates inventory and ledger.</span>
                                        </span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="postingMode"
                                            checked={postingMode === 'ledger_only'}
                                            onChange={() => updateExtractField('postingMode', 'ledger_only')}
                                            style={{ marginTop: 3 }}
                                        />
                                        <span>
                                            <strong>Without inventory (ledger only)</strong>
                                            <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>No item mapping — posts Purchase + GST + Supplier only (job-work, film/setup costs, etc.).</span>
                                        </span>
                                    </label>
                                </div>
                                {isLedgerOnly && (
                                    <div style={{ marginTop: 10, fontSize: 12, color: '#1d4ed8', background: '#eff6ff', padding: '8px 10px', borderRadius: 6 }}>
                                        Ledger-only: taxable ₹{formatMoney(ex.taxableAmount || 0)} + GST will post to accounts. Stock will not change.
                                    </div>
                                )}
                            </div>
                        )}

                        {draft.moduleType === 'purchase_invoice' && (
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700 }}>Supplier (master)</label>
                                <select
                                    style={inp}
                                    value={mappedSupplierIdValue}
                                    onChange={(e) => setSupplier(e.target.value)}
                                >
                                    <option value="">Select supplier</option>
                                    {suppliers.map((s) => <option key={entityId(s)} value={entityId(s)}>{s.supplierName}{s.gstNumber ? ` (${s.gstNumber})` : ''}</option>)}
                                </select>
                                {mappedSupplierIdValue && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#166534', background: '#f0fdf4', padding: '6px 8px', borderRadius: 6 }}>
                                        Auto-matched: <strong>{draft.mappedSupplierId?.supplierName || ex.supplierName}</strong>
                                        {draft.mappedSupplierId?.gstNumber ? ` | GSTIN: ${draft.mappedSupplierId.gstNumber}` : ''}
                                    </div>
                                )}
                                {linkedLedger?.name && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#166534', background: '#f0fdf4', padding: '6px 8px', borderRadius: 6 }}>
                                        Linked ledger: <strong>{linkedLedger.name}</strong>
                                        {linkedLedger.gstin ? ` | GSTIN: ${linkedLedger.gstin}` : ''}
                                    </div>
                                )}
                                {mappingNotes.length > 0 && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#1d4ed8' }}>
                                        {mappingNotes.map((note, i) => <div key={i}>{note}</div>)}
                                    </div>
                                )}
                                <button type="button" style={{ ...btn, marginTop: 8, fontSize: 12 }} onClick={runMasterMatch} disabled={rematching}>
                                    {rematching ? 'Matching…' : 'Re-match GSTIN / PAN / Name'}
                                </button>
                                {!draft.mappedSupplierId && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button type="button" style={btn} onClick={createDraftSupplier}>Create Draft Supplier</button>
                                        {pendingSupplier && (
                                            <button type="button" style={{ ...btn, background: '#eff6ff', borderColor: '#93c5fd' }} onClick={approvePendingSupplier}>
                                                Approve Draft Supplier
                                            </button>
                                        )}
                                    </div>
                                )}
                                {pendingSupplier?.payload && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', background: '#fffbeb', padding: 8, borderRadius: 6 }}>
                                        Pending: {pendingSupplier.payload.supplierName} | GSTIN: {pendingSupplier.payload.gstNumber || '—'}
                                    </div>
                                )}
                            </div>
                        )}

                        {draft.moduleType === 'sales_invoice' && (
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700 }}>Customer</label>
                                <select
                                    style={inp}
                                    value={draft.mappedCustomerId?._id || draft.mappedCustomerId || ''}
                                    onChange={(e) => setDraft((p) => ({ ...p, mappedCustomerId: e.target.value }))}
                                >
                                    <option value="">Select customer</option>
                                    {customers.map((c) => <option key={c._id} value={c._id}>{c.customerName}</option>)}
                                </select>
                            </div>
                        )}

                        {draft.moduleType === 'expense_bill' && (
                            <>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700 }}>Expense Ledger</label>
                                    <select
                                        style={inp}
                                        value={draft.mappedLedgerId?._id || draft.mappedLedgerId || ''}
                                        onChange={(e) => setDraft((p) => ({ ...p, mappedLedgerId: e.target.value }))}
                                    >
                                        <option value="">Select ledger</option>
                                        {ledgers.map((l) => <option key={l._id} value={l._id}>{l.ledgerName || l.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700 }}>Voucher Type</label>
                                    <select
                                        style={inp}
                                        value={ex.voucherTypeId || ''}
                                        onChange={(e) => updateExtractField('voucherTypeId', e.target.value)}
                                    >
                                        <option value="">Select voucher type</option>
                                        {voucherTypes.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 700 }}>Cash / Bank Account</label>
                                    <select
                                        style={inp}
                                        value={ex.cashBankAccountId || ''}
                                        onChange={(e) => updateExtractField('cashBankAccountId', e.target.value)}
                                    >
                                        <option value="">Select account</option>
                                        {cashBankAccounts.map((a) => (
                                            <option key={a._id} value={a._id}>{a.accountName || a.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        {(draft.moduleType === 'purchase_invoice' || draft.moduleType === 'sales_invoice') && mappedItems.length > 0 && !isLedgerOnly && (
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Line items</label>
                                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                                <th style={{ padding: 8 }}>OCR name</th>
                                                <th style={{ padding: 8 }}>Qty</th>
                                                <th style={{ padding: 8 }}>Map to item</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mappedItems.map((row, idx) => {
                                                const itemSelectValue = row.itemId ? entityId(row.itemId) : '';
                                                const isUnmapped = !itemSelectValue;
                                                return (
                                                <tr key={idx} style={{ borderTop: '1px solid #e5e7eb', background: isUnmapped ? '#fff7ed' : 'transparent' }}>
                                                    <td style={{ padding: 8 }}>{row.ocrItemName || '—'}</td>
                                                    <td style={{ padding: 8 }}>{row.qty}</td>
                                                    <td style={{ padding: 8 }}>
                                                        <select
                                                            style={{ ...inp, borderColor: isUnmapped ? '#fdba74' : '#d1d5db' }}
                                                            value={itemSelectValue}
                                                            onChange={(e) => setItemMapping(idx, e.target.value)}
                                                        >
                                                            <option value="">— Select CRM item —</option>
                                                            {catalogItems.map((it) => (
                                                                <option key={entityId(it)} value={entityId(it)}>{it.itemName}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700 }}>Remarks</label>
                            <textarea style={{ ...inp, minHeight: 70 }} value={draft.userRemarks || ''} onChange={(e) => setDraft((p) => ({ ...p, userRemarks: e.target.value }))} />
                        </div>
                    </div>

                    {requiredMissing.length > 0 && (
                        <div style={{ marginTop: 12, padding: 10, border: '1px solid #fca5a5', borderRadius: 8, background: '#fff1f2' }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, color: '#b91c1c' }}>Required before Approve &amp; Post</div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: '#b91c1c' }}>
                                {requiredMissing.map((e, i) => <li key={`req-${i}`}>{e}</li>)}
                            </ul>
                        </div>
                    )}

                    {(blockingErrors.length > 0 || gstWarnings.length > 0) && (
                        <div style={{ marginTop: 12, padding: 10, border: `1px solid ${blockingErrors.length ? '#fca5a5' : '#fcd34d'}`, borderRadius: 8, background: blockingErrors.length ? '#fff1f2' : '#fffbeb' }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>GST &amp; validation</div>
                            {blockingErrors.length > 0 && (
                                <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: '#b91c1c' }}>
                                    {blockingErrors.map((e, i) => <li key={`b-${i}`}>{e}</li>)}
                                </ul>
                            )}
                            {gstWarnings.length > 0 && (
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#92400e' }}>
                                    {gstWarnings.map((e, i) => <li key={`w-${i}`}>{e}</li>)}
                                </ul>
                            )}
                        </div>
                    )}

                    {duplicateMatches.length > 0 && (
                        <div style={{ marginTop: 12, padding: 10, border: '1px solid #fecaca', borderRadius: 8, background: '#fff1f2' }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Possible duplicates</div>
                            {duplicateMatches.map((m) => (
                                <div key={m.invoiceId} style={{ fontSize: 12, marginBottom: 4 }}>
                                    Invoice: {m.invoiceNumber} | Bill: {m.supplierInvoiceNo} | Amount: {m.grandTotal}
                                </div>
                            ))}
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                <input
                                    style={inp}
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    placeholder="Admin override reason"
                                />
                                <button style={btn} onClick={doOverrideDuplicate}>Override Duplicate</button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={btn} disabled={saving} onClick={saveDraft}>{saving ? 'Saving...' : 'Save Draft'}</button>
                        <button style={btn} onClick={runValidate}>Validate</button>
                        <button
                            style={{ ...btn, background: canApprovePost ? '#16a34a' : '#94a3b8', color: '#fff', borderColor: canApprovePost ? '#16a34a' : '#94a3b8' }}
                            disabled={!canApprovePost || posting}
                            onClick={doPost}
                            title={!canApprovePost ? requiredMissing.join(', ') || blockingErrors.join(', ') : ''}
                        >
                            {posting ? 'Posting...' : 'Approve & Post'}
                        </button>
                        <button style={{ ...btn, background: '#fef2f2', borderColor: '#fecaca' }} onClick={doReject}>Reject</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

