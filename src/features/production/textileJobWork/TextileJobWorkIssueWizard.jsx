import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Package, Palette, Calculator, CheckCircle, Plus, Trash2, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { getItems } from '@/services/itemApi';
import { listTextileJobWorkRates } from '@/services/textileJobWorkRateApi';
import { getSuppliers } from '@/services/purchaseApi';
import { createTextileJobWorkChallan, getTextileJobWorkChallanMeta } from '@/services/textileJobWorkChallanApi';
import { listAvailableProcessOutput } from '@/services/textileProcessOutputApi';
import { enrichLineCalculations, summarizeLines, PCS_ROUND_MODES, LABOUR_RATE_TYPES } from '@/utils/textileDyeingChallanCalc';
import { buildJobWorkerVendorList, findVendorRateForProcess } from '@/utils/textileJobWorkVendors';
import ProcessTypeSelect from '@/features/production/textileJobWork/ProcessTypeSelect';
import { PATHS } from '@/routes/paths';

const STEPS = ['Header', 'Select Stock', 'Colour Split', 'Labour', 'Review & Save'];
const f = { label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }, input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' } };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 };
const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptySplit = () => ({ id: uid(), colourInstructionType: 'FIXED_COLOUR', colourName: '', splitMeter: '' });

function stockUsesPcs(stock) {
    return stock?.issueUom === 'PCS'
        || (stock?.sourceType === 'PREVIOUS_PROCESS_OUTPUT' && String(stock?.qtyUom || 'PCS').toUpperCase() !== 'METER');
}

function stockIssueQty(stock) {
    return stockUsesPcs(stock) ? Number(stock.selectedQty) || 0 : Number(stock.selectedMeter) || 0;
}

function stockIssueUnit(stock) {
    return stockUsesPcs(stock) ? 'PCS' : 'Mtr';
}

function deriveMeterPerPcs(stock) {
    if (!stock) return '';
    if (Number(stock.meterPerPcs) > 0) return Number(stock.meterPerPcs);
    if (Number(stock.originalIssuedPcs) > 0 && Number(stock.originalIssuedMeter) > 0) {
        return Math.round((Number(stock.originalIssuedMeter) / Number(stock.originalIssuedPcs)) * 1000) / 1000;
    }
    if (Number(stock.selectedQty) > 0 && Number(stock.selectedMeter) > 0) {
        return Math.round((Number(stock.selectedMeter) / Number(stock.selectedQty)) * 1000) / 1000;
    }
    return '';
}

function findStockForLineKey(selectedStock, settingsKey) {
    const stockId = String(settingsKey || '').split(':')[0];
    return selectedStock.find((s) => s.id === stockId);
}

export default function TextileJobWorkIssueWizard({ processType, onProcessTypeChange, backPath }) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [step, setStep] = useState(0);
    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [allRates, setAllRates] = useState([]);
    const [meta, setMeta] = useState(null);
    const [saving, setSaving] = useState(false);
    const [header, setHeader] = useState({ issueDate: new Date().toISOString().slice(0, 10), dyerName: '', expectedReturnDate: '', remarks: '', labourRateType: '', labourRate: '' });
    const [selectedStock, setSelectedStock] = useState([]);
    const [colourSplits, setColourSplits] = useState({});
    const [lineSettings, setLineSettings] = useState({});
    const [pickItemId, setPickItemId] = useState('');
    const [pickLot, setPickLot] = useState('');
    const [pickThan, setPickThan] = useState('');
    const [pickQty, setPickQty] = useState('');
    const [bulkLabour, setBulkLabour] = useState({ rateType: '', rate: '' });
    const [sourceType, setSourceType] = useState('DIRECT_STOCK');
    const [processOutputs, setProcessOutputs] = useState([]);
    const [loadingOutputs, setLoadingOutputs] = useState(false);

    useEffect(() => {
        if (!isTextile) return;
        getTextileJobWorkChallanMeta(processType).then(setMeta).catch(() => {});
        getItems({ limit: 500 }).then((d) => setItems(d.items || d.data || [])).catch(() => {});
        if (selectedCompany?._id) {
            Promise.all([
                listTextileJobWorkRates({ companyId: selectedCompany._id, isActive: 'true' }),
                getSuppliers({ limit: 500, isActive: 'true' }).catch(() => ({ suppliers: [] })),
            ])
                .then(([rates, supplierRes]) => {
                    setAllRates(rates || []);
                    setVendors(buildJobWorkerVendorList(rates, supplierRes));
                })
                .catch(() => {
                    setAllRates([]);
                    setVendors([]);
                });
        } else {
            setAllRates([]);
            setVendors([]);
        }
    }, [isTextile, selectedCompany?._id, processType]);

    useEffect(() => {
        if (processType === 'Dyeing') setSourceType('DIRECT_STOCK');
    }, [processType]);

    useEffect(() => {
        if (!isTextile || sourceType !== 'PREVIOUS_PROCESS_OUTPUT' || !selectedCompany?._id) {
            setProcessOutputs([]);
            setLoadingOutputs(false);
            return;
        }
        setLoadingOutputs(true);
        listAvailableProcessOutput({ companyId: selectedCompany._id, forProcess: processType })
            .then(setProcessOutputs)
            .catch(() => setProcessOutputs([]))
            .finally(() => setLoadingOutputs(false));
    }, [isTextile, selectedCompany?._id, processType, sourceType]);

    useEffect(() => {
        if (!header.dyerName.trim()) return;
        const match = findVendorRateForProcess(allRates, header.dyerName, processType);
        setHeader((h) => ({
            ...h,
            labourRateType: match?.rateType || '',
            labourRate: match?.defaultRate ?? '',
        }));
    }, [processType, allRates]);

    useEffect(() => {
        if (step !== 3) return;
        setBulkLabour((prev) => ({
            rateType: prev.rateType || header.labourRateType || '',
            rate: prev.rate !== '' && prev.rate != null ? prev.rate : (header.labourRate ?? ''),
        }));
    }, [step, header.labourRateType, header.labourRate]);

    useEffect(() => {
        if (step !== 3 || sourceType !== 'PREVIOUS_PROCESS_OUTPUT') return;
        setLineSettings((prev) => {
            const next = { ...prev };
            let changed = false;
            selectedStock.forEach((stock) => {
                (colourSplits[stock.id] || []).forEach((split) => {
                    const key = `${stock.id}:${split.id}`;
                    const mpp = deriveMeterPerPcs(stock);
                    if (!mpp) return;
                    if (String(prev[key]?.meterPerPcs || '') === String(mpp)) return;
                    next[key] = {
                        meterPerPcs: mpp,
                        pcsRoundMode: prev[key]?.pcsRoundMode ?? 'ROUND_DOWN',
                        expectedLossPercent: prev[key]?.expectedLossPercent ?? '',
                        expectedOutputItemId: prev[key]?.expectedOutputItemId ?? stock.fabricItemId,
                        expectedOutputUom: prev[key]?.expectedOutputUom ?? 'PCS',
                        labourRateType: prev[key]?.labourRateType ?? header.labourRateType ?? '',
                        labourRate: prev[key]?.labourRate ?? header.labourRate ?? '',
                    };
                    changed = true;
                });
            });
            return changed ? next : prev;
        });
    }, [step, sourceType, selectedStock, colourSplits, header.labourRateType, header.labourRate]);

    const applyBulkLabour = (rateType, rate) => {
        setBulkLabour({ rateType, rate });
        setLineSettings((prev) => {
            const next = { ...prev };
            selectedStock.forEach((stock) => {
                (colourSplits[stock.id] || []).forEach((split) => {
                    const meter = Number(split.splitMeter) || 0;
                    if (meter <= 0) return;
                    const key = `${stock.id}:${split.id}`;
                    next[key] = {
                        meterPerPcs: prev[key]?.meterPerPcs ?? deriveMeterPerPcs(stock) ?? '',
                        pcsRoundMode: prev[key]?.pcsRoundMode ?? 'ROUND_DOWN',
                        expectedLossPercent: prev[key]?.expectedLossPercent ?? '',
                        expectedOutputItemId: prev[key]?.expectedOutputItemId ?? stock.fabricItemId,
                        expectedOutputUom: prev[key]?.expectedOutputUom ?? 'PCS',
                        labourRateType: rateType,
                        labourRate: rate,
                    };
                });
            });
            return next;
        });
    };

    const stockRows = useMemo(() => (items || [])
        .filter((it) => Number(it.currentStock || 0) > 0)
        .map((it) => ({
            itemId: it._id,
            itemCode: it.itemCode,
            itemName: it.itemName,
            lotNo: it.textile?.lotNo || '',
            thanNo: it.textile?.than || it.textile?.rollNo || '',
            availableMeter: Number(it.currentStock || 0),
            colour: it.textile?.colour || '',
        })), [items]);

    const defaultLineSettings = (stock) => ({
        meterPerPcs: stock.meterPerPcs || '',
        pcsRoundMode: 'ROUND_DOWN',
        expectedLossPercent: '',
        labourRateType: header.labourRateType || '',
        labourRate: header.labourRate || '',
        expectedOutputItemId: stock.fabricItemId,
        expectedOutputUom: 'PCS',
    });

    const issueLines = useMemo(() => {
        const out = [];
        selectedStock.forEach((stock) => {
            (colourSplits[stock.id] || []).forEach((split) => {
                const splitVal = Number(split.splitMeter) || 0;
                if (splitVal <= 0) return;
                const settingsKey = `${stock.id}:${split.id}`;
                const settings = { ...defaultLineSettings(stock), ...(lineSettings[settingsKey] || {}) };
                const isPcs = stockUsesPcs(stock);
                const mpp = Number(settings.meterPerPcs) || Number(deriveMeterPerPcs(stock)) || 0;
                if (isPcs) {
                    out.push({
                        _settingsKey: settingsKey,
                        lotNo: stock.lotNo,
                        thanNo: stock.thanNo,
                        fabricItemId: stock.fabricItemId,
                        itemCode: stock.itemCode,
                        itemName: stock.itemName,
                        colourInstructionType: split.colourInstructionType || 'FIXED_COLOUR',
                        colourName: split.colourName || stock.outputColour || '',
                        issuedQty: splitVal,
                        issuedUom: 'PCS',
                        issuedMeter: mpp > 0 ? Math.round(splitVal * mpp * 1000) / 1000 : splitVal,
                        meterPerPcs: mpp,
                        pcsRoundMode: settings.pcsRoundMode || 'ROUND_DOWN',
                        expectedLossPercent: settings.expectedLossPercent,
                        labourProcessName: processType,
                        labourRateType: settings.labourRateType,
                        labourRate: settings.labourRate,
                        expectedOutputItemId: settings.expectedOutputItemId,
                        expectedOutputUom: settings.expectedOutputUom || 'PCS',
                        sourceOutputStockId: stock.sourceOutputStockId || undefined,
                        sourceType: stock.sourceType || sourceType,
                    });
                } else {
                    out.push({
                        _settingsKey: settingsKey,
                        lotNo: stock.lotNo,
                        thanNo: stock.thanNo,
                        fabricItemId: stock.fabricItemId,
                        itemCode: stock.itemCode,
                        itemName: stock.itemName,
                        colourInstructionType: split.colourInstructionType || 'FIXED_COLOUR',
                        colourName: split.colourName || '',
                        issuedMeter: splitVal,
                        issuedUom: 'Meter',
                        meterPerPcs: settings.meterPerPcs,
                        pcsRoundMode: settings.pcsRoundMode || 'ROUND_DOWN',
                        expectedLossPercent: settings.expectedLossPercent,
                        labourProcessName: processType,
                        labourRateType: settings.labourRateType,
                        labourRate: settings.labourRate,
                        expectedOutputItemId: settings.expectedOutputItemId,
                        expectedOutputUom: settings.expectedOutputUom || 'PCS',
                        sourceOutputStockId: stock.sourceOutputStockId || undefined,
                        sourceType: stock.sourceType || sourceType,
                    });
                }
            });
        });
        return out.map(enrichLineCalculations);
    }, [selectedStock, colourSplits, lineSettings, header.labourRateType, header.labourRate, processType, sourceType]);

    const summary = useMemo(() => summarizeLines(issueLines), [issueLines]);

    const applyVendor = (name) => {
        const match = findVendorRateForProcess(allRates, name, processType);
        setHeader((h) => ({
            ...h,
            dyerName: name,
            labourRateType: match?.rateType || '',
            labourRate: match?.defaultRate ?? '',
        }));
    };

    const addStockPick = () => {
        const item = items.find((it) => it._id === pickItemId);
        if (!item) return toast.error('Select fabric item from stock');
        const qty = Number(pickQty);
        if (!qty || qty <= 0) return toast.error('Enter select qty');
        if (qty > Number(item.currentStock || 0)) return toast.error(`Available only ${item.currentStock}`);
        const id = uid();
        setSelectedStock((p) => [...p, {
            id,
            fabricItemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            lotNo: pickLot || item.textile?.lotNo || '',
            thanNo: pickThan || item.textile?.than || item.textile?.rollNo || '',
            selectedMeter: qty,
            sourceType: 'DIRECT_STOCK',
        }]);
        setColourSplits((p) => ({ ...p, [id]: [emptySplit()] }));
        setPickItemId(''); setPickLot(''); setPickThan(''); setPickQty('');
        toast.success('Than added to selection', { duration: 1200 });
    };

    const addOutputPick = (row) => {
        if (selectedStock.some((s) => s.sourceOutputStockId === row._id)) {
            return toast.error('This return line is already selected. Remove it below to change qty.');
        }
        const qtyUom = String(row.qtyUom || 'PCS').toUpperCase();
        const usePcs = qtyUom !== 'METER';
        const maxQty = usePcs ? Number(row.qtyBalance) : Number(row.meterBalance);
        const qty = Number(pickQty) || maxQty || 0;
        if (!qty || qty <= 0) return toast.error(usePcs ? 'Enter select qty (PCS)' : 'Enter select qty (meter)');
        if (qty > maxQty + 0.001) {
            return toast.error(usePcs
                ? `Available only ${row.qtyBalance} PCS from this return`
                : `Available only ${row.meterBalance} m from this return`);
        }
        const itemId = row.itemId?._id || row.itemId;
        if (!itemId) return toast.error('Output item not found');
        const qtyOrig = Number(row.qtyOriginal) || Number(row.qtyBalance) || 0;
        const meterOrig = Number(row.meterOriginal) || Number(row.meterBalance) || 0;
        let mpp = Number(row.meterPerPcs) || 0;
        if (!mpp && qtyOrig > 0 && meterOrig > 0) {
            mpp = Math.round((meterOrig / qtyOrig) * 1000) / 1000;
        }
        const id = uid();
        setSelectedStock((p) => [...p, {
            id,
            fabricItemId: itemId,
            itemCode: row.itemCode || row.itemId?.itemCode || '',
            itemName: row.itemName || row.itemId?.itemName || '',
            lotNo: row.lotNo || pickLot || '',
            thanNo: row.thanNo || pickThan || '',
            selectedQty: usePcs ? qty : (mpp > 0 ? Math.round((qty / mpp) * 1000) / 1000 : qty),
            selectedMeter: usePcs ? (mpp > 0 ? Math.round(qty * mpp * 1000) / 1000 : (qtyOrig > 0 ? Math.round((qty * meterOrig / qtyOrig) * 1000) / 1000 : qty)) : qty,
            issueUom: usePcs ? 'PCS' : 'Meter',
            qtyUom: row.qtyUom || 'PCS',
            sourceOutputStockId: row._id,
            sourceReturnNo: row.sourceReturnNo || '',
            sourceChallanNo: row.sourceChallanNo || '',
            sourceType: 'PREVIOUS_PROCESS_OUTPUT',
            previousVendor: row.previousVendor,
            outputColour: row.colour,
            meterPerPcs: mpp,
            originalIssuedMeter: meterOrig,
            originalIssuedPcs: qtyOrig,
        }]);
        setColourSplits((p) => ({
            ...p,
            [id]: [{
                ...emptySplit(),
                colourName: row.colour || '',
                colourInstructionType: 'FIXED_COLOUR',
                splitMeter: String(qty),
            }],
        }));
        setPickQty('');
        toast.success(usePcs ? 'Previous process output added (PCS)' : 'Previous process output added', { duration: 1200 });
    };

    const splitTotal = (stockId) => (colourSplits[stockId] || []).reduce((s, r) => s + (Number(r.splitMeter) || 0), 0);

    const skipColourSplit = sourceType === 'PREVIOUS_PROCESS_OUTPUT';

    const applyPreviousOutputColourSplits = () => {
        setColourSplits((prev) => {
            const next = { ...prev };
            selectedStock.forEach((stock) => {
                const qty = stockIssueQty(stock);
                next[stock.id] = [{
                    id: prev[stock.id]?.[0]?.id || uid(),
                    colourInstructionType: 'FIXED_COLOUR',
                    colourName: stock.outputColour || '',
                    splitMeter: String(qty),
                }];
            });
            return next;
        });
    };

    const validateStep = () => {
        if (step === 0) {
            if (!header.dyerName.trim()) return toast.error(`${cfg.vendorLabel} is required`), false;
        }
        if (step === 1) {
            if (!selectedStock.length) {
                return toast.error(sourceType === 'PREVIOUS_PROCESS_OUTPUT'
                    ? 'Select at least one previous process output'
                    : 'Select at least one than / fabric from stock'), false;
            }
        }
        if (step === 2 && !skipColourSplit) {
            for (const stock of selectedStock) {
                const total = splitTotal(stock.id);
                const selected = stockIssueQty(stock);
                const unit = stockIssueUnit(stock);
                if (total > selected + 0.001) {
                    return toast.error(`Colour split for ${stock.thanNo || stock.itemName} cannot exceed ${selected} ${unit} (currently ${total})`), false;
                }
                if (Math.abs(total - selected) > 0.001) {
                    return toast.error(`Colour split for ${stock.thanNo || stock.itemName} must equal ${selected} ${unit} (currently ${total})`), false;
                }
            }
        }
        if (step === 3) {
            if (!issueLines.length) return toast.error('Add colour split rows first'), false;
            for (const ln of issueLines) {
                const stockForLine = findStockForLineKey(selectedStock, ln._settingsKey);
                const mpp = Number(ln.meterPerPcs) || Number(deriveMeterPerPcs(stockForLine)) || 0;
                if (!mpp) {
                    const unit = String(ln.issuedUom || 'Meter').toUpperCase() === 'PCS' ? 'PCS' : 'Mtr';
                    const qty = String(ln.issuedUom || '').toUpperCase() === 'PCS' ? ln.issuedQty : ln.issuedMeter;
                    return toast.error(`Meter Per PCS missing for "${ln.colourName || ln.colourInstructionType}" (${qty} ${unit})`), false;
                }
            }
        }
        return true;
    };

    const goNext = () => {
        if (!validateStep()) return;
        if (step === 1 && skipColourSplit) {
            applyPreviousOutputColourSplits();
            setStep(3);
            return;
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };
    const goBack = () => {
        if (step === 3 && skipColourSplit) {
            setStep(1);
            return;
        }
        setStep((s) => Math.max(s - 1, 0));
    };

    const handleSave = async () => {
        if (!validateStep() || !issueLines.length) return;
        setSaving(true);
        try {
            const payloadLines = issueLines.map((l) => ({
                lotNo: l.lotNo,
                thanNo: l.thanNo,
                fabricItemId: l.fabricItemId,
                colourInstructionType: l.colourInstructionType,
                colourName: l.colourName,
                issuedQty: l.issuedQty ? Number(l.issuedQty) : undefined,
                issuedMeter: Number(l.issuedMeter),
                issuedUom: l.issuedUom || 'Meter',
                meterPerPcs: l.meterPerPcs ? Number(l.meterPerPcs) : 0,
                pcsRoundMode: l.pcsRoundMode || 'ROUND_DOWN',
                expectedLossPercent: l.expectedLossPercent ? Number(l.expectedLossPercent) : 0,
                labourProcessName: processType,
                labourRateType: l.labourRateType,
                labourRate: l.labourRate ? Number(l.labourRate) : 0,
                expectedOutputItemId: l.expectedOutputItemId,
                expectedOutputUom: l.expectedOutputUom || 'PCS',
                sourceOutputStockId: l.sourceOutputStockId,
                sourceType: l.sourceType,
            }));
            const wo = await createTextileJobWorkChallan(processType, {
                companyId: selectedCompany._id,
                dyerName: header.dyerName.trim(),
                issueDate: header.issueDate,
                expectedReturnDate: header.expectedReturnDate || undefined,
                labourProcessName: processType,
                remarks: header.remarks,
                sourceType,
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

    const colourTypes = meta?.colourInstructions || [
        { value: 'FIXED_COLOUR', label: 'Fixed Colour' },
        { value: 'DYER_CHOICE', label: 'Dyer Choice' },
        { value: 'AS_PER_SAMPLE', label: 'As Per Sample' },
        { value: 'AS_PER_EXPERTISE', label: 'As Per Expertise' },
    ];
    const rateTypes = meta?.labourRateTypes || LABOUR_RATE_TYPES;

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    const stepIcons = [CheckCircle, Package, Palette, Calculator, Save];

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(backPath || PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Issue Challan</h1>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                {skipColourSplit
                    ? 'Select returned stock from previous process — colour is already fixed from Dyeing.'
                    : 'Step-by-step: select stock, split colours, auto-calculate PCS and labour'}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {STEPS.map((label, idx) => {
                    const Icon = stepIcons[idx];
                    const stepSkipped = skipColourSplit && idx === 2;
                    const active = !stepSkipped && step === idx;
                    const done = stepSkipped ? step > 1 : step > idx;
                    const displayLabel = stepSkipped ? 'Colour (from Dyeing)' : label;
                    return (
                        <div key={label} style={{ flex: '1 1 120px', padding: '10px 12px', borderRadius: 8, border: active ? '2px solid #7c3aed' : '1px solid #e2e8f0', background: done ? '#f0fdf4' : active ? '#faf5ff' : stepSkipped ? '#f8fafc' : '#fff', fontSize: 12, fontWeight: active ? 700 : 600, color: active ? '#5b21b6' : stepSkipped ? '#94a3b8' : '#475569' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> Step {idx + 1}: {displayLabel}{stepSkipped ? ' ✓' : ''}</div>
                        </div>
                    );
                })}
            </div>

            {step === 0 && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Step 1 — Header</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <ProcessTypeSelect value={processType} onChange={onProcessTypeChange} />
                        <label><span style={f.label}>{cfg.vendorLabel} *</span>
                            {vendors.length ? (
                                <select value={header.dyerName} onChange={(e) => applyVendor(e.target.value)} style={f.input} required>
                                    <option value="">Select job worker / supplier...</option>
                                    {vendors.map((v) => <option key={v.vendorWorker} value={v.vendorWorker}>{v.vendorWorker}</option>)}
                                </select>
                            ) : (
                                <input value={header.dyerName} onChange={(e) => setHeader({ ...header, dyerName: e.target.value })} style={f.input} placeholder="Type job worker / supplier name" />
                            )}
                        </label>
                        <label><span style={f.label}>Challan No</span><input readOnly value="Auto on save" style={{ ...f.input, background: '#f8fafc' }} /></label>
                        <label><span style={f.label}>Issue Date</span><input type="date" value={header.issueDate} onChange={(e) => setHeader({ ...header, issueDate: e.target.value })} style={f.input} /></label>
                        <label><span style={f.label}>Expected Return Date</span><input type="date" value={header.expectedReturnDate} onChange={(e) => setHeader({ ...header, expectedReturnDate: e.target.value })} style={f.input} /></label>
                        <label><span style={f.label}>Remarks</span><input value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} style={f.input} /></label>
                        {processType !== 'Dyeing' && (
                            <label style={{ gridColumn: '1 / -1' }}>
                                <span style={f.label}>Source Type *</span>
                                <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setSelectedStock([]); setColourSplits({}); }} style={f.input}>
                                    <option value="PREVIOUS_PROCESS_OUTPUT">Continue From Previous Process</option>
                                    <option value="DIRECT_STOCK">Start New Process From Direct Stock</option>
                                </select>
                            </label>
                        )}
                    </div>
                    <div style={{ marginTop: 12, padding: 10, background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
                        Default labour from vendor: {header.labourRateType || '—'} @ Rs {header.labourRate || '—'} (applied in Step 4)
                    </div>
                </div>
            )}

            {step === 1 && sourceType === 'PREVIOUS_PROCESS_OUTPUT' && processType !== 'Dyeing' && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Step 2 — Select Previous Process Output</h2>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Pick returned stock from a completed prior process (e.g. Dyeing Return). Colour is already fixed — no colour split needed for Embroidery.</p>
                    <div style={{ marginBottom: 12, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, fontSize: 12, color: '#065f46' }}>
                        Dyeing return colour and PCS are carried forward automatically. Select qty only, then go to Labour.
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead><tr style={{ background: '#f8fafc' }}>
                            {['Prior Process', 'Return No', 'Item', 'Colour', 'Lot', 'Than', 'Available', 'Vendor', ''].map((h) => <th key={h || 'a'} style={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {loadingOutputs ? (
                                <tr><td colSpan={9} style={{ ...td, color: '#94a3b8' }}>Loading previous process outputs…</td></tr>
                            ) : processOutputs.length === 0 ? (
                                <tr><td colSpan={9} style={{ ...td, color: '#94a3b8' }}>No previous process output available. Complete a return first or use Direct Stock.</td></tr>
                            ) : processOutputs.map((r) => {
                                const alreadySelected = selectedStock.some((s) => s.sourceOutputStockId === r._id);
                                return (
                                <tr key={r._id}>
                                    <td style={td}>{r.processType}</td>
                                    <td style={td}>{r.sourceReturnNo}</td>
                                    <td style={td}>{r.itemName}</td>
                                    <td style={td}>{r.colour || '—'}</td>
                                    <td style={td}>{r.lotNo || '—'}</td>
                                    <td style={td}>{r.thanNo || '—'}</td>
                                    <td style={td}><strong>{r.qtyBalance}</strong> {r.qtyUom} / <strong>{r.meterBalance}</strong> m</td>
                                    <td style={td}>{r.previousVendor || '—'}</td>
                                    <td style={td}>
                                        <button
                                            type="button"
                                            disabled={alreadySelected}
                                            onClick={() => { setPickQty(String(r.qtyBalance)); addOutputPick(r); }}
                                            style={{ padding: '4px 10px', background: alreadySelected ? '#cbd5e1' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: alreadySelected ? 'not-allowed' : 'pointer', fontSize: 12 }}
                                        >
                                            {alreadySelected ? 'Added' : 'Select'}
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>+ Partial qty from selected output</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                            <label><span style={f.label}>Issue Qty (PCS)</span><input type="number" min="0" step="any" value={pickQty} onChange={(e) => setPickQty(e.target.value)} style={f.input} placeholder="Full or partial PCS" /></label>
                            <div style={{ fontSize: 11, color: '#64748b', paddingBottom: 8 }}>Returned from dyer in PCS. Select a row above, or enter PCS then click Select.</div>
                        </div>
                    </div>
                    {selectedStock.length > 0 && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Selected for this challan</div>
                            {selectedStock.map((s) => (
                                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                                    <span>{s.outputColour ? `${s.outputColour} · ` : ''}{s.thanNo || 'Than'} · Lot {s.lotNo || '—'} · {s.itemName} · <strong>{stockIssueQty(s)} {stockIssueUnit(s)}</strong>{s.meterPerPcs ? ` (${s.selectedMeter} m)` : ''}{s.previousVendor ? ` · from ${s.previousVendor}` : ''}</span>
                                    <button type="button" onClick={() => { setSelectedStock((p) => p.filter((x) => x.id !== s.id)); setColourSplits((p) => { const n = { ...p }; delete n[s.id]; return n; }); }} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {step === 1 && (sourceType === 'DIRECT_STOCK' || processType === 'Dyeing') && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Step 2 — Select Fabric / Than from Stock</h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead><tr style={{ background: '#f8fafc' }}>
                            {['Fabric Item', 'Lot No', 'Than No', 'Available', 'Colour', ''].map((h) => <th key={h || 'a'} style={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {stockRows.length === 0 ? (
                                <tr><td colSpan={6} style={{ ...td, color: '#94a3b8' }}>No items with available stock. Add stock in Item Master first.</td></tr>
                            ) : stockRows.map((r) => (
                                <tr key={r.itemId}>
                                    <td style={td}>{r.itemCode} — {r.itemName}</td>
                                    <td style={td}>{r.lotNo || '—'}</td>
                                    <td style={td}>{r.thanNo || '—'}</td>
                                    <td style={td}><strong>{r.availableMeter}</strong> Mtr</td>
                                    <td style={td}>{r.colour || 'Grey'}</td>
                                    <td style={td}>
                                        <button type="button" onClick={() => { setPickItemId(r.itemId); setPickLot(r.lotNo); setPickThan(r.thanNo); setPickQty(String(r.availableMeter)); }} style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Select</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>+ Select Fabric / Than from Stock</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                            <label><span style={f.label}>Fabric Item</span>
                                <select value={pickItemId} onChange={(e) => setPickItemId(e.target.value)} style={f.input}>
                                    <option value="">Choose...</option>
                                    {stockRows.map((r) => <option key={r.itemId} value={r.itemId}>{r.itemCode} — {r.itemName}</option>)}
                                </select>
                            </label>
                            <label><span style={f.label}>Lot No</span><input value={pickLot} onChange={(e) => setPickLot(e.target.value)} style={f.input} /></label>
                            <label><span style={f.label}>Than No</span><input value={pickThan} onChange={(e) => setPickThan(e.target.value)} style={f.input} /></label>
                            <label><span style={f.label}>Select Qty (Mtr)</span><input type="number" min="0" step="any" value={pickQty} onChange={(e) => setPickQty(e.target.value)} style={f.input} /></label>
                            <button type="button" onClick={addStockPick} style={{ padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}><Plus size={14} /> Add</button>
                        </div>
                    </div>
                    {selectedStock.length > 0 && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Selected for this challan</div>
                            {selectedStock.map((s) => (
                                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                                    <span>{s.thanNo || 'Than'} · Lot {s.lotNo || '—'} · {s.itemName} · <strong>{s.selectedMeter} Mtr</strong></span>
                                    <button type="button" onClick={() => { setSelectedStock((p) => p.filter((x) => x.id !== s.id)); setColourSplits((p) => { const n = { ...p }; delete n[s.id]; return n; }); }} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {step === 2 && !skipColourSplit && selectedStock.map((stock) => {
                const unit = stockIssueUnit(stock);
                const totalQty = stockIssueQty(stock);
                return (
                <div key={stock.id} style={card}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>
                        Step 3 — Colour Split: {stock.itemName}
                        {stock.thanNo ? ` · Than ${stock.thanNo}` : ''}
                        {stock.outputColour ? ` · ${stock.outputColour}` : ''}
                        {stock.sourceReturnNo ? ` · ${stock.sourceReturnNo}` : ''}
                        {' '}({totalQty} {unit})
                    </h2>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                        {stockUsesPcs(stock)
                            ? `Split total PCS colour-wise. Total must equal ${totalQty} PCS.`
                            : `Split total meter colour-wise. Total must equal ${totalQty} Mtr.`}
                        {stock.meterPerPcs ? ` · ${stock.meterPerPcs} m/PCS` : ''}
                    </p>
                    {(colourSplits[stock.id] || []).map((split, idx) => (
                        <div key={split.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                            <label><span style={f.label}>Colour Type</span>
                                <select value={split.colourInstructionType} onChange={(e) => setColourSplits((p) => ({ ...p, [stock.id]: p[stock.id].map((r, i) => i === idx ? { ...r, colourInstructionType: e.target.value } : r) }))} style={f.input}>
                                    {colourTypes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </label>
                            <label><span style={f.label}>Colour Name</span><input value={split.colourName} onChange={(e) => setColourSplits((p) => ({ ...p, [stock.id]: p[stock.id].map((r, i) => i === idx ? { ...r, colourName: e.target.value } : r) }))} placeholder="Blue / White" style={f.input} /></label>
                            <label><span style={f.label}>{stockUsesPcs(stock) ? 'PCS' : 'Meter'}</span><input type="number" min="0" step="any" value={split.splitMeter} onChange={(e) => setColourSplits((p) => ({ ...p, [stock.id]: p[stock.id].map((r, i) => i === idx ? { ...r, splitMeter: e.target.value } : r) }))} style={f.input} /></label>
                            <button type="button" onClick={() => setColourSplits((p) => ({ ...p, [stock.id]: p[stock.id].filter((_, i) => i !== idx) }))} style={{ alignSelf: 'end', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                    ))}
                    <button type="button" onClick={() => setColourSplits((p) => ({ ...p, [stock.id]: [...(p[stock.id] || []), emptySplit()] }))} style={{ padding: '6px 10px', border: '1px solid #d1d5db', background: '#f8fafc', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}><Plus size={14} /> Add Colour Row</button>
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: splitTotal(stock.id) === totalQty ? '#059669' : '#b45309' }}>
                        Split total: {splitTotal(stock.id)} / {totalQty} {unit}
                    </div>
                </div>
                );
            })}

            {step === 3 && (
                <>
                    <div style={{ ...card, background: '#faf5ff', border: '1px solid #ddd6fe' }}>
                        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Step 4 — Labour for all lines</h2>
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                            Set rate type and rate here to fill every line below. You can still change any single line.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 480 }}>
                            <label><span style={f.label}>Rate Type (all lines)</span>
                                <select
                                    value={bulkLabour.rateType}
                                    onChange={(e) => applyBulkLabour(e.target.value, bulkLabour.rate)}
                                    style={f.input}
                                >
                                    <option value="">Select</option>
                                    {rateTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </label>
                            <label><span style={f.label}>Rate (all lines)</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={bulkLabour.rate}
                                    onChange={(e) => applyBulkLabour(bulkLabour.rateType, e.target.value)}
                                    placeholder="e.g. 20"
                                    style={f.input}
                                />
                            </label>
                        </div>
                    </div>
                    {issueLines.map((ln) => {
                const key = ln._settingsKey;
                const stockForLine = findStockForLineKey(selectedStock, key);
                const fromPrevious = stockForLine?.sourceType === 'PREVIOUS_PROCESS_OUTPUT';
                const resolvedMpp = deriveMeterPerPcs(stockForLine) || ln.meterPerPcs || '';
                const settings = {
                    meterPerPcs: lineSettings[key]?.meterPerPcs || resolvedMpp,
                    pcsRoundMode: lineSettings[key]?.pcsRoundMode || ln.pcsRoundMode || 'ROUND_DOWN',
                    labourRateType: lineSettings[key]?.labourRateType || ln.labourRateType || header.labourRateType,
                    labourRate: lineSettings[key]?.labourRate ?? ln.labourRate ?? header.labourRate,
                    expectedOutputItemId: lineSettings[key]?.expectedOutputItemId || ln.fabricItemId,
                    expectedOutputUom: lineSettings[key]?.expectedOutputUom || 'PCS',
                };
                const setSettings = (patch) => setLineSettings((p) => ({ ...p, [key]: { ...settings, ...patch } }));
                return (
                    <div key={key} style={card}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>
                            {ln.itemName || 'Fabric'}
                            {ln.itemCode ? ` (${ln.itemCode})` : ''}
                            {' · '}{ln.colourName || ln.colourInstructionType} — {String(ln.issuedUom || '').toUpperCase() === 'PCS' ? `${ln.issuedQty} PCS` : `${ln.issuedMeter} Mtr`}
                            {ln.thanNo ? ` (Than ${ln.thanNo})` : ''}
                        </h3>
                        {fromPrevious && (
                            <div style={{ marginBottom: 10, fontSize: 12, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 10px' }}>
                                From Dyeing: <strong>{stockForLine?.originalIssuedMeter || ln.issuedMeter} m</strong> issued
                                {resolvedMpp ? ` · ${resolvedMpp} m/PCS` : ''}
                                {stockForLine?.sourceChallanNo ? ` · ${stockForLine.sourceChallanNo}` : ''}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                            <label><span style={f.label}>Meter Per PCS{fromPrevious ? ' (from Dyeing)' : ''}</span><input type="number" readOnly={fromPrevious} value={settings.meterPerPcs} onChange={(e) => setSettings({ meterPerPcs: e.target.value })} style={{ ...f.input, ...(fromPrevious ? { background: '#f8fafc' } : {}) }} /></label>
                            <label><span style={f.label}>Expected PCS</span><input readOnly value={ln.expectedPcs || ''} style={{ ...f.input, background: '#f5f3ff', fontWeight: 700 }} /></label>
                            <label><span style={f.label}>Rate Type</span>
                                <select value={settings.labourRateType} onChange={(e) => setSettings({ labourRateType: e.target.value })} style={f.input}>
                                    <option value="">Select</option>
                                    {rateTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </label>
                            <label><span style={f.label}>Rate</span><input type="number" value={settings.labourRate} onChange={(e) => setSettings({ labourRate: e.target.value })} style={f.input} /></label>
                            <label><span style={f.label}>Labour Amount</span><input readOnly value={ln.labourAmount ? `Rs ${ln.labourAmount}` : ''} style={{ ...f.input, background: '#f0fdf4' }} /></label>
                        </div>
                    </div>
                );
            })}
                </>
            )}

            {step === 4 && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Step 5 — Review &amp; Save</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16, fontSize: 13 }}>
                        <div>Process: <strong>{processType}</strong></div>
                        <div>Job Worker: <strong>{header.dyerName}</strong></div>
                        <div>Issue Date: <strong>{header.issueDate}</strong></div>
                        <div>Total Issued: <strong>{summary.totalIssuedMeter} Mtr</strong></div>
                        <div>Total Expected PCS: <strong>{summary.totalExpectedPcs}</strong></div>
                        <div>Total Labour: <strong>Rs {summary.totalLabourAmount}</strong></div>
                        <div>Total Lines: <strong>{issueLines.length}</strong></div>
                        <div>Pending Meter: <strong>{summary.totalIssuedMeter} Mtr</strong></div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f8fafc' }}>
                            {['Fabric', 'Than', 'Colour', 'Qty', 'Exp PCS', 'Labour'].map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {issueLines.map((ln, i) => (
                                <tr key={i}>
                                    <td style={td}>{ln.itemName || '—'}</td>
                                    <td style={td}>{ln.thanNo || '—'}</td>
                                    <td style={td}>{ln.colourName || ln.colourInstructionType}</td>
                                    <td style={td}>{String(ln.issuedUom || '').toUpperCase() === 'PCS' ? `${ln.issuedQty} PCS` : `${ln.issuedMeter} m`}</td>
                                    <td style={td}>{ln.expectedPcs}</td>
                                    <td style={td}>Rs {ln.labourAmount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>After save, challan QR and line barcodes will be generated on the challan detail screen.</p>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button type="button" disabled={step === 0} onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, cursor: step === 0 ? 'not-allowed' : 'pointer' }}>
                    <ChevronLeft size={16} /> Back
                </button>
                {step < STEPS.length - 1 ? (
                    <button type="button" onClick={goNext} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        Next <ChevronRight size={16} />
                    </button>
                ) : (
                    <button type="button" disabled={saving} onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        <Save size={16} /> {saving ? 'Saving...' : 'Save & Generate Barcode'}
                    </button>
                )}
            </div>
        </div>
    );
}
