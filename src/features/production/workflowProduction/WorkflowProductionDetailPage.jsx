import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Play, CheckCircle2, SkipForward, Paperclip } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import {
    completeWorkflowProductionStage,
    getWorkflowProductionLot,
    skipWorkflowProductionStage,
    startWorkflowProductionStage,
    uploadWorkflowProductionAttachment,
} from '@/services/workflowProductionLotApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const STAGE_BADGE = {
    pending: { bg: '#f1f5f9', text: '#64748b' },
    started: { bg: '#eff6ff', text: '#2563eb' },
    completed: { bg: '#f0fdf4', text: '#059669' },
    skipped: { bg: '#fffbeb', text: '#d97706' },
};

function fmtDate(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString();
}

function userLabel(u) {
    if (!u) return '—';
    if (typeof u === 'string') return u;
    return u.name || u.email || '—';
}

export default function WorkflowProductionDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [lot, setLot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [startQty, setStartQty] = useState('');
    const [completeQty, setCompleteQty] = useState('');
    const [remarks, setRemarks] = useState('');
    const [attachmentFile, setAttachmentFile] = useState(null);

    const loadLot = useCallback(() => {
        setLoading(true);
        getWorkflowProductionLot(id)
            .then(setLot)
            .catch((e) => toast.error(e.response?.data?.message || e.message || 'Failed to load lot'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadLot(); }, [loadLot]);

    const currentIdx = lot?.currentStageIndex ?? 0;
    const currentStage = lot?.stages?.[currentIdx];
    const isLotDone = lot?.lotStatus === 'completed' || lot?.lotStatus === 'cancelled';

    const carryQty = useMemo(() => {
        if (!lot?.stages?.length) return 0;
        if (currentIdx === 0) return Number(lot.qtyStarted || 0);
        const prev = lot.stages[currentIdx - 1];
        if (!prev) return 0;
        if (prev.status === 'completed') return Number(prev.qtyCompleted || 0);
        if (prev.status === 'skipped') return Number(prev.qtyStarted || 0);
        return 0;
    }, [lot, currentIdx]);

    useEffect(() => {
        if (currentStage?.status === 'started') {
            setCompleteQty(String(currentStage.qtyStarted || ''));
        } else if (currentStage?.status === 'pending') {
            setStartQty(String(carryQty || ''));
        }
    }, [currentStage?.status, currentStage?.qtyStarted, carryQty]);

    const handleStart = async () => {
        if (!currentStage) return;
        setBusy(true);
        try {
            const updated = await startWorkflowProductionStage(id, currentIdx, {
                qtyStarted: startQty ? Number(startQty) : undefined,
                remarks,
            });
            setLot(updated);
            setRemarks('');
            toast.success(`Stage "${currentStage.stageName}" started`);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleComplete = async () => {
        if (!currentStage) return;
        setBusy(true);
        try {
            let attachmentUrl;
            let attachmentName;
            if (attachmentFile) {
                const up = await uploadWorkflowProductionAttachment(id, currentIdx, attachmentFile);
                attachmentUrl = up.attachmentUrl;
                attachmentName = up.attachmentName;
            }
            const updated = await completeWorkflowProductionStage(id, currentIdx, {
                qtyCompleted: Number(completeQty),
                remarks,
                attachmentUrl,
                attachmentName,
            });
            setLot(updated);
            setRemarks('');
            setAttachmentFile(null);
            toast.success(`Stage "${currentStage.stageName}" completed`);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleSkip = async () => {
        if (!currentStage?.allowSkip) return;
        if (!window.confirm(`Skip stage "${currentStage.stageName}"?`)) return;
        setBusy(true);
        try {
            const updated = await skipWorkflowProductionStage(id, currentIdx, { remarks });
            setLot(updated);
            setRemarks('');
            toast.success('Stage skipped');
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <BrandedLoader message="Loading production lot..." />;
    if (!lot) {
        return (
            <div style={{ padding: 24 }}>
                <p>Lot not found.</p>
                <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOTS)}>Back</button>
            </div>
        );
    }

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOTS)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
                <ChevronLeft size={16} /> Back to list
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{lot.lotNo}</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        Batch: {lot.batchNo || lot.lotNo} · {lot.itemName} · Workflow: {lot.workflowName}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <div><span style={{ color: '#64748b' }}>Started:</span> <strong>{lot.qtyStarted}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Completed:</span> <strong>{lot.qtyCompleted}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Pending:</span> <strong>{lot.pendingQty}</strong></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, alignItems: 'start' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Lot Stage Progress</h2>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {(lot.stages || []).map((stage, idx) => {
                            const badge = STAGE_BADGE[stage.status] || STAGE_BADGE.pending;
                            const isCurrent = idx === currentIdx && !isLotDone;
                            return (
                                <div
                                    key={stage._id || idx}
                                    style={{
                                        border: isCurrent ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        padding: 12,
                                        background: isCurrent ? '#f8fbff' : '#fff',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                                            {stage.sequenceNo}. {stage.stageName}
                                            {isCurrent && <span style={{ marginLeft: 8, color: '#2563eb', fontSize: 11 }}>(Current)</span>}
                                        </div>
                                        <span style={{ padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.text, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                                            {stage.status}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8, fontSize: 12, color: '#475569' }}>
                                        <div>Qty Started: <strong>{stage.qtyStarted}</strong></div>
                                        <div>Qty Completed: <strong>{stage.qtyCompleted}</strong></div>
                                        <div>Pending: <strong>{stage.pendingQty}</strong></div>
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                                        Started: {fmtDate(stage.startedAt)} by {userLabel(stage.startedBy)}
                                        {' · '}
                                        Completed: {fmtDate(stage.completedAt)} by {userLabel(stage.completedBy)}
                                    </div>
                                    {stage.remarks ? <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>Remarks: {stage.remarks}</div> : null}
                                    {stage.attachmentUrl ? (
                                        <a href={stage.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: 12, color: '#2563eb' }}>
                                            Attachment: {stage.attachmentName || 'View file'}
                                        </a>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                    {!isLotDone && currentStage && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Stage Completion Entry</h2>
                            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                                Current: <strong>{currentStage.stageName}</strong> · Carry forward qty: {carryQty}
                            </p>

                            {currentStage.status === 'pending' && (
                                <>
                                    <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Qty to Start</span>
                                        <input type="number" min="0.0001" step="any" value={startQty} onChange={(e) => setStartQty(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                                    </label>
                                    <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Remarks</span>
                                        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                                    </label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {currentStage.allowStart !== false && (
                                            <button type="button" disabled={busy} onClick={handleStart} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                                                <Play size={14} /> Start Stage
                                            </button>
                                        )}
                                        {currentStage.allowSkip && (
                                            <button type="button" disabled={busy} onClick={handleSkip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', color: '#d97706', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                                                <SkipForward size={14} /> Skip
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {currentStage.status === 'started' && (
                                <>
                                    <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Qty Completed (max {currentStage.qtyStarted})</span>
                                        <input type="number" min="0.0001" max={currentStage.qtyStarted} step="any" value={completeQty} onChange={(e) => setCompleteQty(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                                    </label>
                                    <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                            Remarks {currentStage.remarksRequired ? '*' : ''}
                                        </span>
                                        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                                    </label>
                                    <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                            Attachment {currentStage.attachmentRequired ? '*' : '(optional)'}
                                        </span>
                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
                                        {attachmentFile && <span style={{ fontSize: 11, color: '#64748b' }}><Paperclip size={12} style={{ verticalAlign: 'middle' }} /> {attachmentFile.name}</span>}
                                    </label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {currentStage.allowComplete !== false && (
                                            <button type="button" disabled={busy} onClick={handleComplete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                                                <CheckCircle2 size={14} /> Complete & Move Next
                                            </button>
                                        )}
                                        {currentStage.allowSkip && (
                                            <button type="button" disabled={busy} onClick={handleSkip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fff', color: '#d97706', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                                                <SkipForward size={14} /> Skip
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {isLotDone && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, color: '#065f46', fontSize: 13 }}>
                            This production lot is <strong>{lot.lotStatus.replace('_', ' ')}</strong>. No further stage actions required.
                        </div>
                    )}

                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Audit Log</h2>
                        <div style={{ maxHeight: 320, overflow: 'auto', display: 'grid', gap: 8 }}>
                            {(lot.auditLog || []).slice().reverse().map((entry) => (
                                <div key={entry._id} style={{ fontSize: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                                    <div style={{ fontWeight: 600, color: '#334155' }}>{entry.action}{entry.stageName ? ` — ${entry.stageName}` : ''}</div>
                                    <div style={{ color: '#64748b' }}>{fmtDate(entry.performedAt)} · {userLabel(entry.performedBy)}</div>
                                </div>
                            ))}
                            {!lot.auditLog?.length && <div style={{ fontSize: 12, color: '#94a3b8' }}>No audit entries yet.</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
