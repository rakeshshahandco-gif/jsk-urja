import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorImprovementApprovalPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.improvement_approval.view')
        || can(hasPermission, 'data_extractor.improvement_approval.submit');
    const canSubmit = can(hasPermission, 'data_extractor.improvement_approval.submit');
    const canBiz = can(hasPermission, 'data_extractor.improvement_approval.business_review');
    const canTech = can(hasPermission, 'data_extractor.improvement_approval.technical_review');
    const canRisk = can(hasPermission, 'data_extractor.improvement_approval.risk_review');
    const canApprove = can(hasPermission, 'data_extractor.improvement_approval.approve');
    const canReject = can(hasPermission, 'data_extractor.improvement_approval.reject');
    const canEvidence = can(hasPermission, 'data_extractor.improvement_approval.request_evidence');
    const canSpec = can(hasPermission, 'data_extractor.improvement_approval.generate_spec');
    const canAudit = can(hasPermission, 'data_extractor.improvement_approval.audit');
    const canSettings = can(hasPermission, 'data_extractor.improvement_approval.settings')
        || can(hasPermission, 'data_extractor.improvement_approval.manage');

    const [tab, setTab] = useState('queue');
    const [cases, setCases] = useState([]);
    const [selected, setSelected] = useState(null);
    const [specs, setSpecs] = useState([]);
    const [policy, setPolicy] = useState(null);
    const [audit, setAudit] = useState([]);
    const [proposalId, setProposalId] = useState('');
    const [busy, setBusy] = useState('');
    const [reviewType, setReviewType] = useState('BUSINESS_REVIEW');
    const [reviewDecision, setReviewDecision] = useState('APPROVE');
    const [comment, setComment] = useState('');

    const loadCases = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listApprovalCases();
            setCases(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load cases');
        }
    }, []);

    const loadDetail = async (id) => {
        try {
            const data = await dataExtractorApi.getApprovalCase(id);
            setSelected(data);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load case');
        }
    };

    const loadSpecs = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listImplementationSpecs();
            setSpecs(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load specs');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'queue' || tab === 'detail') loadCases();
        if (tab === 'specs') loadSpecs();
        if (tab === 'settings') dataExtractorApi.getApprovalPolicy().then(setPolicy).catch(() => {});
        if (tab === 'audit' && canAudit) dataExtractorApi.getApprovalAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
    }, [tab, canView, canAudit, loadCases, loadSpecs]);

    if (!canView) {
        return <div style={card}>You do not have permission to view the Improvement Approval Center.</div>;
    }

    const createCase = async () => {
        if (!canSubmit || !proposalId) return;
        setBusy('create');
        try {
            const data = await dataExtractorApi.createApprovalCase({ proposalId });
            toast.success('Approval case created (non-executable)');
            setSelected(data);
            setTab('detail');
            loadCases();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Create failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Improvement Approval Center</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                    Controlled review of Phase 19 draft proposals. &quot;Approved&quot; means
                    <strong> approved for Implementation Specification only</strong> — never active, applied, or deployed.
                </p>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.LEARNING_INTELLIGENCE}>← Learning Intelligence proposals</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.CONFIGURATION_MANAGER}>Configuration Manager</Link>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {[['queue', 'Case queue'], ['detail', 'Case detail'], ['specs', 'Specifications'], ['settings', 'Policy'], ['audit', 'Audit']].map(([id, label]) => (
                    <button key={id} type="button" style={{ ...btn, background: tab === id ? '#eff6ff' : '#fff' }} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>

            {tab === 'queue' && (
                <div>
                    {canSubmit && (
                        <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                            <input style={field} placeholder="Phase 19 proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
                            <button type="button" style={btnPrimary} disabled={busy === 'create'} onClick={createCase}>Create case</button>
                        </div>
                    )}
                    <div style={card}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Risk</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Proposal</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Version</th>
                                    <th style={{ textAlign: 'left', padding: 4 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {cases.map((c) => (
                                    <tr key={c.id}>
                                        <td style={{ padding: 4 }}>{c.status}</td>
                                        <td style={{ padding: 4 }}>{c.riskLevel}</td>
                                        <td style={{ padding: 4 }}>{c.proposalId?.slice?.(-8) || c.proposalId}</td>
                                        <td style={{ padding: 4 }}>{c.proposalVersion}</td>
                                        <td style={{ padding: 4 }}>
                                            <button type="button" style={btn} onClick={() => { loadDetail(c.id); setTab('detail'); }}>Open</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'detail' && selected && (
                <div>
                    <div style={card}>
                        <div style={{ fontWeight: 700 }}>{selected.status} · risk {selected.riskLevel}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>executable: false · {selected.note}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
                            <span>Sample: {selected.eligibilitySnapshot?.sampleSize}</span>
                            <span>Agreement: {selected.eligibilitySnapshot?.reviewerAgreement}</span>
                            <span>Ground truth: {selected.eligibilitySnapshot?.groundTruthCategory}</span>
                            {(selected.eligibilitySnapshot?.outdatedFeedbackCount > 0) && <span style={{ color: '#b45309' }}>Outdated feedback warning</span>}
                            {(selected.eligibilitySnapshot?.conflictedFeedbackCount > 0) && <span style={{ color: '#b91c1c' }}>Conflict warning</span>}
                        </div>
                    </div>

                    {selected.proposalSummary && (
                        <div style={card}>
                            <strong>Proposal summary</strong>
                            <div style={{ fontSize: 13 }}>{selected.proposalSummary.title}</div>
                            <div style={{ fontSize: 12 }}>{selected.proposalSummary.proposalType} · {selected.proposalSummary.sourceModule}</div>
                            <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>
                                {JSON.stringify(selected.configComparison || {}, null, 2)}
                            </pre>
                        </div>
                    )}

                    <div style={card}>
                        <strong>Risk / impact (read-only)</strong>
                        <div style={{ fontSize: 12 }}>Factors: {(selected.riskFactors || []).join(' · ')}</div>
                        <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>
                            {JSON.stringify(selected.impactSummary || {}, null, 2)}
                        </pre>
                    </div>

                    <div style={card}>
                        <strong>Reviews</strong>
                        {(selected.reviews || []).map((r) => (
                            <div key={r.id} style={{ fontSize: 12, borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                                {r.reviewType} · {r.decision} · v{r.proposalVersion}
                            </div>
                        ))}
                        {(canBiz || canTech || canRisk) && (
                            <div style={{ display: 'grid', gap: 8, marginTop: 8, maxWidth: 520 }}>
                                <select style={field} value={reviewType} onChange={(e) => setReviewType(e.target.value)}>
                                    {canBiz && <option value="BUSINESS_REVIEW">Business Review</option>}
                                    {canTech && <option value="TECHNICAL_REVIEW">Technical Review</option>}
                                    {canRisk && <option value="RISK_REVIEW">Risk Review</option>}
                                    {can(hasPermission, 'data_extractor.improvement_approval.privacy_review') && <option value="PRIVACY_REVIEW">Privacy Review</option>}
                                    {can(hasPermission, 'data_extractor.improvement_approval.security_review') && <option value="SECURITY_REVIEW">Security Review</option>}
                                </select>
                                <select style={field} value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value)}>
                                    <option value="APPROVE">APPROVE</option>
                                    <option value="APPROVE_WITH_CONDITIONS">APPROVE_WITH_CONDITIONS</option>
                                    <option value="NEEDS_MORE_EVIDENCE">NEEDS_MORE_EVIDENCE</option>
                                    <option value="REJECT">REJECT</option>
                                    <option value="ABSTAIN">ABSTAIN</option>
                                </select>
                                <textarea style={field} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment / conditions" />
                                <button
                                    type="button"
                                    style={btnPrimary}
                                    onClick={async () => {
                                        try {
                                            await dataExtractorApi.reviewApprovalCase(selected.id, {
                                                reviewType,
                                                decision: reviewDecision,
                                                comment,
                                                conditions: reviewDecision === 'APPROVE_WITH_CONDITIONS' && comment ? [comment] : [],
                                            });
                                            toast.success('Review recorded');
                                            loadDetail(selected.id);
                                        } catch (e) {
                                            toast.error(e?.response?.data?.message || 'Review failed');
                                        }
                                    }}
                                >
                                    Submit review
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {canSubmit && (
                            <button type="button" style={btn} onClick={async () => { await dataExtractorApi.submitApprovalCase(selected.id, {}); loadDetail(selected.id); }}>Submit for review</button>
                        )}
                        {canEvidence && (
                            <button type="button" style={btn} onClick={async () => { await dataExtractorApi.requestApprovalEvidence(selected.id, { reason: comment || 'Need more evidence' }); loadDetail(selected.id); }}>Request more evidence</button>
                        )}
                        {canApprove && (
                            <button
                                type="button"
                                style={btnPrimary}
                                onClick={async () => {
                                    try {
                                        await dataExtractorApi.finalApprovalDecision(selected.id, { decision: 'APPROVE', comment });
                                        toast.success('Approved for Implementation Specification only');
                                        loadDetail(selected.id);
                                    } catch (e) {
                                        toast.error(e?.response?.data?.message || 'Final decision failed');
                                    }
                                }}
                            >
                                Approve for Implementation Spec
                            </button>
                        )}
                        {canReject && (
                            <button type="button" style={btn} onClick={async () => { await dataExtractorApi.finalApprovalDecision(selected.id, { decision: 'REJECT', reason: comment || 'Rejected' }); loadDetail(selected.id); }}>Reject</button>
                        )}
                        {canSpec && (
                            <button
                                type="button"
                                style={btnPrimary}
                                onClick={async () => {
                                    try {
                                        const spec = await dataExtractorApi.generateImplementationSpec(selected.id, {});
                                        toast.success('Specification generated (executable:false)');
                                        setTab('specs');
                                        loadSpecs();
                                        return spec;
                                    } catch (e) {
                                        toast.error(e?.response?.data?.message || 'Spec generation failed');
                                    }
                                }}
                            >
                                Generate Implementation Spec
                            </button>
                        )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        No Activate / Apply / Execute / Deploy / Train / Update Score buttons exist by design.
                    </div>
                </div>
            )}

            {tab === 'specs' && (
                <div>
                    {specs.map((s) => (
                        <div key={s.id} style={card}>
                            <div style={{ fontWeight: 600 }}>{s.title}</div>
                            <div style={{ fontSize: 12 }}>{s.status} · v{s.specificationVersion} · executable: {String(s.executable)} · implementationRequired: {String(s.implementationRequired)}</div>
                            <div style={{ fontSize: 11, color: '#92400e' }}>{(s.limitations || []).slice(0, 3).join(' · ')}</div>
                        </div>
                    ))}
                    {!specs.length && <div style={card}>No specifications yet.</div>}
                </div>
            )}

            {tab === 'settings' && (
                <div style={card}>
                    <strong>Approval policy</strong>
                    {!canSettings && <p style={{ fontSize: 12, color: '#b91c1c' }}>View-only</p>}
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(policy, null, 2)}</pre>
                </div>
            )}

            {tab === 'audit' && (
                <div style={card}>
                    <strong>Append-only audit</strong>
                    {(audit || []).map((a) => (
                        <div key={a._id} style={{ fontSize: 12, borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                            {a.action} · {a.entityType} · {a.createdAt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
