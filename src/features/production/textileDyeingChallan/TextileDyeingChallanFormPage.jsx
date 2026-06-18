import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Plus, Trash2, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { getItems } from '@/services/itemApi';
import { listTextileJobWorkRates } from '@/services/textileJobWorkRateApi';
import { getSuppliers } from '@/services/purchaseApi';
import { createTextileJobWorkChallan, getTextileJobWorkChallanMeta } from '@/services/textileJobWorkChallanApi';
import { issueTextileProductionStage } from '@/services/textileProductionWorkflowApi';
import { enrichLineCalculations, summarizeLines, PCS_ROUND_MODES, LABOUR_RATE_TYPES } from '@/utils/textileDyeingChallanCalc';
import { getChallanDetailPath, getChallanIssueTitle } from '@/utils/textileJobWorkProcessConfig';
import { buildJobWorkerVendorList, findVendorRateForProcess } from '@/utils/textileJobWorkVendors';
import ProcessTypeSelect from '@/features/production/textileJobWork/ProcessTypeSelect';
import { PATHS } from '@/routes/paths';

const emptyLine = (processType) => ({
    lotNo: '', thanNo: '', fabricItemId: '', fabricType: '',
    colourInstructionType: 'FIXED_COLOUR', colourName: '', designPattern: '',
    issuedQty: '', issuedUom: 'Meter', issuedMeter: '',
    meterPerPcs: '', pcsRoundMode: 'ROUND_DOWN', expectedLossPercent: '',
    labourProcessName: processType, labourRateType: '', labourRate: '',
    expectedOutputItemId: '', expectedOutputUom: 'Meter', remarks: '',
});

const f = { label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }, input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' } };

export function TextileJobWorkChallanFormPage({
    processType = 'Dyeing',
    productionOrderContext = null,
    backPath = null,
    allowProcessSelect = false,
    onProcessTypeChange,
    unifiedModule = false,
}) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const isPoMode = !!productionOrderContext?.orderId;
    const showColourFields = isPoMode || cfg.showColourFields || allowProcessSelect;
    const showDesignField = (!isPoMode && cfg.showDesignField) || (allowProcessSelect && ['Embroidery', 'Printing', 'Other'].includes(processType));
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [allRates, setAllRates] = useState([]);
    const [vendorsLoading, setVendorsLoading] = useState(false);
    const [vendorsError, setVendorsError] = useState('');
    const [meta, setMeta] = useState(null);
    const [saving, setSaving] = useState(false);
    const [header, setHeader] = useState({
        issueDate: new Date().toISOString().slice(0, 10),
        dyerName: '',
        labourProcessName: processType,
        expectedReturnDate: '',
        remarks: '',
        labourRateType: '',
        labourRate: '',
    });
    const [lines, setLines] = useState([emptyLine(processType), emptyLine(processType)]);

    useEffect(() => {
        if (!allowProcessSelect || isPoMode) return;
        setHeader((h) => ({ ...h, labourProcessName: processType }));
        setLines([emptyLine(processType), emptyLine(processType)]);
    }, [processType, allowProcessSelect, isPoMode]);

    useEffect(() => {
        if (!productionOrderContext?.defaults) return;
        const d = productionOrderContext.defaults;
        setLines([
            {
                ...emptyLine(processType),
                lotNo: d.lotNo || '',
                thanNo: d.thanNo || '',
                fabricItemId: d.itemId || '',
                colourName: d.colour || '',
                designPattern: d.designNo || '',
                issuedUom: d.qtyUom === 'PCS' ? 'PCS' : 'Meter',
                expectedOutputItemId: d.outputItemId || d.itemId || '',
                expectedOutputUom: d.qtyUom || 'PCS',
            },
            emptyLine(processType),
        ]);
    }, [productionOrderContext?.orderId, processType]);

    useEffect(() => {
        if (!isTextile) return;
        getTextileJobWorkChallanMeta(processType).then(setMeta).catch(() => {});
        getItems({ limit: 500 }).then((d) => setItems(d.items || d.data || [])).catch(() => {});
        if (!selectedCompany?._id) {
            setVendors([]);
            setVendorsError('Select your Handloom / Textile company from the top company selector first.');
            return;
        }
        setVendorsLoading(true);
        setVendorsError('');
        Promise.all([
            listTextileJobWorkRates({ companyId: selectedCompany._id, isActive: 'true' }),
            getSuppliers({ limit: 500, isActive: 'true' }).catch(() => ({ suppliers: [] })),
        ])
            .then(([rates, supplierRes]) => {
                setAllRates(rates || []);
                const unique = buildJobWorkerVendorList(rates, supplierRes);
                setVendors(unique);
                if (!unique.length) {
                    setVendorsError(`No job workers or suppliers found for "${selectedCompany.companyName || 'selected company'}". Add suppliers in Purchase or rates in Job Work Rate Master.`);
                }
            })
            .catch((e) => {
                setVendors([]);
                const msg = e.response?.data?.message || 'Could not load vendors from Job Work Rate Master';
                setVendorsError(msg);
                toast.error(msg);
            })
            .finally(() => setVendorsLoading(false));
    }, [isTextile, selectedCompany?._id, selectedCompany?.companyName, processType]);

    const enrichedLines = useMemo(() => lines.map(enrichLineCalculations), [lines]);
    const summary = useMemo(() => summarizeLines(lines.filter((l) => Number(l.issuedMeter) > 0 || Number(l.issuedQty) > 0)), [lines]);

    const setLine = (idx, k, v) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));

    const setLineUom = (idx, newUom) => {
        setLines((prev) => prev.map((l, i) => {
            if (i !== idx) return l;
            const qty = l.issuedMeter || l.issuedQty || '';
            if (newUom === 'PCS') return { ...l, issuedUom: newUom, issuedQty: qty, issuedMeter: '' };
            return { ...l, issuedUom: newUom, issuedMeter: qty, issuedQty: '' };
        }));
    };

    const setLineIssueQty = (idx, value) => {
        setLines((prev) => prev.map((l, i) => {
            if (i !== idx) return l;
            if (l.issuedUom === 'PCS') return { ...l, issuedQty: value, issuedMeter: '' };
            return { ...l, issuedMeter: value, issuedQty: '' };
        }));
    };

    const getLinePlanLabel = (line, idx) => {
        const parts = [
            line.lotNo ? `Lot ${line.lotNo}` : '',
            line.thanNo ? `Than ${line.thanNo}` : '',
            line.colourName || line.designPattern || '',
        ].filter(Boolean);
        return parts.length ? parts.join(' · ') : `Line ${idx + 1}`;
    };

    const applyVendorRates = (vendorName) => {
        const match = findVendorRateForProcess(allRates, vendorName, processType);
        if (!match) return;
        setHeader((h) => ({ ...h, labourRateType: match.rateType, labourRate: match.defaultRate }));
        setLines((prev) => prev.map((l) => ({
            ...l,
            labourProcessName: processType,
            labourRateType: match.rateType,
            labourRate: match.defaultRate,
        })));
    };

    const handleVendorChange = (vendorName) => {
        setHeader((h) => ({ ...h, dyerName: vendorName }));
        applyVendorRates(vendorName);
    };

    const applyHeaderLabourToLines = () => {
        setLines((prev) => prev.map((l) => ({
            ...l,
            labourProcessName: header.labourProcessName || processType,
            labourRateType: header.labourRateType,
            labourRate: header.labourRate,
        })));
    };

    const addLine = () => setLines((p) => [...p, { ...emptyLine(processType), labourRateType: header.labourRateType, labourRate: header.labourRate }]);
    const removeLine = (idx) => setLines((p) => p.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.dyerName.trim()) return toast.error(`${cfg.vendorLabel} is required`);
        setSaving(true);
        try {
            const payloadLines = lines.filter((l) => l.fabricItemId && (l.issuedMeter || l.issuedQty)).map((l) => ({
                ...l,
                issuedMeter: l.issuedMeter ? Number(l.issuedMeter) : undefined,
                issuedQty: l.issuedQty ? Number(l.issuedQty) : undefined,
                issuedUom: l.issuedUom || 'Meter',
                meterPerPcs: l.meterPerPcs ? Number(l.meterPerPcs) : 0,
                expectedLossPercent: l.expectedLossPercent ? Number(l.expectedLossPercent) : 0,
                labourRate: l.labourRate ? Number(l.labourRate) : 0,
                designPattern: l.designPattern || l.colourName || '',
            }));
            if (!payloadLines.length) return toast.error('Add at least one line with input item and quantity');
            if (isPoMode) {
                const result = await issueTextileProductionStage(productionOrderContext.orderId, {
                    companyId: selectedCompany._id,
                    vendorName: header.dyerName.trim(),
                    dyerName: header.dyerName.trim(),
                    issueDate: header.issueDate,
                    expectedReturnDate: header.expectedReturnDate || undefined,
                    labourProcessName: header.labourProcessName || processType,
                    remarks: header.remarks,
                    lines: payloadLines,
                });
                const wo = result.challan || result;
                toast.success(`Challan ${wo.challanNo} created   linked to ${productionOrderContext.orderNo}`);
                navigate(`${getChallanDetailPath(processType, wo._id)}?po=${productionOrderContext.orderId}`);
                return;
            }
            const wo = await createTextileJobWorkChallan(processType, {
                companyId: selectedCompany._id,
                ...header,
                labourRate: undefined,
                labourRateType: undefined,
                lines: payloadLines,
            });
            toast.success(`Challan ${wo.challanNo} created`);
            navigate(cfg.paths.detail(wo._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const roundModes = meta?.pcsRoundModes || PCS_ROUND_MODES;
    const rateTypes = meta?.labourRateTypes || LABOUR_RATE_TYPES;

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(backPath || cfg.paths.list)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>
                {isPoMode ? getChallanIssueTitle(processType) : (unifiedModule ? 'Issue Challan' : cfg.newIssueTitle)}
            </h1>
            {isPoMode && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    <div>Production Order: <strong>{productionOrderContext.orderNo}</strong></div>
                    <div>Process Type: <strong>{processType}</strong> � Stage: <strong>{productionOrderContext.stageName}</strong></div>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Header</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {allowProcessSelect && !isPoMode && (
                            <ProcessTypeSelect value={processType} onChange={onProcessTypeChange} />
                        )}
                        {isPoMode && (
                            <>
                                <label><span style={f.label}>Production Order No</span><input value={productionOrderContext.orderNo} readOnly style={{ ...f.input, background: '#f8fafc' }} /></label>
                                <label><span style={f.label}>Process Type</span><input value={processType} readOnly style={{ ...f.input, background: '#f8fafc' }} /></label>
                            </>
                        )}
                        <label><span style={f.label}>Issue Date</span><input type="date" value={header.issueDate} onChange={(e) => setHeader({ ...header, issueDate: e.target.value })} style={f.input} /></label>
                        <label><span style={f.label}>{cfg.vendorLabel} *</span>
                            {vendorsLoading ? (
                                <input readOnly value="Loading from Job Work Rate Master…" style={{ ...f.input, background: '#f8fafc', color: '#64748b' }} />
                            ) : vendors.length > 0 ? (
                                <select
                                    value={header.dyerName}
                                    onChange={(e) => handleVendorChange(e.target.value)}
                                    required
                                    style={f.input}
                                >
                                    <option value="">Select {cfg.vendorLabel.toLowerCase()}…</option>
                                    {vendors.map((v) => {
                                        const rate = findVendorRateForProcess(allRates, v.vendorWorker, processType);
                                        return (
                                        <option key={v.vendorWorker} value={v.vendorWorker}>
                                            {v.vendorWorker}
                                            {rate?.defaultRate != null ? ` — ₹${rate.defaultRate}` : ''}
                                            {rate?.rateType ? ` (${(meta?.labourRateTypes || LABOUR_RATE_TYPES).find((r) => r.value === rate.rateType)?.label || rate.rateType})` : ''}
                                        </option>
                                        );
                                    })}
                                </select>
                            ) : (
                                <>
                                    <input
                                        value={header.dyerName}
                                        onChange={(e) => handleVendorChange(e.target.value)}
                                        onBlur={(e) => applyVendorRates(e.target.value)}
                                        required
                                        placeholder={`Type ${cfg.vendorLabel.toLowerCase()} manually`}
                                        style={f.input}
                                    />
                                </>
                            )}
                            {vendorsError && !vendorsLoading && (
                                <div style={{ fontSize: 11, color: '#b45309', marginTop: 6, lineHeight: 1.5 }}>
                                    {vendorsError}
                                    <div style={{ marginTop: 4 }}>
                                        Open <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_JOB_WORK_RATES)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 11 }}>Job Work Rate Master</button>
                                        {' '}→ Add row with Process = <strong>{processType}</strong>, save, then refresh this page.
                                    </div>
                                </div>
                            )}
                            {vendors.length > 0 && !vendorsLoading && (
                                <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                                    {vendors.length} name(s) loaded from Job Work Rate Master for {processType}.
                                </div>
                            )}
                        </label>
                        <label><span style={f.label}>Expected Return</span><input type="date" value={header.expectedReturnDate} onChange={(e) => setHeader({ ...header, expectedReturnDate: e.target.value })} style={f.input} /></label>
                        <label><span style={f.label}>Remarks</span><input value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} style={f.input} /></label>
                        {allowProcessSelect && !isPoMode && (
                            <label><span style={f.label}>Production Order No</span><input value={header.productionOrderNo || ''} onChange={(e) => setHeader({ ...header, productionOrderNo: e.target.value })} placeholder="Optional" style={f.input} /></label>
                        )}
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#475569' }}>{cfg.labourSectionTitle}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'end' }}>
                            <label><span style={f.label}>Process</span><input value={header.labourProcessName} readOnly style={{ ...f.input, background: '#f8fafc' }} /></label>
                            <label><span style={f.label}>Rate Type</span>
                                <select value={header.labourRateType} onChange={(e) => setHeader({ ...header, labourRateType: e.target.value })} style={f.input}>
                                    <option value="">Select</option>
                                    {rateTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </label>
                            <label><span style={f.label}>Rate (� )</span><input type="number" min="0" step="any" value={header.labourRate} onChange={(e) => setHeader({ ...header, labourRate: e.target.value })} style={f.input} /></label>
                            <button type="button" onClick={applyHeaderLabourToLines} style={{ padding: '8px 12px', border: '1px solid #c4b5fd', background: '#ede9fe', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Apply to all lines</button>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Auto-filled from Job Work Rate Master when vendor is selected</div>
                        </div>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Line Items</h2>
                        <button type="button" onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #d1d5db', background: '#f8fafc', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}><Plus size={14} /> Add Row</button>
                    </div>
                    {enrichedLines.map((ln, idx) => (
                        <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                                <label><span style={f.label}>Lot No</span><input value={lines[idx].lotNo} onChange={(e) => setLine(idx, 'lotNo', e.target.value)} style={f.input} /></label>
                                <label><span style={f.label}>Than No</span><input value={lines[idx].thanNo} onChange={(e) => setLine(idx, 'thanNo', e.target.value)} style={f.input} /></label>
                                <label style={{ gridColumn: 'span 2' }}><span style={f.label}>{cfg.inputItemLabel} *</span>
                                    <select value={lines[idx].fabricItemId} onChange={(e) => setLine(idx, 'fabricItemId', e.target.value)} style={f.input}>
                                        <option value="">Select</option>
                                        {items.map((it) => <option key={it._id} value={it._id}>{it.itemCode ? `${it.itemCode}   ` : ''}{it.itemName}</option>)}
                                    </select>
                                </label>
                                <label><span style={f.label}>Input Qty</span><input type="number" min="0.0001" step="any" value={lines[idx].issuedQty || lines[idx].issuedMeter} onChange={(e) => setLineIssueQty(idx, e.target.value)} style={f.input} /></label>
                                <label><span style={f.label}>Input UOM</span>
                                    <select value={lines[idx].issuedUom} onChange={(e) => setLineUom(idx, e.target.value)} style={f.input}>
                                        {['Meter', 'PCS', 'Than'].map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                                {showColourFields && (
                                    <>
                                        <label><span style={f.label}>Colour Type</span>
                                            <select value={lines[idx].colourInstructionType} onChange={(e) => setLine(idx, 'colourInstructionType', e.target.value)} style={f.input}>
                                                {(meta?.colourInstructions || []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                            </select>
                                        </label>
                                        <label><span style={f.label}>Colour Name</span><input value={lines[idx].colourName} onChange={(e) => setLine(idx, 'colourName', e.target.value)} placeholder="Blue / White" style={f.input} /></label>
                                    </>
                                )}
                                {showDesignField && (
                                    <label style={{ gridColumn: 'span 2' }}><span style={f.label}>{cfg.designLabel}</span><input value={lines[idx].designPattern} onChange={(e) => setLine(idx, 'designPattern', e.target.value)} placeholder="EMB-101" style={f.input} /></label>
                                )}
                                <label><span style={f.label}>Meter Per PCS</span><input type="number" min="0" step="any" value={lines[idx].meterPerPcs} onChange={(e) => setLine(idx, 'meterPerPcs', e.target.value)} placeholder="8" style={f.input} /></label>
                                <label><span style={f.label}>PCS Round</span>
                                    <select value={lines[idx].pcsRoundMode} onChange={(e) => setLine(idx, 'pcsRoundMode', e.target.value)} style={f.input}>
                                        {roundModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                </label>
                                <label><span style={f.label}>Expected Loss %</span><input type="number" min="0" max="100" step="any" value={lines[idx].expectedLossPercent} onChange={(e) => setLine(idx, 'expectedLossPercent', e.target.value)} style={f.input} /></label>
                                <label><span style={f.label}>Labour Rate Type</span>
                                    <select value={lines[idx].labourRateType} onChange={(e) => setLine(idx, 'labourRateType', e.target.value)} style={f.input}>
                                        <option value="">Select</option>
                                        {rateTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </label>
                                <label><span style={f.label}>Labour Rate (� )</span><input type="number" min="0" step="any" value={lines[idx].labourRate} onChange={(e) => setLine(idx, 'labourRate', e.target.value)} style={f.input} /></label>
                                <label style={{ gridColumn: 'span 2' }}><span style={f.label}>Expected Output Item</span>
                                    <select value={lines[idx].expectedOutputItemId} onChange={(e) => setLine(idx, 'expectedOutputItemId', e.target.value)} style={f.input}>
                                        <option value="">Optional</option>
                                        {items.map((it) => <option key={it._id} value={it._id}>{it.itemName}</option>)}
                                    </select>
                                </label>
                                <label><span style={f.label}>Expected Output UOM</span>
                                    <select value={lines[idx].expectedOutputUom} onChange={(e) => setLine(idx, 'expectedOutputUom', e.target.value)} style={f.input}>
                                        {['Meter', 'PCS', 'Than'].map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </label>
                                <div style={{ display: 'flex', alignItems: 'end' }}>
                                    <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 1} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                </div>
                            </div>
                            {(() => {
                                const hasIssueQty = Number(ln.issuedMeter) > 0 || Number(ln.issuedQty) > 0;
                                const hasMpp = Number(lines[idx].meterPerPcs) > 0;
                                const isPcsIssue = String(lines[idx].issuedUom || '').toUpperCase() === 'PCS';
                                const expectedPcsDisplay = isPcsIssue && hasIssueQty && !hasMpp
                                    ? (Number(ln.issuedQty) || Number(ln.issuedMeter) || 0)
                                    : (hasMpp && hasIssueQty ? ln.expectedPcs : null);
                                return (
                                    <div style={{ marginTop: 12, padding: 14, background: '#ede9fe', border: '2px solid #7c3aed', borderRadius: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#5b21b6', marginBottom: 10 }}>
                                            Expected Return Plan — {getLinePlanLabel(lines[idx], idx)}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, fontSize: 13 }}>
                                            <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Issued</div>
                                                <strong>{hasIssueQty ? `${ln.issuedMeter || ln.issuedQty} ${lines[idx].issuedUom}` : '—'}</strong>
                                            </div>
                                            <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expected PCS</div>
                                                <strong style={{ color: '#5b21b6', fontSize: 16 }}>{expectedPcsDisplay ?? '—'}</strong>
                                            </div>
                                            <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expected Return Meter</div>
                                                <strong>{hasMpp && hasIssueQty ? ln.expectedReturnMeter : (hasIssueQty && isPcsIssue ? '—' : '—')}</strong>
                                            </div>
                                            <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expected Loss Meter</div>
                                                <strong>{hasMpp && hasIssueQty ? ln.expectedLossMeter : '—'}</strong>
                                            </div>
                                            <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Labour Amount</div>
                                                <strong>{ln.labourAmount > 0 ? `₹ ${ln.labourAmount}` : '—'}</strong>
                                            </div>
                                        </div>
                                        {hasIssueQty && !hasMpp && !isPcsIssue && (
                                            <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>
                                                Enter <strong>Meter Per PCS</strong> on this same line to calculate expected PCS.
                                            </div>
                                        )}
                                        {!hasIssueQty && (
                                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                                Enter Input Qty to see expected return for this lot / colour.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    ))}
                </div>

                <div style={{ background: '#faf5ff', border: '2px solid #ddd6fe', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#6d28d9' }}>Challan Summary</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                        <div>Total Issued Meter: <strong>{summary.totalIssuedMeter}</strong></div>
                        <div>Total Expected PCS: <strong>{summary.totalExpectedPcs}</strong></div>
                        <div>Total Expected Return Meter: <strong>{summary.totalExpectedReturnMeter}</strong></div>
                        <div>Total Expected Loss Meter: <strong>{summary.totalExpectedLossMeter}</strong></div>
                        <div>Total Labour Amount: <strong>� {summary.totalLabourAmount}</strong></div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        <Save size={16} /> {saving ? 'Saving& ' : (isPoMode ? 'Save Challan & Issue Stock' : 'Create Challan & Issue Stock')}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function TextileDyeingChallanFormPage() {
    return <TextileJobWorkChallanFormPage processType="Dyeing" />;
}
