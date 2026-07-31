import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}
function badge(text, bg = '#e2e8f0') {
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, fontSize: 11, marginRight: 6 };
}

export default function DataExtractorSalesWorkflowPage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.sales_workflow.view'),
        canRecommend: can(hasPermission, 'data_extractor.sales_workflow.recommend'),
        canPrepare: can(hasPermission, 'data_extractor.sales_workflow.prepare'),
        canReview: can(hasPermission, 'data_extractor.sales_workflow.review'),
        canAssign: can(hasPermission, 'data_extractor.sales_workflow.assign') && can(hasPermission, 'crm.leads.assign'),
        canReassign: can(hasPermission, 'data_extractor.sales_workflow.reassign') && can(hasPermission, 'crm.leads.edit'),
        canTask: can(hasPermission, 'data_extractor.sales_workflow.create_task') && can(hasPermission, 'crm.leads.create_task'),
        canFollowUp: can(hasPermission, 'data_extractor.sales_workflow.create_followup') && can(hasPermission, 'crm.leads.edit'),
        canRollback: can(hasPermission, 'data_extractor.sales_workflow.rollback'),
        canLock: can(hasPermission, 'data_extractor.sales_workflow.lock'),
        canHistory: can(hasPermission, 'data_extractor.sales_workflow.history'),
        canExport: can(hasPermission, 'data_extractor.sales_workflow.export'),
        canBatchPrepare: can(hasPermission, 'data_extractor.sales_workflow.batch_prepare'),
        canBatchApply: can(hasPermission, 'data_extractor.sales_workflow.batch_apply'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState('');
    const [crmLeadId, setCrmLeadId] = useState('');
    const [reassignReason, setReassignReason] = useState('');
    const [approveFlags, setApproveFlags] = useState({ approveAssignment: true, approveTask: false, approveFollowUp: false });
    const [filters, setFilters] = useState({ status: '', eligibilityStatus: '', locked: '' });
    const [batchLeadIds, setBatchLeadIds] = useState('');

    const selected = useMemo(() => items.find((x) => String(x._id) === String(selectedId)) || null, [items, selectedId]);

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listSalesWorkflowDrafts(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load sales workflow drafts');
        }
    }, [filters, vis.canView]);

    useEffect(() => { load(); }, [load]);

    const runAction = async (label, fn) => {
        setBusy(label);
        try {
            await fn();
            toast.success(label);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || `${label} failed`);
        } finally {
            setBusy('');
        }
    };

    if (!vis.canView) {
        return <div style={card}>You do not have permission to view Sales Workflow.</div>;
    }

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Sales Workflow</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                    Controlled salesperson assignment, follow-up plan and task drafts. Nothing is assigned or created without approval. No email or WhatsApp is sent.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <input style={{ ...field, minWidth: 220 }} placeholder="CRM Lead ID" value={crmLeadId} onChange={(e) => setCrmLeadId(e.target.value)} />
                {vis.canPrepare && (
                    <button type="button" style={btnPrimary} disabled={!!busy || !crmLeadId} onClick={() => runAction('Prepare', () => dataExtractorApi.prepareSalesWorkflow({ crmLeadId }))}>
                        Prepare recommendation
                    </button>
                )}
                {vis.canRecommend && (
                    <button type="button" style={btn} disabled={!!busy || !crmLeadId} onClick={async () => {
                        setBusy('recommend');
                        try {
                            const data = await dataExtractorApi.recommendSalesWorkflow({ crmLeadId });
                            toast.success(`Suggested: ${data?.suggested?.userName || 'none'} (${data?.suggested?.assignmentScore ?? '-'})`);
                        } catch (e) {
                            toast.error(e?.response?.data?.message || 'Recommend failed');
                        } finally { setBusy(''); }
                    }}>
                        Recommend only
                    </button>
                )}
                {vis.canExport && (
                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Export', () => dataExtractorApi.exportSalesWorkflow({ format: 'json' }))}>Export</button>
                )}
                <select style={field} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">Status</option>
                    {['DRAFT', 'RECOMMENDATION_READY', 'ASSIGNMENT_REVIEW_REQUIRED', 'FOLLOWUP_REVIEW_REQUIRED', 'READY_FOR_APPROVAL', 'APPROVED', 'ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED', 'CANCELLED', 'REJECTED', 'LOCKED', 'FAILED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select style={field} value={filters.eligibilityStatus} onChange={(e) => setFilters((f) => ({ ...f, eligibilityStatus: e.target.value }))}>
                    <option value="">Eligibility</option>
                    {['ELIGIBLE', 'NO_CRM_LEAD', 'PENDING_PHASE13_APPROVAL', 'ALREADY_ASSIGNED', 'LOCKED', 'BLOCKED', 'INVALID'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select style={field} value={filters.locked} onChange={(e) => setFilters((f) => ({ ...f, locked: e.target.value }))}>
                    <option value="">Locked?</option>
                    <option value="true">Locked</option>
                    <option value="false">Unlocked</option>
                </select>
            </div>

            {vis.canBatchPrepare && (
                <div style={{ ...card, marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Batch preparation</div>
                    <textarea style={{ ...field, width: '100%', minHeight: 48 }} placeholder="CRM Lead IDs (comma or newline separated)" value={batchLeadIds} onChange={(e) => setBatchLeadIds(e.target.value)} />
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Batch prepare', async () => {
                            const ids = batchLeadIds.split(/[\s,]+/).filter(Boolean);
                            const job = await dataExtractorApi.createSalesWorkflowBatch({ crmLeadIds: ids, jobType: 'prepare_recommendations' });
                            await dataExtractorApi.processSalesWorkflowBatch(job._id, { maxItems: 25 });
                        })}>Prepare batch</button>
                        {vis.canBatchApply && (
                            <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Batch apply preview', async () => {
                                const ids = batchLeadIds.split(/[\s,]+/).filter(Boolean);
                                await dataExtractorApi.createSalesWorkflowBatch({
                                    crmLeadIds: ids,
                                    jobType: 'batch_apply',
                                    batchApplyConfirmed: true,
                                    idempotencyKey: `ui-apply-${Date.now()}`,
                                });
                                toast('Batch apply job created — process requires confirmation and permission');
                            })}>Create batch-apply job</button>
                        )}
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr', gap: 12 }}>
                <div>
                    {(items || []).map((row) => (
                        <button
                            key={row._id}
                            type="button"
                            onClick={() => { setSelectedId(row._id); setHistory(null); setPreview(null); }}
                            style={{
                                ...card, width: '100%', textAlign: 'left', cursor: 'pointer',
                                borderColor: String(selectedId) === String(row._id) ? '#2563eb' : '#e2e8f0',
                            }}
                        >
                            <div style={{ fontWeight: 600 }}>{row.companyName || 'Lead'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Lead: {String(row.crmLeadId || '')}</div>
                            <div style={{ marginTop: 6 }}>
                                <span style={badge(row.status)}>{row.status}</span>
                                <span style={badge(row.eligibilityStatus, '#fef3c7')}>{row.eligibilityStatus}</span>
                                {row.duplicateCheck?.status && row.duplicateCheck.status !== 'NO_DUPLICATE' && (
                                    <span style={badge(row.duplicateCheck.status, '#fee2e2')}>{row.duplicateCheck.status}</span>
                                )}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                                Current: {row.currentOwnerName || '—'} → Suggested: {row.suggestedOwnerName || '—'}
                            </div>
                        </button>
                    ))}
                    {!items.length && <div style={card}>No sales workflow drafts yet.</div>}
                </div>

                <div>
                    {!selected && <div style={card}>Select a draft to review assignment, follow-up and tasks.</div>}
                    {selected && (
                        <div style={card}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>{selected.companyName}</div>
                            <div style={{ fontSize: 12, marginBottom: 8 }}>
                                <div>Strategy: {selected.assignmentStrategy}</div>
                                <div>Current owner: {selected.currentOwnerName || '—'} ({String(selected.currentOwnerId || '')})</div>
                                <div>Suggested: {selected.suggestedOwnerName || '—'} score {selected.assignmentScoreBreakdown?.assignmentScore ?? '—'}</div>
                                <div>Selected: {selected.selectedOwnerName || '—'}</div>
                                <div>Lead score: {selected.leadScoreSnapshot?.finalScore ?? '—'} / {selected.leadScoreSnapshot?.priority || '—'}</div>
                                <div>Product: {selected.productOpportunitySnapshot?.productName || '—'}</div>
                                <div>Contact: {selected.contactSnapshot?.contactName || selected.contactSnapshot?.name || '—'}</div>
                            </div>

                            {selected.assignmentScoreBreakdown?.dimensions?.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>Assignment score</div>
                                    {(selected.assignmentScoreBreakdown.dimensions || []).map((d) => (
                                        <div key={d.id} style={{ fontSize: 12 }}>{d.label}: {d.score}/{d.maxScore} — {d.reason}</div>
                                    ))}
                                </div>
                            )}

                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Follow-up plan (draft)</div>
                                <div style={{ fontSize: 12 }}>
                                    Action: {selected.followUpPlanDraft?.recommendedAction || '—'}
                                    <br />
                                    Due: {selected.followUpPlanDraft?.dueDate || '—'}
                                    <br />
                                    <em>executeCommunication: false</em>
                                </div>
                            </div>

                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Task drafts</div>
                                {(selected.taskDrafts || []).map((t, i) => (
                                    <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                                        {t.title} — due {t.dueDate || '—'} — {t.priority}
                                    </div>
                                ))}
                                {!selected.taskDrafts?.length && <div style={{ fontSize: 12 }}>No task drafts</div>}
                            </div>

                            {selected.alternativeOwners?.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>Alternatives</div>
                                    {selected.alternativeOwners.map((a) => (
                                        <div key={String(a.userId)} style={{ fontSize: 12 }}>
                                            #{a.recommendedRank || '-'} {a.userName} — {a.assignmentScore}
                                            {vis.canReview && (
                                                <button type="button" style={{ ...btn, marginLeft: 6 }} disabled={!!busy} onClick={() => runAction('Select owner', () => dataExtractorApi.reviewSalesWorkflow(selected._id, {
                                                    selectedOwnerId: a.userId,
                                                    ownerDecision: 'SELECT_DIFFERENT_OWNER',
                                                }))}>Select</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
                                {['approveAssignment', 'approveTask', 'approveFollowUp'].map((k) => (
                                    <label key={k}>
                                        <input type="checkbox" checked={!!approveFlags[k]} onChange={(e) => setApproveFlags((f) => ({ ...f, [k]: e.target.checked }))} /> {k.replace('approve', '')}
                                    </label>
                                ))}
                            </div>
                            <input style={{ ...field, width: '100%', marginBottom: 8 }} placeholder="Reassignment reason (required if changing owner)" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {vis.canReview && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Keep owner', () => dataExtractorApi.reviewSalesWorkflow(selected._id, { ownerDecision: 'KEEP_EXISTING_OWNER' }))}>Keep current owner</button>
                                )}
                                {vis.canReview && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                                        const data = await dataExtractorApi.previewSalesWorkflow(selected._id);
                                        setPreview(data);
                                        toast.success('Preview ready');
                                    }}>Preview</button>
                                )}
                                {vis.canReview && (
                                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Final approve', () => dataExtractorApi.finalApproveSalesWorkflow(selected._id, {
                                        ...approveFlags,
                                        reassignmentReason: reassignReason,
                                    }))}>Final approve selected</button>
                                )}
                                {vis.canAssign && (
                                    <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Apply', () => dataExtractorApi.applySalesWorkflow(selected._id, { reassignmentReason: reassignReason }))}>Apply approved actions</button>
                                )}
                                {vis.canReview && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Reject', () => dataExtractorApi.rejectSalesWorkflow(selected._id, { reason: 'Rejected in UI' }))}>Reject</button>
                                )}
                                {vis.canLock && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlock' : 'Lock', () => dataExtractorApi.lockSalesWorkflow(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button>
                                )}
                                {vis.canHistory && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                                        setBusy('history');
                                        try { setHistory(await dataExtractorApi.getSalesWorkflowHistory(selected._id)); }
                                        finally { setBusy(''); }
                                    }}>History</button>
                                )}
                                {vis.canRollback && selected.transactionId && (
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Rollback', () => dataExtractorApi.rollbackSalesWorkflow(selected.transactionId))}>Request rollback</button>
                                )}
                            </div>

                            {preview && (
                                <pre style={{ marginTop: 10, fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>{JSON.stringify(preview, null, 2)}</pre>
                            )}
                            {history && (
                                <pre style={{ marginTop: 10, fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>{JSON.stringify(history.history || history, null, 2)}</pre>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}