import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, ScanLine, Users, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import ProcessTypeSelect from '@/features/production/textileJobWork/ProcessTypeSelect';
import {
    lookupTextileJobWorkChallan,
    getTextileJobWorkChallan,
    listTextileJobWorkChallans,
    recordTextileJobWorkReturn,
    getPendingJobWorkChallansReport,
} from '@/services/textileJobWorkChallanApi';
import { getItems } from '@/services/itemApi';
import { roundExpectedPcs } from '@/utils/textileDyeingChallanCalc';

const f = { label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }, input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' } };

function deriveLinePcsInfo(line) {
    const mpp = Number(line.meterPerPcs) || 0;
    const mode = line.pcsRoundMode || 'ROUND_DOWN';
    const issuedMeter = Number(line.issuedMeter) || 0;
    const pendingMeter = Number(line.pendingMeter) ?? Math.max(0, issuedMeter - (Number(line.returnedMeter) || 0));
    let expectedPcs = Number(line.expectedPcs) || 0;
    if (!expectedPcs && mpp > 0 && issuedMeter > 0) {
        expectedPcs = roundExpectedPcs(issuedMeter / mpp, mode);
    }
    const returnedPcs = Number(line.returnedQty) || 0;
    let pendingPcs = 0;
    if (expectedPcs > 0) {
        pendingPcs = Math.max(0, expectedPcs - returnedPcs);
    } else if (mpp > 0 && pendingMeter > 0) {
        pendingPcs = roundExpectedPcs(pendingMeter / mpp, mode);
    }
    return { expectedPcs, returnedPcs, pendingPcs, pendingMeter, issuedMeter, meterPerPcs: mpp };
}

function challanPcsTotals(doc) {
    return (doc?.lines || [])
        .filter((l) => (l.pendingMeter || 0) > 0)
        .reduce((acc, l) => {
            const pcs = deriveLinePcsInfo(l);
            acc.issuedPcs += pcs.expectedPcs;
            acc.pendingPcs += pcs.pendingPcs;
            acc.returnedPcs += pcs.returnedPcs;
            return acc;
        }, { issuedPcs: 0, pendingPcs: 0, returnedPcs: 0 });
}

function buildReturnLines(doc, showDesign) {
    return (doc.lines || []).filter((l) => (l.pendingMeter || 0) > 0).map((l) => {
        const pcs = deriveLinePcsInfo(l);
        return {
            challanLineId: l._id,
            colourName: l.colourName || l.designPattern || '',
            fabricItemName: l.fabricItemName || l.fabricItemId?.itemName || '',
            returnedQty: '',
            returnUom: l.expectedOutputUom || 'PCS',
            creditedMeter: '',
            outputItemId: l.expectedOutputItemId?._id || l.expectedOutputItemId || '',
            pendingMeter: pcs.pendingMeter,
            issuedMeter: pcs.issuedMeter,
            expectedPcs: pcs.expectedPcs,
            returnedPcs: pcs.returnedPcs,
            pendingPcs: pcs.pendingPcs,
            meterPerPcs: pcs.meterPerPcs,
            designPattern: l.designPattern || '',
            showDesign,
        };
    });
}

export function TextileJobWorkChallanReturnPage({
    processType = 'Dyeing',
    allowProcessSelect = false,
    onProcessTypeChange,
    backPath = null,
    unifiedModule = false,
}) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const navigate = useNavigate();
    const showDesignField = allowProcessSelect
        ? ['Embroidery', 'Printing', 'Other'].includes(processType)
        : cfg.showDesignField;
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [mode, setMode] = useState('barcode');
    const [barcode, setBarcode] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [vendorOptions, setVendorOptions] = useState([]);
    const [pendingChallans, setPendingChallans] = useState([]);
    const [loadingVendors, setLoadingVendors] = useState(false);
    const [loadingChallans, setLoadingChallans] = useState(false);
    const [challan, setChallan] = useState(null);
    const [items, setItems] = useState([]);
    const [returnLines, setReturnLines] = useState([]);
    const [nextAction, setNextAction] = useState('KEEP_OUTPUT_STOCK');
    const [saving, setSaving] = useState(false);
    const [loadSource, setLoadSource] = useState('');

    const openChallan = useCallback(async (doc, source = '') => {
        let full = doc;
        if (doc._id && !doc.lines?.[0]?.expectedOutputItemId) {
            full = await getTextileJobWorkChallan(processType, doc._id);
        }
        if (!items.length) {
            const itemRes = await getItems({ limit: 500 });
            setItems(itemRes.items || itemRes.data || []);
        }
        setChallan(full);
        setLoadSource(source || full.challanNo || '');
        setReturnLines(buildReturnLines(full, showDesignField));
        setNextAction('KEEP_OUTPUT_STOCK');
        toast.success(`Challan ${full.challanNo} loaded`);
    }, [items.length, processType, showDesignField]);

    useEffect(() => {
        if (!allowProcessSelect) return;
        setChallan(null);
        setReturnLines([]);
        setBarcode('');
        setVendorName('');
        setPendingChallans([]);
        setLoadSource('');
    }, [processType, allowProcessSelect]);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return;
        setLoadingVendors(true);
        getPendingJobWorkChallansReport(processType, { companyId: selectedCompany._id })
            .then((rows) => {
                const names = [...new Set(rows.map((r) => r.vendorName).filter(Boolean))].sort();
                setVendorOptions(names);
            })
            .catch(() => {})
            .finally(() => setLoadingVendors(false));
    }, [isTextile, selectedCompany?._id, processType]);

    useEffect(() => {
        if (mode !== 'vendor' || !vendorName || !selectedCompany?._id) {
            setPendingChallans([]);
            return;
        }
        setLoadingChallans(true);
        listTextileJobWorkChallans(processType, {
            companyId: selectedCompany._id,
            dyerName: vendorName,
            pendingOnly: 'true',
        })
            .then(setPendingChallans)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load challans'))
            .finally(() => setLoadingChallans(false));
    }, [mode, vendorName, selectedCompany?._id, processType]);

    const loadChallanByBarcode = async () => {
        if (!barcode.trim()) return toast.error('Scan or enter barcode / challan no');
        try {
            const doc = await lookupTextileJobWorkChallan(processType, barcode.trim());
            await openChallan(doc, barcode.trim());
        } catch (e) {
            toast.error(e.response?.data?.message || 'Challan not found');
        }
    };

    const setLine = (idx, k, v) => setReturnLines((p) => p.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!challan) return toast.error('Load challan first');
        const lines = returnLines.filter((l) => Number(l.returnedQty) > 0).map((l) => ({
            challanLineId: l.challanLineId,
            colourName: l.colourName,
            returnedQty: Number(l.returnedQty),
            returnUom: l.returnUom,
            creditedMeter: l.creditedMeter ? Number(l.creditedMeter) : undefined,
            outputItemId: l.outputItemId || undefined,
        }));
        if (!lines.length) return toast.error('Enter at least one return qty');
        setSaving(true);
        try {
            await recordTextileJobWorkReturn(processType, challan._id, {
                scanBarcode: loadSource || barcode,
                lines,
                nextAction,
                companyId: selectedCompany._id,
            });
            toast.success(`${cfg.returnTitle} recorded`);
            setChallan(null);
            setReturnLines([]);
            setBarcode('');
            setLoadSource('');
            if (vendorName) {
                listTextileJobWorkChallans(processType, {
                    companyId: selectedCompany._id,
                    dyerName: vendorName,
                    pendingOnly: 'true',
                }).then(setPendingChallans).catch(() => {});
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    const vendorWiseLabel = cfg.vendorWiseTabLabel;

    const tabBtn = (id, label, icon) => (
        <button
            type="button"
            onClick={() => { setMode(id); setChallan(null); setReturnLines([]); setLoadSource(''); }}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 8, border: mode === id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: mode === id ? '#eff6ff' : '#fff', fontWeight: mode === id ? 700 : 500, cursor: 'pointer',
            }}
        >
            {icon} {label}
        </button>
    );

    return (
        <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
            {backPath && (
                <button type="button" onClick={() => navigate(backPath)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                    <ChevronLeft size={16} /> Back
                </button>
            )}
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{unifiedModule ? 'Return Entry' : cfg.returnTitle}</h1>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>Receive material back — by barcode scan or {cfg.vendorLabelShort.toLowerCase()}-wise pending challans</p>

            {allowProcessSelect && (
                <div style={{ maxWidth: 280, marginBottom: 16 }}>
                    <ProcessTypeSelect value={processType} onChange={onProcessTypeChange} />
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {tabBtn('barcode', 'Barcode Scan', <ScanLine size={16} />)}
                {tabBtn('vendor', vendorWiseLabel, <Users size={16} />)}
            </div>

            {mode === 'barcode' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan barcode or enter challan no" style={{ ...f.input, flex: 1 }} />
                    <button type="button" onClick={loadChallanByBarcode} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <ScanLine size={16} /> Load
                    </button>
                </div>
            )}

            {mode === 'vendor' && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <label style={{ display: 'block', maxWidth: 360, marginBottom: 12 }}>
                        <span style={f.label}>Select {cfg.vendorLabel}</span>
                        <select value={vendorName} onChange={(e) => setVendorName(e.target.value)} style={f.input} disabled={loadingVendors}>
                            <option value="">{loadingVendors ? 'Loading…' : `— Choose ${cfg.vendorLabel.toLowerCase()} —`}</option>
                            {vendorOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </label>
                    {vendorName && (
                        <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Pending challans for {vendorName}</div>
                            {loadingChallans ? (
                                <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
                            ) : pendingChallans.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: 13 }}>No pending challans for this vendor</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Challan No', 'Issue Date', 'Issued m', 'Issued PCS', 'Pending m', 'Pending PCS', 'Days', ''].map((h) => (
                                                <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingChallans.map((c) => {
                                            const days = c.issueDate ? Math.floor((Date.now() - new Date(c.issueDate)) / 86400000) : '—';
                                            const pcsTotals = challanPcsTotals(c);
                                            return (
                                                <tr key={c._id}>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{c.challanNo}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{c.issueDate ? new Date(c.issueDate).toLocaleDateString() : '—'}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{c.totalIssuedMeter}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{pcsTotals.issuedPcs || '—'}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', color: '#b45309', fontWeight: 600 }}>{c.totalPendingMeter}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', color: '#b45309', fontWeight: 600 }}>{pcsTotals.pendingPcs || '—'}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{days}</td>
                                                    <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                                                        <button type="button" onClick={() => openChallan(c, c.challanNo)} style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                                                            Receive
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            )}

            {challan && (() => {
                const pcsTotals = challanPcsTotals(challan);
                return (
                <form onSubmit={handleSubmit}>
                    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <span><strong>{challan.challanNo}</strong></span>
                        <span>{challan.dyerName}</span>
                        <span>Pending <strong>{challan.totalPendingMeter} m</strong></span>
                        <span>Issued PCS <strong>{pcsTotals.issuedPcs || '—'}</strong></span>
                        <span>Returned PCS <strong>{pcsTotals.returnedPcs || 0}</strong></span>
                        <span>To return PCS <strong style={{ color: '#b45309' }}>{pcsTotals.pendingPcs || '—'}</strong></span>
                    </div>
                    {returnLines.map((ln, idx) => (
                        <div key={ln.challanLineId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 10 }}>
                                <div>
                                    <span style={f.label}>{showDesignField ? 'Design' : 'Colour'}</span>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ln.colourName || '—'}</div>
                                    {ln.fabricItemName ? <div style={{ fontSize: 11, color: '#64748b' }}>{ln.fabricItemName}</div> : null}
                                </div>
                                <div>
                                    <span style={f.label}>Issued</span>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ln.issuedMeter} m</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{ln.expectedPcs ? `${ln.expectedPcs} PCS` : '— PCS'}</div>
                                </div>
                                <div>
                                    <span style={f.label}>Already Returned</span>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ln.returnedPcs || 0} PCS</div>
                                    {ln.meterPerPcs ? <div style={{ fontSize: 11, color: '#64748b' }}>{ln.meterPerPcs} m/PCS</div> : null}
                                </div>
                                <div>
                                    <span style={f.label}>To Return</span>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>{ln.pendingPcs || '—'} PCS</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{ln.pendingMeter} m pending</div>
                                </div>
                                <div>
                                    <span style={f.label}>Output Item</span>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>{items.find((it) => it._id === ln.outputItemId)?.itemName || 'Default'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                <label><span style={f.label}>Return Qty *</span><input type="number" min="0" max={ln.pendingPcs || undefined} step="any" value={ln.returnedQty} onChange={(e) => setLine(idx, 'returnedQty', e.target.value)} placeholder={ln.pendingPcs ? `Up to ${ln.pendingPcs} PCS` : ''} style={f.input} /></label>
                                <label><span style={f.label}>UOM</span><input value={ln.returnUom} onChange={(e) => setLine(idx, 'returnUom', e.target.value)} placeholder="PCS / Meter" style={f.input} /></label>
                                <label><span style={f.label}>Credited Meter (if PCS)</span><input type="number" min="0" step="any" value={ln.creditedMeter} onChange={(e) => setLine(idx, 'creditedMeter', e.target.value)} placeholder={ln.meterPerPcs ? `${ln.pendingPcs || 0} x ${ln.meterPerPcs}` : ''} style={f.input} /></label>
                                <label><span style={f.label}>Output Item</span>
                                    <select value={ln.outputItemId} onChange={(e) => setLine(idx, 'outputItemId', e.target.value)} style={f.input}>
                                        <option value="">Default</option>
                                        {items.map((it) => <option key={it._id} value={it._id}>{it.itemName}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>
                    ))}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Next Action After Return</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {[
                                { value: 'KEEP_OUTPUT_STOCK', label: 'Keep as Process Output Stock', hint: 'Available for next process issue (default)' },
                                { value: 'SEND_TO_NEXT_PROCESS', label: 'Send to Next Process', hint: 'Same as keep — marks intent to issue soon' },
                                { value: 'FINISHED_GOODS', label: 'Transfer to Finished Goods', hint: 'Credits item stock only; no process output row' },
                            ].map((opt) => (
                                <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', border: `1px solid ${nextAction === opt.value ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 8, background: nextAction === opt.value ? '#f5f3ff' : '#fff', cursor: 'pointer', flex: '1 1 200px', maxWidth: 280 }}>
                                    <input type="radio" name="nextAction" value={opt.value} checked={nextAction === opt.value} onChange={() => setNextAction(opt.value)} style={{ marginTop: 3 }} />
                                    <span>
                                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                                        <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        <Save size={16} /> {saving ? 'Saving…' : 'Record Return'}
                    </button>
                </form>
                );
            })()}
        </div>
    );
}

export default function TextileDyeingChallanReturnPage() {
    return <TextileJobWorkChallanReturnPage processType="Dyeing" />;
}
