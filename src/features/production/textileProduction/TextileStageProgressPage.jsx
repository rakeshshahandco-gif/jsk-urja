import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Play, CheckCircle2 } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import {
    completeTextileStage,
    getTextileProductionLot,
    startTextileStage,
} from '@/services/textileProductionLotApi';
import { listTextileJobWorkRates, lookupTextileJobWorkRate } from '@/services/textileJobWorkRateApi';
import { useCompany } from '@/contexts/CompanyContext';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

function stageIsDyeing(name) {
    return String(name || '').toLowerCase().includes('dyeing');
}

function stageIsGrey(name) {
    const n = String(name || '').toLowerCase();
    return n.includes('grey fabric') || n.includes('grey');
}

function stageNeedsJobWork(name) {
    const n = String(name || '').toLowerCase();
    return ['stitch', 'embroid', 'print', 'wash', 'press', 'pack', 'finish'].some((k) => n.includes(k));
}

function processFromStage(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('stitch')) return 'Stitching';
    if (n.includes('embroid')) return 'Embroidery';
    if (n.includes('print')) return 'Printing';
    if (n.includes('wash')) return 'Washing';
    if (n.includes('press')) return 'Pressing';
    if (n.includes('pack')) return 'Packing';
    return '';
}

export default function TextileStageProgressPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [lot, setLot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [qty, setQty] = useState('');
    const [remarks, setRemarks] = useState('');
    const [workers, setWorkers] = useState([]);
    const [jobWork, setJobWork] = useState({ vendorWorker: '', rateType: '', rateApplied: '', rateMasterId: '' });

    const loadLot = useCallback(() => {
        setLoading(true);
        getTextileProductionLot(id)
            .then(setLot)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load lot'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadLot(); }, [loadLot]);

    const currentIdx = lot?.currentStageIndex ?? 0;
    const currentStageName = lot?.stages?.[currentIdx]?.stageName;
    const jobWorkStage = stageNeedsJobWork(currentStageName);
    const processName = processFromStage(currentStageName);

    useEffect(() => {
        if (!selectedCompany?._id || !processName) return;
        listTextileJobWorkRates({ companyId: selectedCompany._id, processName, isActive: 'true' })
            .then((rows) => setWorkers(rows))
            .catch(() => setWorkers([]));
    }, [selectedCompany?._id, processName]);

    const labourPreview = (() => {
        const q = Number(qty) || 0;
        const r = Number(jobWork.rateApplied) || 0;
        if (jobWork.rateType === 'FIXED_AMOUNT') return r;
        return Math.round(q * r * 100) / 100;
    })();

    const applyWorker = async (name) => {
        setJobWork((p) => ({ ...p, vendorWorker: name }));
        if (!name || !selectedCompany?._id || !processName) return;
        try {
            const rate = await lookupTextileJobWorkRate({
                companyId: selectedCompany._id,
                processName,
                vendorWorker: name,
            });
            if (rate) {
                setJobWork({
                    vendorWorker: name,
                    rateType: rate.rateType,
                    rateApplied: String(rate.appliedRate ?? rate.defaultRate),
                    rateMasterId: rate._id,
                });
            }
        } catch { /* manual */ }
    };

    const currentStage = lot?.stages?.[currentIdx];
    const t = lot?.textile || {};
    const isDone = lot?.lotStatus === 'completed';

    const carryQty = useMemo(() => {
        if (!lot?.stages?.length) return 0;
        if (currentIdx === 0) return Number(lot.qtyStarted || 0);
        const prev = lot.stages[currentIdx - 1];
        if (!prev) return 0;
        if (prev.status === 'completed') return Number(prev.qtyCompleted || 0);
        return 0;
    }, [lot, currentIdx]);

    useEffect(() => {
        if (currentStage?.status === 'started') setQty(String(currentStage.qtyStarted || ''));
        else if (currentStage?.status === 'pending') setQty(String(carryQty || ''));
    }, [currentStage?.status, carryQty]);

    const handleStart = async () => {
        setBusy(true);
        try {
            const updated = await startTextileStage(id, currentIdx, { qtyStarted: qty ? Number(qty) : undefined, remarks });
            setLot(updated);
            toast.success('Stage started');
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleComplete = async () => {
        setBusy(true);
        try {
            const payload = stageIsDyeing(currentStage?.stageName)
                ? { remarks }
                : {
                    qtyCompleted: Number(qty),
                    remarks,
                    ...(jobWorkStage && jobWork.vendorWorker ? {
                        vendorWorker: jobWork.vendorWorker,
                        processName,
                        partyType: workers.find((w) => w.vendorWorker === jobWork.vendorWorker)?.partyType || 'worker',
                        rateType: jobWork.rateType || undefined,
                        rateApplied: jobWork.rateApplied ? Number(jobWork.rateApplied) : undefined,
                        rateMasterId: jobWork.rateMasterId || undefined,
                    } : {}),
                };
            const updated = await completeTextileStage(id, currentIdx, payload);
            setLot(updated);
            toast.success(jobWorkStage && labourPreview ? `Stage completed · Labour ₹${labourPreview}` : 'Stage completed');
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <BrandedLoader message="Loading textile lot…" />;
    if (!lot) return <div style={{ padding: 24 }}>Lot not found</div>;

    const atDyeing = stageIsDyeing(currentStage?.stageName);
    const atGrey = stageIsGrey(currentStage?.stageName);
    const outstandingDyeing = Math.max(0, Number(t.meterIssuedTotal || 0) - Number(t.meterReturnedTotal || 0));

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_LOTS)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back to list
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{lot.lotNo} — Stage Progress</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        {t.fabricName} · Roll {t.rollNo} · {t.colour} / {t.shade} · GSM {t.gsm ?? '—'} · Width {t.width ?? '—'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={PATHS.PRODUCTION.TEXTILE_DYEING_ISSUE(id)} style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>Dyeing Issue</Link>
                    <Link to={PATHS.PRODUCTION.TEXTILE_DYEING_RETURN(id)} style={{ padding: '6px 12px', background: '#f0fdf4', color: '#059669', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>Dyeing Return</Link>
                    <Link to={PATHS.PRODUCTION.TEXTILE_LOT_REPORT(id)} style={{ padding: '6px 12px', background: '#f5f3ff', color: '#7c3aed', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>Lot Report</Link>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                    ['Grey Fabric', t.greyFabricMeter],
                    ['Available', t.availableMeter],
                    ['Issued', t.meterIssuedTotal],
                    ['Returned', t.meterReturnedTotal],
                    ['Process Cost', t.processCostTotal],
                ].map(([label, val]) => (
                    <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: label === 'Shortage' && val > 0 ? '#dc2626' : '#0f172a' }}>{val ?? 0} m</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Workflow Stages</h2>
                    {(lot.stages || []).map((s, idx) => {
                        const isCurrent = idx === currentIdx && !isDone;
                        const wip = t.stageWip?.[idx];
                        return (
                            <div key={s._id || idx} style={{ border: isCurrent ? '2px solid #7c3aed' : '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8, background: isCurrent ? '#faf5ff' : '#fff' }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.sequenceNo}. {s.stageName} <span style={{ fontSize: 11, color: '#64748b' }}>({s.status})</span></div>
                                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                                    Started: {s.qtyStarted} m · Completed: {s.qtyCompleted} m · WIP: {wip?.wipMeter ?? 0} m
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!isDone && currentStage && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Current: {currentStage.stageName}</h2>

                        {atDyeing && (
                            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                                Use Dyeing Issue / Return screens. Outstanding issued: {outstandingDyeing} m.
                                {Number(t.meterReturnedTotal || 0) > 0 && outstandingDyeing === 0 && ' Ready to complete dyeing.'}
                            </p>
                        )}

                        {currentStage.status === 'pending' && !atDyeing && (
                            <>
                                <label style={{ display: 'block', marginBottom: 10 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Qty / Meter to start</span>
                                    <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                                </label>
                                <button type="button" disabled={busy} onClick={handleStart} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                    <Play size={14} /> Start {atGrey ? 'Grey Fabric Inward' : 'Stage'}
                                </button>
                            </>
                        )}

                        {currentStage.status === 'started' && !atDyeing && (
                            <>
                                <label style={{ display: 'block', marginBottom: 10 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Qty / Meter / PCS completed</span>
                                    <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                                </label>
                                {jobWorkStage && (
                                    <>
                                        <label style={{ display: 'block', marginBottom: 10 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>WORKER / VENDOR ({processName})</span>
                                            {workers.length > 0 ? (
                                                <select value={jobWork.vendorWorker} onChange={(e) => applyWorker(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }}>
                                                    <option value="">Select…</option>
                                                    {workers.map((w) => <option key={w._id} value={w.vendorWorker}>{w.vendorWorker} — ₹{w.defaultRate}</option>)}
                                                </select>
                                            ) : (
                                                <input value={jobWork.vendorWorker} onChange={(e) => applyWorker(e.target.value)} placeholder="Worker A" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4 }} />
                                            )}
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                                            <input value={jobWork.rateType} onChange={(e) => setJobWork({ ...jobWork, rateType: e.target.value })} placeholder="Rate type" style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                                            <input type="number" value={jobWork.rateApplied} onChange={(e) => setJobWork({ ...jobWork, rateApplied: e.target.value })} placeholder="Rate ₹" style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                                        </div>
                                        {jobWork.vendorWorker && (
                                            <p style={{ fontSize: 12, color: '#059669', marginBottom: 10 }}>Labour cost: <strong>₹{labourPreview}</strong></p>
                                        )}
                                    </>
                                )}
                                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 10 }} />
                                <button type="button" disabled={busy} onClick={handleComplete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                    <CheckCircle2 size={14} /> Complete & Next
                                </button>
                            </>
                        )}

                        {atDyeing && currentStage.status !== 'pending' && outstandingDyeing === 0 && Number(t.meterReturnedTotal || 0) > 0 && (
                            <button type="button" disabled={busy} onClick={handleComplete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 8 }}>
                                <CheckCircle2 size={14} /> Complete Dyeing ({t.meterReturnedTotal} m)
                            </button>
                        )}
                    </div>
                )}

                {isDone && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, color: '#065f46', fontSize: 13 }}>
                        Lot completed. Finished meter: <strong>{t.finishedMeter ?? 0} m</strong> · Demo stock: <strong>{t.demoFinishedStockMeter ?? 0} m</strong>
                    </div>
                )}
            </div>
        </div>
    );
}
