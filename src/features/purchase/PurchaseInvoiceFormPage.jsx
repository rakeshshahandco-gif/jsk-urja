import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
    createPurchaseInvoice, getSuppliers,
    getPurchaseOrders, getPurchaseOrderById,
    getGRNsByPO, getGRNsBySupplier, getGRNById,
    updatePurchaseInvoice, getPurchaseInvoiceById
} from '@/services/purchaseApi';
import { getItems } from '@/services/itemApi';
import { getCompanyProfile } from '@/services/settingsApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';


const inp = { padding: '9px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '7px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };
const lbl = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600 };

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const FLOWS = [
    { key: 'PO→GRN→Invoice', label: 'PO → GRN → Invoice', desc: 'Standard flow. Invoice against a confirmed GRN.', icon: '📋' },
    { key: 'PO→Direct Invoice', label: 'PO → Direct Invoice', desc: 'Material received with invoice directly. No separate GRN needed.', icon: '⚡' },
    { key: 'Direct GRN→Invoice', label: 'GRN → Invoice (No PO)', desc: 'Urgent purchase done without PO. Invoice against existing GRN.', icon: '📦' },
    { key: 'Direct Invoice', label: 'Direct Invoice', desc: 'Small purchase. No PO, no GRN. Stock updates on invoice post.', icon: '🧾' },
];

const EMPTY_ROW = { itemId: '', itemName: '', itemCode: '', hsnCode: '', uom: 'NOS', qty: 1, rate: 0, discountPercent: 0, gstRate: 18, description: '', grnItemId: null, poItemId: null, maxQty: null };

export default function PurchaseInvoiceFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;
    const [searchParams] = useSearchParams();
    const prefillPoId = searchParams.get('poId') || '';
    const prefillGrnId = searchParams.get('grnId') || '';

    const [flowType, setFlowType] = useState('PO→GRN→Invoice');
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);
    const [poList, setPoList] = useState([]);
    const [grnList, setGrnList] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loadingRef, setLoadingRef] = useState(false);
    const [loading, setLoading] = useState(isEdit);
    const prefillProcessed = useRef(false);

    const [header, setHeader] = useState({
        supplierId: '', invoiceDate: new Date().toISOString().split('T')[0],
        supplierInvoiceNo: '', selectedPoId: '', selectedGrnId: '',
        supplierGstin: '', supplierAddress: '', supplierState: '', supplierStateCode: '',
        buyerName: 'JSK URJA', buyerGstin: '', buyerAddress: '', buyerState: 'Maharashtra', buyerStateCode: '27',
        gstType: 'CGST / SGST', placeOfSupply: 'Maharashtra', paymentTerms: '30 Days', remarks: '',
        poNumber: '', poDate: '', transporterName: '', vehicleNo: '', lrNumber: '',
        freightAmount: 0, freightGstRate: 0,
    });

    const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
    const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));

    const onSupplierChange = (supplierId) => {
        const s = suppliers.find(s => s._id === supplierId);
        if (s) {
            const addr = [s.address, s.area, s.city, s.state, s.pincode].filter(Boolean).join(', ');
            const stateCode = s.gstNumber ? s.gstNumber.substring(0, 2) : '';
            const buyerStateCode = header.buyerStateCode || '27';
            const autoGstType = stateCode && buyerStateCode && stateCode !== buyerStateCode ? 'IGST' : 'CGST / SGST';

            setHeader(h => ({
                ...h,
                supplierId,
                selectedPoId: '',
                selectedGrnId: '',
                supplierGstin: s.gstNumber || '',
                supplierAddress: addr,
                supplierState: s.state || '',
                supplierStateCode: stateCode,
                gstType: autoGstType
            }));
        } else {
            setHeader(h => ({
                ...h,
                supplierId: '',
                selectedPoId: '',
                selectedGrnId: '',
                supplierGstin: '',
                supplierAddress: '',
                supplierState: '',
                supplierStateCode: '',
                gstType: 'CGST / SGST'
            }));
        }
        setRows([{ ...EMPTY_ROW }]);
        setPoList([]); setGrnList([]);
    };

    const onPoChange = useCallback(async (poId, forcedFlow = null) => {
        const activeFlow = forcedFlow || flowType;
        setH('selectedPoId', poId);
        setRows([{ ...EMPTY_ROW }]);
        if (!poId) return;

        if (activeFlow === 'PO→Direct Invoice') {
            setLoadingRef(true);
            try {
                const po = await getPurchaseOrderById(poId);
                const poData = po.data || po;
                console.log('onPoChange: PO Data Fetched:', poData);

                // Sync header from PO
                setHeader(h => ({
                    ...h,
                    supplierId: poData.supplierId?._id || poData.supplierId,
                    gstType: poData.gstType || h.gstType,
                    paymentTerms: poData.paymentTerms || h.paymentTerms,
                    transporterName: poData.transporterName || h.transporterName,
                    vehicleNo: poData.vehicleNo || h.vehicleNo,
                    lrNumber: poData.lrNumber || h.lrNumber,
                    freightAmount: poData.freightAmount || h.freightAmount,
                    freightGstRate: poData.freightGstRate || h.freightGstRate,
                    remarks: poData.remarks || h.remarks,
                    warehouse: poData.warehouse || h.warehouse,
                    supplierGstin: poData.supplierGstNumber || h.supplierGstin,
                    supplierAddress: poData.supplierAddress || h.supplierAddress,
                    supplierState: poData.supplierState || h.supplierState,
                    supplierStateCode: poData.supplierStateCode || h.supplierStateCode,
                    poNumber: poData.poNumber || '',
                    poDate: poData.poDate ? poData.poDate.split('T')[0] : h.poDate,
                }));


                const newRows = (poData.items || [])
                    .map(pi => {
                        const avail = r2(pi.orderedQty - (pi.invoicedQty || 0));
                        return {
                            itemId: pi.itemId?._id || pi.itemId,
                            itemName: pi.itemName,
                            itemCode: pi.itemCode,
                            hsnCode: pi.hsnCode || '',
                            uom: pi.uom,
                            qty: avail > 0 ? avail : 0,
                            rate: pi.rate,
                            discountPercent: pi.discountPercent || 0,
                            gstRate: pi.taxPercent || 18,
                            description: pi.description || '',
                            maxQty: avail,
                            poItemId: pi._id,
                            grnItemId: null,
                            orderedQty: pi.orderedQty,
                            invoicedQty: pi.invoicedQty || 0
                        };
                    });

                console.log('onPoChange: Mapped Rows:', newRows);

                if (newRows.length) {
                    setRows(newRows);
                    if (newRows.every(r => r.qty <= 0)) {
                        toast.error('Warning: Selected Purchase Order is already fully billed. Proceed only if over-billing is manual.', { duration: 5000 });
                    }
                } else {
                    toast.error('Selected Purchase Order has no items.');
                }
            } catch (err) { 
                console.error('onPoChange Error:', err);
                toast.error('Failed to load PO items'); 
            }
            finally { setLoadingRef(false); }
        } else if (activeFlow === 'PO→GRN→Invoice') {
            // Load GRNs for this PO
            setLoadingRef(true);
            try {
                const po = await getPurchaseOrderById(poId);
                const poData = po.data || po;
                setHeader(h => ({
                    ...h,
                    supplierId: poData.supplierId?._id || poData.supplierId,
                    gstType: poData.gstType || h.gstType,
                    paymentTerms: poData.paymentTerms || h.paymentTerms,
                    transporterName: poData.transporterName || h.transporterName,
                    vehicleNo: poData.vehicleNo || h.vehicleNo,
                    lrNumber: poData.lrNumber || h.lrNumber,
                    freightAmount: poData.freightAmount || h.freightAmount,
                    freightGstRate: poData.freightGstRate || h.freightGstRate,
                    remarks: poData.remarks || h.remarks,
                    warehouse: poData.warehouse || h.warehouse,
                    supplierGstin: poData.supplierGstNumber || h.supplierGstin,
                    supplierAddress: poData.supplierAddress || h.supplierAddress,
                    supplierState: poData.supplierState || h.supplierState,
                    supplierStateCode: poData.supplierStateCode || h.supplierStateCode,
                    poNumber: poData.poNumber || '',
                    poDate: poData.poDate ? poData.poDate.split('T')[0] : h.poDate,
                }));


                const grns = await getGRNsByPO(poId);
                setGrnList(Array.isArray(grns) ? grns.filter(g => g.invoiceStatus !== 'Fully Invoiced') : []);
            } catch (err) { 
                console.error('onPoChange GRN Error:', err);
                toast.error('Failed to load GRNs'); 
            }
            finally { setLoadingRef(false); }
        }
    }, [flowType]);


    const onGrnChange = useCallback(async (grnId) => {
        setH('selectedGrnId', grnId);
        setRows([{ ...EMPTY_ROW }]);
        if (!grnId) return;
        setLoadingRef(true);
        try {
            const grn = await getGRNById(grnId);
            const grnData = grn.data || grn;
            const newRows = (grnData.items || [])
                .map(gi => {
                    const avail = r2(gi.receivedQty - (gi.invoicedQty || 0));
                    return {
                        itemId: gi.itemId?._id || gi.itemId,
                        itemName: gi.itemName,
                        itemCode: gi.itemCode,
                        hsnCode: gi.hsnCode || '',
                        uom: gi.uom,
                        qty: avail > 0 ? avail : 0,
                        rate: gi.rate,
                        discountPercent: gi.discountPercent || 0,
                        gstRate: gi.taxPercent || 18,
                        description: gi.description || '',
                        maxQty: avail,
                        grnItemId: gi._id,
                        poItemId: gi.poItemId || null,
                        receivedQty: gi.receivedQty,
                        invoicedQty: gi.invoicedQty || 0
                    };
                });

            if (newRows.length) {
                setRows(newRows);
                if (newRows.every(r => r.maxQty <= 0)) {
                    toast.error('Warning: Selected GRN is already fully billed. Proceed only if over-billing is manual.', { duration: 5000 });
                }
            } else {
                toast.error('Selected GRN has no items.');
            }

            // Sync header from GRN
            setHeader(h => ({
                ...h,
                supplierId: grnData.supplierId?._id || grnData.supplierId,
                gstType: grnData.gstType || h.gstType,
                transporterName: grnData.transporterName || h.transporterName,
                vehicleNo: grnData.vehicleNo || h.vehicleNo,
                lrNumber: grnData.lrNumber || h.lrNumber,
                freightAmount: grnData.freightAmount || h.freightAmount,
                freightGstRate: grnData.freightGstRate || h.freightGstRate,
                supplierGstin: grnData.supplierGstNumber || h.supplierGstin,
                supplierAddress: grnData.supplierAddress || h.supplierAddress,
                supplierState: grnData.supplierState || h.supplierState,
                supplierStateCode: grnData.supplierStateCode || h.supplierStateCode,
                warehouse: grnData.warehouse || h.warehouse,
                poNumber: grnData.poNumber || h.poNumber,
                poDate: grnData.poDate ? grnData.poDate.split('T')[0] : h.poDate,
            }));

        } catch { toast.error('Failed to load GRN items'); }
        finally { setLoadingRef(false); }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                const [sD, iD, comp] = await Promise.all([
                    getSuppliers({ limit: 200 }),
                    getItems({ limit: 5000, sortBy: 'itemName:asc' }),
                    getCompanyProfile().catch(() => ({ data: {} }))
                ]);
                const c = comp?.data || {};
                setSuppliers(sD.suppliers || []);
                setItems(Array.isArray(iD.data) ? iD.data : []);

                if (isEdit) {
                    const inv = await getPurchaseInvoiceById(id);
                    setFlowType(inv.flowType);
                    setHeader({
                        supplierId: inv.supplierId?._id || inv.supplierId,
                        invoiceDate: inv.invoiceDate ? inv.invoiceDate.split('T')[0] : '',
                        supplierInvoiceNo: inv.supplierInvoiceNo || '',
                        selectedPoId: inv.poId?._id || inv.poId || '',
                        selectedGrnId: inv.grnId?._id || inv.grnId || '',
                        supplierGstin: inv.supplierGstin || '',
                        supplierAddress: inv.supplierAddress || '',
                        supplierState: inv.supplierState || '',
                        supplierStateCode: inv.supplierStateCode || '',
                        buyerName: inv.buyerName || c.companyName || 'JSK URJA',
                        buyerGstin: inv.buyerGstin || c.gstNumber || '',
                        buyerAddress: inv.buyerAddress || c.address || '',
                        buyerState: inv.buyerState || c.state || 'Maharashtra',
                        buyerStateCode: inv.buyerStateCode || (c.gstNumber ? c.gstNumber.substring(0, 2) : '27'),
                        gstType: inv.gstType || 'CGST / SGST',
                        placeOfSupply: inv.placeOfSupply || 'Gujarat',
                        paymentTerms: inv.paymentTerms || '30 Days',
                        remarks: inv.remarks || '',
                        poNumber: inv.poNumber || '',
                        poDate: inv.poDate ? inv.poDate.split('T')[0] : '',
                        transporterName: inv.transporterName || '',

                        vehicleNo: inv.vehicleNo || '',
                        lrNumber: inv.lrNumber || '',
                        freightAmount: inv.freightAmount || 0,
                        freightGstRate: inv.freightGstRate || 0,
                    });
                    setRows(inv.items.map(r => ({
                        itemId: r.itemId?._id || r.itemId,
                        itemName: r.itemName,
                        itemCode: r.itemCode,
                        hsnCode: r.hsnCode || '',
                        uom: r.uom,
                        qty: r.qty,
                        rate: r.rate,
                        discountPercent: r.discountPercent || 0,
                        gstRate: r.gstRate || 18,
                        description: r.description || '',
                        grnItemId: r.grnItemId || null,
                        poItemId: r.poItemId || null,
                        maxQty: null // For edit, we assume user knows what they're doing or we'd need current stock/balances
                    })));
                } else {
                    setHeader(h => ({
                        ...h,
                        buyerName: c.companyName || h.buyerName,
                        buyerGstin: c.gstNumber || h.buyerGstin,
                        buyerAddress: c.address || h.buyerAddress,
                        buyerState: c.state || h.buyerState,
                        buyerStateCode: c.gstNumber ? c.gstNumber.substring(0, 2) : h.buyerStateCode
                    }));
                }
            } catch (err) { toast.error('Failed to load initial data'); }
            finally { setLoading(false); }
        };
        init();
    }, [id, isEdit]);

    // Auto-prefill Logic (Consolidated to avoid race conditions)
    useEffect(() => {
        if (!isEdit && !loading && !prefillProcessed.current) {
            const run = async () => {
                if (prefillPoId) {
                    setFlowType('PO→Direct Invoice');
                    // We call onPoChange directly with the target flow to bypass the state re-render delay
                    await onPoChange(prefillPoId, 'PO→Direct Invoice').catch(() => {});
                    prefillProcessed.current = true;
                } else if (prefillGrnId) {
                    setFlowType('PO→GRN→Invoice');
                    const grn = await getGRNById(prefillGrnId).catch(() => null);
                    if (grn) {
                        const g = grn.data || grn;
                        if (g.poId) {
                            setH('selectedPoId', g.poId?._id || g.poId);
                            // Ensure the onPoChange is executed to load GRN list for this PO
                            await onPoChange(g.poId?._id || g.poId, 'PO→GRN→Invoice').catch(() => {});
                            onGrnChange(prefillGrnId);
                        } else {
                            setFlowType('Direct GRN→Invoice');
                            onGrnChange(prefillGrnId);
                        }
                    }
                    prefillProcessed.current = true;
                }
            };
            run();
        }
    }, [prefillPoId, prefillGrnId, isEdit, loading, onPoChange, onGrnChange]);


    // Load PO list when supplier + flow changes
    useEffect(() => {
        if (!header.supplierId) return;
        if (flowType === 'PO→GRN→Invoice' || flowType === 'PO→Direct Invoice') {
            getPurchaseOrders({ supplierId: header.supplierId, limit: 100 })
                .then(d => setPoList(d.purchaseOrders || []))
                .catch(() => { });
        }
        if (flowType === 'Direct GRN→Invoice') {
            getGRNsBySupplier(header.supplierId)
                .then(d => setGrnList(Array.isArray(d) ? d : []))
                .catch(() => { });
        }
    }, [header.supplierId, flowType]);

    // Auto-fill supplier GST info

    // Row helpers
    const addRow = () => setRows(r => [...r, { ...EMPTY_ROW }]);
    const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i));
    const setRow = (i, k, v) => setRows(prev => prev.map((row, idx) => {
        if (idx !== i) return row;
        const updated = { ...row, [k]: v };
        if (k === 'itemId') {
            const found = items.find(it => it._id === v);
            if (found) { updated.itemName = found.itemName; updated.itemCode = found.itemCode; updated.uom = found.uom || 'NOS'; updated.rate = found.purchaseRate || 0; updated.hsnCode = found.hsnCode || ''; updated.gstRate = found.purchaseGst || 18; }
        }
        return updated;
    }));

    // GST calculations
    const calcRow = (row) => {
        const gross = r2(row.qty * row.rate);
        const disc = r2(gross * (row.discountPercent || 0) / 100);
        const taxable = r2(gross - disc);
        const isIGST = header.gstType === 'IGST';
        const cgst = isIGST ? 0 : r2(taxable * (row.gstRate || 0) / 2 / 100);
        const sgst = isIGST ? 0 : r2(taxable * (row.gstRate || 0) / 2 / 100);
        const igst = isIGST ? r2(taxable * (row.gstRate || 0) / 100) : 0;
        return { gross, disc, taxable, cgst, sgst, igst, total: r2(taxable + cgst + sgst + igst) };
    };

    const isIGST = header.gstType === 'IGST';

    const totals = rows.reduce((acc, row) => {
        const c = calcRow(row);
        return { taxable: r2(acc.taxable + c.taxable), disc: r2(acc.disc + c.disc), cgst: r2(acc.cgst + c.cgst), sgst: r2(acc.sgst + c.sgst), igst: r2(acc.igst + c.igst), grand: r2(acc.grand + c.total) };
    }, { taxable: 0, disc: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 });

    const freightAmt = Number(header.freightAmount) || 0;
    const freightGst = Number(header.freightGstRate) || (rows.length > 0 ? rows[0].gstRate : 18);
    const freightCgst = !isIGST ? r2(freightAmt * freightGst / 2 / 100) : 0;
    const freightSgst = !isIGST ? r2(freightAmt * freightGst / 2 / 100) : 0;
    const freightIgst = isIGST ? r2(freightAmt * freightGst / 100) : 0;
    const freightGstTotal = r2(freightCgst + freightSgst + freightIgst);
    const totalTaxableWithFreight = r2(totals.taxable + freightAmt);
    const rawTotal = r2(totalTaxableWithFreight + totals.cgst + totals.sgst + totals.igst + freightGstTotal);
    const roundOff = r2(Math.round(rawTotal) - rawTotal);
    const grandWithFreight = r2(rawTotal + roundOff);

    // ── Keyboard Navigation ───────────────────────────────────────────────
    const handleRowKeyDown = (e, rowIdx, colIdx) => {
        if (e.key === 'ArrowDown') {
            const next = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`);
            if (next) {
                e.preventDefault();
                next.focus();
            } else if (rowIdx === rows.length - 1 && rows[rowIdx].itemId && isManual) {
                addRow();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            const nextColTargets = [1, 2, 3, 4, 5, 6];
            const currentTargetIdx = nextColTargets.indexOf(colIdx);
            
            if (currentTargetIdx < nextColTargets.length - 1) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColTargets[currentTargetIdx + 1]}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
                if (rowIdx < rows.length - 1) {
                    const nextRowCol1 = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="1"]`);
                    if (nextRowCol1) {
                        e.preventDefault();
                        nextRowCol1.focus();
                    }
                } else if (isManual) {
                    addRow();
                }
            }
        }
    };

    const needPO = flowType === 'PO→GRN→Invoice' || flowType === 'PO→Direct Invoice';

    const needGRN = flowType === 'PO→GRN→Invoice' || flowType === 'Direct GRN→Invoice';
    const isManual = flowType === 'Direct Invoice';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.supplierId) return toast.error('Select a supplier');
        if (needPO && !header.selectedPoId) return toast.error('Select a Purchase Order');
        if (needGRN && !header.selectedGrnId) return toast.error('Select a GRN');
        if (rows.some(r => !r.itemId)) return toast.error('Select item for all rows');

        // Client-side qty check
        for (const row of rows) {
            if (flowType.includes('GRN') && row.maxQty !== null && row.qty > row.maxQty) {
                return toast.error(`Qty for "${row.itemName}" cannot exceed GRN quantity (${row.maxQty})`);
            }
        }

        setSaving(true);
        try {
            const payload = {
                flowType,
                supplierId: header.supplierId,
                invoiceDate: header.invoiceDate,
                supplierInvoiceNo: header.supplierInvoiceNo,
                poId: header.selectedPoId || null,
                grnId: header.selectedGrnId || null,

                supplierGstin: header.supplierGstin,
                supplierAddress: header.supplierAddress,
                supplierState: header.supplierState,
                supplierStateCode: header.supplierStateCode,
                buyerName: header.buyerName,
                buyerGstin: header.buyerGstin,
                buyerAddress: header.buyerAddress,
                buyerState: header.buyerState,
                buyerStateCode: header.buyerStateCode,
                gstType: header.gstType,
                placeOfSupply: header.placeOfSupply,
                paymentTerms: header.paymentTerms,
                poDate: flowType === 'Direct Invoice' ? null : (header.poDate || null),
                poNumber: flowType === 'Direct Invoice' ? '' : (header.poNumber || ''),
                remarks: header.remarks,
                transporterName: header.transporterName,
                vehicleNo: header.vehicleNo,
                lrNumber: header.lrNumber,
                freightAmount: Number(header.freightAmount) || 0,
                freightGstRate: Number(header.freightGstRate) || 0,
                items: rows.map(r => ({
                    itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
                    hsnCode: r.hsnCode, uom: r.uom,
                    qty: Number(r.qty), rate: Number(r.rate),
                    discountPercent: Number(r.discountPercent), gstRate: Number(r.gstRate),
                    description: r.description || '',
                    grnItemId: r.grnItemId || null, poItemId: r.poItemId || null,
                })),
            };
            let result;
            if (isEdit) {
                await updatePurchaseInvoice(id, payload);
                toast.success('Invoice updated!');
                result = { _id: id };
            } else {
                result = await createPurchaseInvoice(payload);
                toast.success(`Invoice ${result.invoiceNumber} posted!`);
            }
            navigate(PATHS.PURCHASE.INVOICE_DETAIL(result?._id));
        } catch (err) { toast.error(err.response?.data?.message || err.message || 'Failed'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>

            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <button onClick={() => { if (window.confirm('Discard changes?')) navigate(PATHS.PURCHASE.INVOICES); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>← Purchase Invoices</button>
                <h1 style={{ margin: '0 0 20px', fontSize: '22px', fontWeight: 700 }}>
                    {isEdit ? '✎ Edit Purchase Invoice' : '🧾 New Purchase Invoice'}
                </h1>
                {loading ? <BrandedLoader size={120} /> : (
                    <>
                        {isEdit ? (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <span style={{ fontSize: '20px' }}>{FLOWS.find(f => f.key === flowType)?.icon || '🧾'}</span>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Current Flow</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb' }}>{FLOWS.find(f => f.key === flowType)?.label || flowType}</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Select Purchase Flow</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                    {FLOWS.map(f => (
                                        <div key={f.key} onClick={() => { setFlowType(f.key); setRows([{ ...EMPTY_ROW }]); setH('selectedPoId', ''); setH('selectedGrnId', ''); }}
                                            style={{ padding: '12px 14px', borderRadius: '10px', border: `2px solid ${flowType === f.key ? '#3b82f6' : '#e2e8f0'}`, background: flowType === f.key ? '#eff6ff' : '#ffffff', cursor: 'pointer', transition: 'all 0.15s' }}>
                                            <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: flowType === f.key ? '#2563eb' : '#1e293b', marginBottom: '4px' }}>{f.label}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>{f.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}


                        <form onSubmit={handleSubmit}>
                            {/* Supplier + Buyer */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Supplier</h3>
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        <div><span style={lbl}>Supplier *</span>
                                            <select value={header.supplierId} onChange={e => onSupplierChange(e.target.value)} style={{ ...inp, cursor: isEdit && flowType !== 'Direct Invoice' ? 'not-allowed' : 'pointer' }} required disabled={isEdit && flowType !== 'Direct Invoice'}>
                                                <option value="">— Select Supplier —</option>
                                                {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>)}
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div><span style={lbl}>Supplier Inv No</span><input value={header.supplierInvoiceNo} onChange={e => setH('supplierInvoiceNo', e.target.value)} style={inp} placeholder="Supplier's Inv #" /></div>
                                            <div><span style={lbl}>Invoice Date *</span><input type="date" value={header.invoiceDate} onChange={e => setH('invoiceDate', e.target.value)} style={inp} required /></div>
                                        </div>
                                        <div><span style={lbl}>Supplier GSTIN</span><input value={header.supplierGstin} onChange={e => setH('supplierGstin', e.target.value)} style={inp} placeholder="15-digit GSTIN" /></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div><span style={lbl}>State</span><input value={header.supplierState} onChange={e => setH('supplierState', e.target.value)} style={inp} /></div>
                                            <div><span style={lbl}>State Code</span><input value={header.supplierStateCode} onChange={e => setH('supplierStateCode', e.target.value)} style={inp} placeholder="24" /></div>
                                        </div>
                                        <div><span style={lbl}>Supplier Address</span><textarea value={header.supplierAddress} onChange={e => setH('supplierAddress', e.target.value)} style={{ ...inp, height: '60px', resize: 'none' }} placeholder="Full address" /></div>
                                    </div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Buyer (Our Company)</h3>
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        <div><span style={lbl}>Company Name</span><input value={header.buyerName} onChange={e => setH('buyerName', e.target.value)} style={inp} /></div>
                                        <div><span style={lbl}>Our GSTIN</span><input value={header.buyerGstin} onChange={e => setH('buyerGstin', e.target.value)} style={inp} placeholder="Our GSTIN" /></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                                            <div><span style={lbl}>State</span><input value={header.buyerState} onChange={e => setH('buyerState', e.target.value)} style={inp} /></div>
                                            <div><span style={lbl}>State Code</span><input value={header.buyerStateCode} onChange={e => setH('buyerStateCode', e.target.value)} style={inp} /></div>
                                        </div>
                                        <div><span style={lbl}>Address</span><input value={header.buyerAddress} onChange={e => setH('buyerAddress', e.target.value)} style={inp} /></div>
                                    </div>
                                </div>
                            </div>


                            {/* References + GST */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>GST & References</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                    {needPO && (
                                        <div>
                                            <span style={lbl}>Purchase Order *</span>
                                            <select value={header.selectedPoId} onChange={e => onPoChange(e.target.value)} style={{ ...inp, cursor: isEdit ? 'not-allowed' : 'pointer' }} required={needPO} disabled={isEdit}>
                                                <option value="">— Select PO —</option>
                                                {poList.map(po => <option key={po._id} value={po._id}>{po.poNumber} ({po.status})</option>)}
                                            </select>
                                            {loadingRef && <BrandedLoader size={20} />}
                                        </div>
                                    )}
                                    {needGRN && (
                                        <div>
                                            <span style={lbl}>GRN {flowType === 'PO→GRN→Invoice' ? '(from selected PO)' : ''} *</span>
                                            <select value={header.selectedGrnId} onChange={e => onGrnChange(e.target.value)} style={{ ...inp, cursor: isEdit ? 'not-allowed' : 'pointer' }} required={needGRN} disabled={isEdit}>
                                                <option value="">— Select GRN —</option>
                                                {grnList.map(g => <option key={g._id} value={g._id}>{g.grnNumber} | {g.invoiceStatus}</option>)}
                                            </select>
                                            {loadingRef && <BrandedLoader size={20} />}
                                        </div>
                                    )}
                                    <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TAX TYPE</span>
                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: header.gstType === 'IGST' ? '#4f46e522' : '#05966922', color: header.gstType === 'IGST' ? '#4f46e5' : '#059669', border: `1px solid ${header.gstType === 'IGST' ? '#4f46e544' : '#05966944'}` }}>
                                            {header.gstType}
                                        </span>
                                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>(Auto-determined)</span>
                                    </div>
                                    <div><span style={lbl}>Place of Supply</span><input value={header.placeOfSupply} onChange={e => setH('placeOfSupply', e.target.value)} style={inp} /></div>
                                    <div><span style={lbl}>Payment Terms</span><input value={header.paymentTerms} onChange={e => setH('paymentTerms', e.target.value)} style={inp} /></div>
                                    {flowType !== 'Direct Invoice' && (
                                        <>
                                            <div><span style={lbl}>PO Number</span><input value={header.poNumber} onChange={e => setH('poNumber', e.target.value)} style={{ ...inp, background: needPO ? '#f8f9fa' : '#ffffff' }} readOnly={needPO} placeholder="Manual PO #" /></div>
                                            <div><span style={lbl}>PO Date</span><input type="date" value={header.poDate} onChange={e => setH('poDate', e.target.value)} style={{ ...inp, background: needPO ? '#f8f9fa' : '#ffffff' }} readOnly={needPO} /></div>
                                        </>
                                    )}
                                    <div style={{ gridColumn: flowType === 'Direct Invoice' ? 'span 1' : 'span 2' }}>
                                        <span style={lbl}>Remarks</span><input value={header.remarks} onChange={e => setH('remarks', e.target.value)} style={inp} placeholder="Any notes..." />
                                    </div>
                                </div>
                            </div>




                            {/* Transportation Details */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>🚛 Transportation Details</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                    <div><span style={lbl}>Transporter Name</span><input value={header.transporterName} onChange={e => setH('transporterName', e.target.value)} style={inp} placeholder="e.g. Blue Dart" /></div>
                                    <div><span style={lbl}>Vehicle No</span><input value={header.vehicleNo} onChange={e => setH('vehicleNo', e.target.value)} style={inp} placeholder="e.g. GJ01AB1234" /></div>
                                    <div><span style={lbl}>LR / Bilty No</span><input value={header.lrNumber} onChange={e => setH('lrNumber', e.target.value)} style={inp} placeholder="LR Number" /></div>
                                </div>
                            </div>


                            {/* Items */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                        Items {loadingRef ? <BrandedLoader size={20} inline /> : ''}
                                    </h3>
                                    {isManual && <button type="button" onClick={addRow} style={{ padding: '6px 14px', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>+ Add Row</button>}
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                            <tr style={{ background: '#f8f9fa', color: '#64748b' }}>
                                                {['#', 'Item', 'Description', 'HSN', 'UOM', 'Qty', 'Balance', 'Rate', 'Total', ''].map((h, i) =>
                                                    h !== '' ? <th key={i} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', minWidth: h === 'Qty' ? '120px' : 'auto' }}>{h}</th> : null
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, i) => {
                                                const c = calcRow(row);
                                                const isLocked = !isManual && row.itemId;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                                                        <td style={{ padding: '6px 10px', color: '#94a3b8', width: '28px' }}>{i + 1}</td>
                                                        <td style={{ padding: '6px 10px', minWidth: '160px' }}>
                                                            {isManual || !row.itemId ? (
                                                                <SearchableSelect
                                                                    options={items.map(it => ({ value: it._id, label: it.itemName, meta: it.itemCode }))}
                                                                    value={row.itemId}
                                                                    onChange={v => setRow(i, 'itemId', v)}
                                                                    onKeyDown={(e) => handleRowKeyDown(e, i, 1)}
                                                                    data-row={i}
                                                                    data-col={1}
                                                                    placeholder="— Search Item —"
                                                                    dark={false}
                                                                />
                                                            ) : (
                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{row.itemName}<div style={{ color: '#64748b', fontSize: '10px' }}>{row.itemCode}</div></div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '6px 10px', minWidth: '200px' }}>
                                                            <textarea
                                                                value={row.description}
                                                                onChange={e => setRow(i, 'description', e.target.value)}
                                                                onKeyDown={(e) => handleRowKeyDown(e, i, 2)}
                                                                data-row={i}
                                                                data-col={2}
                                                                style={{ ...inp, fontSize: '12px', height: '36px', resize: 'none', padding: '6px' }}
                                                                placeholder="Item description (optional)..."
                                                            />
                                                        </td>
                                                        <td style={{ padding: '6px 10px', width: '70px' }}><input value={row.hsnCode} onChange={e => setRow(i, 'hsnCode', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 3)} data-row={i} data-col={3} style={{ ...inp, fontSize: '12px' }} placeholder="HSN" /></td>
                                                        <td style={{ padding: '6px 10px', width: '55px' }}><input value={row.uom} onChange={e => setRow(i, 'uom', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 4)} data-row={i} data-col={4} style={{ ...inp, fontSize: '12px' }} readOnly={isLocked} /></td>
                                                        <td style={{ padding: '6px 10px', minWidth: '120px' }}>
                                                            <input type="number" min="0.01" max={flowType.includes('GRN') ? (row.maxQty || undefined) : undefined} step="0.01" value={row.qty} onChange={e => setRow(i, 'qty', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 5)} data-row={i} data-col={5} style={{ ...inp, fontSize: '12px', fontWeight: 'bold', minWidth: '100px', borderColor: row.maxQty && row.qty > row.maxQty ? '#ef4444' : '#e2e8f0' }} />
                                                        </td>
                                                        <td style={{ padding: '6px 10px', color: row.maxQty <= 0 ? '#ef4444' : '#64748b', fontSize: '11px', fontWeight: row.maxQty <= 0 ? 700 : 400 }}>{row.maxQty ?? '—'}</td>
                                                        <td style={{ padding: '6px 10px', width: '90px' }}><input type="number" min="0" step="0.01" value={row.rate} onChange={e => setRow(i, 'rate', e.target.value)} onKeyDown={(e) => handleRowKeyDown(e, i, 6)} data-row={i} data-col={6} style={{ ...inp, fontSize: '12px', minWidth: '70px' }} /></td>

                                                        <td style={{ padding: '6px 10px', color: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{c.total}</td>
                                                        <td style={{ padding: '6px 10px' }}>{isManual && rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>✕</button>}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals */}
                                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px 24px', border: '1px solid #e2e8f0', minWidth: '300px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        {[
                                            ['Taxable Amount', `₹${totals.taxable.toLocaleString()}`],
                                            ['Discount (−)', `₹${totals.disc.toLocaleString()}`],
                                            ...(isIGST ? [['IGST (Items)', `₹${totals.igst.toLocaleString()}`]] : [['CGST (Items)', `₹${totals.cgst.toLocaleString()}`], ['SGST (Items)', `₹${totals.sgst.toLocaleString()}`]]),
                                        ].map(([k, v]) => (
                                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                                <span>{k}</span><span>{v}</span>
                                            </div>
                                        ))}

                                        {/* Integrated Freight Summary */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#64748b', padding: '10px 0', borderTop: '1px dashed #e2e8f0', marginTop: '4px' }}>
                                            <span>Freight Summary</span>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input type="number" min="0" step="0.01" value={header.freightAmount} onChange={e => setH('freightAmount', Number(e.target.value))} style={{ ...inp, width: '80px', padding: '4px 8px' }} placeholder="Amt" title="Freight Amount" />
                                                <span style={{ fontWeight: 600, color: '#4b5563', minWidth: '70px', textAlign: 'right' }}>₹{r2(freightAmt).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                            <span>Round Off</span><span>₹{roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                                        </div>
 
                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '18px', color: '#059669' }}>
                                            <span>Grand Total</span><span>₹{grandWithFreight.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate(-1); }} style={{ padding: '10px 20px', borderRadius: '8px', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)' }}>
                                    {saving ? (isEdit ? 'Updating...' : 'Posting...') : (isEdit ? '💾 Update Invoice' : '🧾 Post Invoice')}
                                </button>
                            </div>

                        </form>
                    </>
                )}
            </div>


        </div>
    );
}

