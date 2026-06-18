import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save, ScanLine } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { getTextileProductionOrder, receiveTextileProductionStage } from '@/services/textileProductionWorkflowApi';
import { getTextileJobWorkChallan, lookupTextileJobWorkChallan, getTextileJobWorkChallanBarcode } from '@/services/textileJobWorkChallanApi';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { resolveStageProcessType, stageLabel } from '@/utils/textileProductionWorkflowHelpers';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const f = { label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }, input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' } };

function buildReturnLines(doc) {
    return (doc.lines || []).filter((l) => (l.pendingMeter || 0) > 0).map((l) => ({
        challanLineId: l._id,
        colourName: l.colourName || l.designPattern || '',
        returnedQty: '',
        returnUom: l.expectedOutputUom || 'Meter',
        creditedMeter: '',
        pendingMeter: l.pendingMeter,
        issuedMeter: l.issuedMeter,
    }));
}

export default function TextileProcessReceiveChallanPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [order, setOrder] = useState(null);
    const [challan, setChallan] = useState(null);
    const [barcode, setBarcode] = useState(null);
    const [scanValue, setScanValue] = useState('');
    const [returnLines, setReturnLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [remarks, setRemarks] = useState('');

    const applyChallan = useCallback(async (doc, processType) => {
        setChallan(doc);
        setReturnLines(buildReturnLines(doc));
        try {
            const bc = await getTextileJobWorkChallanBarcode(processType, doc._id);
            setBarcode(bc);
        } catch {
            setBarcode(null);
        }
    }, []);

    const load = useCallback(async () => {
        const o = await getTextileProductionOrder(orderId);
        setOrder(o);
        const stage = o.stageStates?.[o.currentStageIndex];
        const processType = resolveStageProcessType(stage);
        if (!stage?.activeChallanId || !processType) {
            setChallan(null);
            setReturnLines([]);
            setBarcode(null);
            return;
        }
        const doc = await getTextileJobWorkChallan(processType, stage.activeChallanId);
        await applyChallan(doc, processType);
    }, [orderId, applyChallan]);

    useEffect(() => {
        if (!isTextile || !orderId) return setLoading(false);
        load().catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [isTextile, orderId, load]);

    const setLine = (idx, k, v) => setReturnLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));

    const handleScan = async () => {
        const stage = order?.stageStates?.[order?.currentStageIndex];
        const processType = resolveStageProcessType(stage);
        if (!scanValue.trim() || !processType) return toast.error('Scan or enter challan barcode');
        try {
            const doc = await lookupTextileJobWorkChallan(processType, scanValue.trim());
            if (String(doc._id) !== String(stage?.activeChallanId)) {
                return toast.error('Scanned challan does not match the active stage challan for this order');
            }
            await applyChallan(doc, processType);
            toast.success(`Challan ${doc.challanNo} loaded`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Challan not found');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payloadLines = returnLines.filter((l) => Number(l.returnedQty) > 0).map((l) => ({
            challanLineId: l.challanLineId,
            returnedQty: Number(l.returnedQty),
            returnUom: l.returnUom || 'Meter',
            creditedMeter: l.creditedMeter ? Number(l.creditedMeter) : undefined,
        }));
        if (!payloadLines.length) return toast.error('Enter return quantity for at least one line');
        setSaving(true);
        try {
            await receiveTextileProductionStage(orderId, {
                companyId: selectedCompany._id,
                lines: payloadLines,
                remarks,
            });
            toast.success('Material received from vendor');
            navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;
    if (loading) return <BrandedLoader size={80} />;
    if (!order) return <div style={{ padding: 24 }}>Production order not found</div>;

    const stage = order.stageStates?.[order.currentStageIndex];
    const processType = resolveStageProcessType(stage);
    const cfg = processType ? getTextileJobWorkProcessConfig(processType) : null;

    if (!stage?.activeChallanId || !challan) {
        return (
            <div style={{ padding: 24 }}>
                <p>No active issue challan on this stage. Issue material first.</p>
                <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId))}>Back to order</button>
            </div>
        );
    }

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1000, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(orderId))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                <ChevronLeft size={16} /> Back to Production Order
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{cfg?.returnTitle || 'Receive Material'} — {processType}</h1>
            <p style={{ margin: '0 0 16px', color: '#64748b' }}>
                PO {order.orderNo} · Stage {stageLabel(stage)} · Challan {challan.challanNo} · {challan.dyerName} · Pending {challan.totalPendingMeter} m
            </p>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ScanLine size={16} /> Scan Barcode</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input value={scanValue} onChange={(e) => setScanValue(e.target.value)} placeholder="Scan challan barcode or enter challan no" style={{ ...f.input, flex: 1, minWidth: 220 }} />
                    <button type="button" onClick={handleScan} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Load Challan</button>
                </div>
            </div>

            {barcode?.dataUrl && (
                <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14, marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Challan barcode — scan at return</div>
                    <img src={barcode.dataUrl} alt="Challan barcode" style={{ maxWidth: 280 }} />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, wordBreak: 'break-all' }}>{barcode.barcodeValue}</div>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Actual Return Entry</h2>
                    {returnLines.length === 0 && <p style={{ color: '#94a3b8' }}>All lines fully returned.</p>}
                    {returnLines.map((ln, idx) => (
                        <div key={ln.challanLineId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>{ln.colourName || `Line ${idx + 1}`} · Issued {ln.issuedMeter} m · Pending {ln.pendingMeter} m</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                <label><span style={f.label}>Return Qty</span><input type="number" min="0.0001" step="any" value={ln.returnedQty} onChange={(e) => setLine(idx, 'returnedQty', e.target.value)} style={f.input} /></label>
                                <label><span style={f.label}>Return UOM</span>
                                    <select value={ln.returnUom} onChange={(e) => setLine(idx, 'returnUom', e.target.value)} style={f.input}>
                                        {['Meter', 'PCS', 'Than'].map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                                <label><span style={f.label}>Credited Meter</span><input type="number" min="0" step="any" value={ln.creditedMeter} onChange={(e) => setLine(idx, 'creditedMeter', e.target.value)} placeholder="Optional" style={f.input} /></label>
                            </div>
                        </div>
                    ))}
                    <label><span style={f.label}>Remarks</span><input value={remarks} onChange={(e) => setRemarks(e.target.value)} style={f.input} /></label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" disabled={saving || returnLines.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        <Save size={16} /> {saving ? 'Saving...' : `Receive and Update ${cfg?.stockWithLabel || 'Stock'}`}
                    </button>
                </div>
            </form>
        </div>
    );
}
