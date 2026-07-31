import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';
import { Link } from 'react-router-dom';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorLearningIntelligencePage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.ai_learning.view')
        || can(hasPermission, 'data_extractor.ai_learning.submit_feedback')
        || can(hasPermission, 'data_extractor.ai_learning.analytics');
    const canSubmit = can(hasPermission, 'data_extractor.ai_learning.submit_feedback');
    const canReview = can(hasPermission, 'data_extractor.ai_learning.review_feedback');
    const canAnalytics = can(hasPermission, 'data_extractor.ai_learning.analytics') || canView;
    const canPropose = can(hasPermission, 'data_extractor.ai_learning.generate_proposal');
    const canDataset = can(hasPermission, 'data_extractor.ai_learning.dataset');
    const canAudit = can(hasPermission, 'data_extractor.ai_learning.audit');
    const canSettings = can(hasPermission, 'data_extractor.ai_learning.settings')
        || can(hasPermission, 'data_extractor.ai_learning.manage');

    const [tab, setTab] = useState('dashboard');
    const [analytics, setAnalytics] = useState(null);
    const [modules, setModules] = useState([]);
    const [feedback, setFeedback] = useState([]);
    const [queue, setQueue] = useState([]);
    const [proposals, setProposals] = useState([]);
    const [datasets, setDatasets] = useState([]);
    const [audit, setAudit] = useState([]);
    const [settings, setSettings] = useState(null);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        sourceModule: 'industry_classification',
        sourceRecordId: '',
        feedbackType: 'CORRECT',
        comment: '',
        outputType: '',
    });

    const loadDashboard = useCallback(async () => {
        if (!canAnalytics) return;
        try {
            const [a, m] = await Promise.all([
                dataExtractorApi.getLearningAnalytics(),
                dataExtractorApi.getLearningModuleAnalytics(),
            ]);
            setAnalytics(a);
            setModules(m?.modules || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Analytics load failed');
        }
    }, [canAnalytics]);

    const loadFeedback = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listLearningFeedback();
            setFeedback(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Feedback load failed');
        }
    }, []);

    const loadQueue = useCallback(async () => {
        try {
            const data = await dataExtractorApi.getLearningReviewQueue();
            setQueue(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Queue load failed');
        }
    }, []);

    const loadProposals = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listLearningProposals();
            setProposals(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Proposals load failed');
        }
    }, []);

    const loadDatasets = useCallback(async () => {
        if (!canDataset) return;
        try {
            const data = await dataExtractorApi.listLearningDatasets();
            setDatasets(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Datasets load failed');
        }
    }, [canDataset]);

    const loadAudit = useCallback(async () => {
        if (!canAudit) return;
        try {
            const data = await dataExtractorApi.getLearningAudit();
            setAudit(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Audit load failed');
        }
    }, [canAudit]);

    const loadSettings = useCallback(async () => {
        try {
            const data = await dataExtractorApi.getLearningSettings();
            setSettings(data);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Settings load failed');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'dashboard') loadDashboard();
        if (tab === 'feedback' || tab === 'submit') loadFeedback();
        if (tab === 'queue') loadQueue();
        if (tab === 'proposals') loadProposals();
        if (tab === 'datasets') loadDatasets();
        if (tab === 'audit') loadAudit();
        if (tab === 'settings') loadSettings();
    }, [tab, canView, loadDashboard, loadFeedback, loadQueue, loadProposals, loadDatasets, loadAudit, loadSettings]);

    const submitFeedback = async () => {
        if (!canSubmit) return;
        setBusy('submit');
        try {
            await dataExtractorApi.submitLearningFeedback({
                ...form,
                comment: form.comment || (form.feedbackType.includes('REJECT') || form.feedbackType.includes('WRONG') || form.feedbackType.includes('NOT_')
                    ? 'Reviewed as incorrect'
                    : ''),
            });
            toast.success('Feedback submitted (source output unchanged)');
            setTab('feedback');
            loadFeedback();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Submit failed');
        } finally {
            setBusy('');
        }
    };

    const generateProposals = async () => {
        if (!canPropose) return;
        setBusy('propose');
        try {
            const data = await dataExtractorApi.generateLearningProposals({});
            toast.success(`${(data?.proposals || []).length} draft proposal(s) — not applied`);
            loadProposals();
            setTab('proposals');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Proposal generation failed');
        } finally {
            setBusy('');
        }
    };

    const prepareDataset = async () => {
        if (!canDataset) return;
        setBusy('dataset');
        try {
            await dataExtractorApi.prepareLearningDataset({
                module: form.sourceModule || 'industry_classification',
                name: `eval-${Date.now()}`,
                redactionLevel: 'STRICT',
            });
            toast.success('Dataset prepared (offline only; no training)');
            loadDatasets();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Dataset prepare failed');
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view Learning Intelligence.</div>;
    }

    const tabs = [
        ['dashboard', 'Dashboard'],
        ['feedback', 'Feedback Inbox'],
        ['submit', 'Submit Feedback'],
        ['queue', 'Review Queue'],
        ['proposals', 'Proposals'],
        ['datasets', 'Datasets'],
        ['audit', 'Audit'],
        ['settings', 'Settings'],
    ];

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Learning Intelligence</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                    Controlled feedback, quality analytics, and draft improvement proposals.
                    Never auto-retrains, never applies rules/thresholds, never mutates CRM or source scores.
                    {' '}<Link to={PATHS.DATA_EXTRACTOR.IMPROVEMENT_APPROVAL}>Open Improvement Approval Center</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {tabs.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        style={{ ...btn, background: tab === id ? '#eff6ff' : '#fff', borderColor: tab === id ? '#2563eb' : '#cbd5e1' }}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'dashboard' && (
                <div>
                    {analytics && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                            <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Sample size</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.sampleSize}</div></div>
                            <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Reliability</div><div style={{ fontSize: 16, fontWeight: 700 }}>{analytics.label}</div></div>
                            <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Acceptance rate*</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.metrics?.acceptanceRate ?? '—'}%</div></div>
                            <div style={card}><div style={{ fontSize: 11, color: '#64748b' }}>Conflicts</div><div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.metrics?.conflictRate ?? 0}%</div></div>
                        </div>
                    )}
                    <div style={{ ...card, fontSize: 12, color: '#64748b' }}>
                        * Acceptance rate is not accuracy unless verified ground truth exists. {analytics?.groundTruthReminder}
                        {analytics?.aggregateOnly ? ' Aggregate-only view: detail fields hidden.' : ''}
                    </div>
                    <div style={card}>
                        <strong>Module quality</strong>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Module</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Sample</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Accept %</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Agreement</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Label</th>
                                </tr>
                            </thead>
                            <tbody>
                                {modules.map((m) => (
                                    <tr key={m.module}>
                                        <td style={{ padding: 4 }}>{m.module}</td>
                                        <td style={{ padding: 4 }}>{m.sampleSize}</td>
                                        <td style={{ padding: 4 }}>{m.acceptanceRate ?? '—'}</td>
                                        <td style={{ padding: 4 }}>{m.agreement}</td>
                                        <td style={{ padding: 4 }}>{m.sampleReliability}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'feedback' && (
                <div style={card}>
                    <strong>Feedback inbox</strong>
                    <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Module</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Type</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Ground truth</th>
                                    <th style={{ textAlign: 'left', padding: 4 }}>Freshness</th>
                                    <th style={{ textAlign: 'left', padding: 4 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {feedback.map((f) => (
                                    <tr key={f.id}>
                                        <td style={{ padding: 4 }}>{f.sourceModule}</td>
                                        <td style={{ padding: 4 }}>{f.feedbackType}</td>
                                        <td style={{ padding: 4 }}>{f.status}</td>
                                        <td style={{ padding: 4 }}>{f.groundTruthCategory}</td>
                                        <td style={{ padding: 4 }}>
                                            {f.sourceFreshnessAtFeedback === 'OUTDATED' || f.status === 'SOURCE_VERSION_CHANGED'
                                                ? <span style={{ color: '#b45309' }}>Outdated</span>
                                                : <span style={{ color: '#15803d' }}>Current</span>}
                                        </td>
                                        <td style={{ padding: 4 }}>
                                            <button type="button" style={btn} onClick={() => setSelected(f)}>Detail</button>
                                            {canReview && (
                                                <button
                                                    type="button"
                                                    style={btn}
                                                    onClick={async () => {
                                                        await dataExtractorApi.reviewLearningFeedback(f.id, { decision: 'INCLUDED_IN_ANALYSIS' });
                                                        loadFeedback();
                                                    }}
                                                >
                                                    Include
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {selected && (
                        <div style={{ ...card, marginTop: 8, background: '#f8fafc' }}>
                            <strong>Feedback detail</strong>
                            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(selected, null, 2)}</pre>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{selected.note}</p>
                        </div>
                    )}
                </div>
            )}

            {tab === 'submit' && (
                <div style={card}>
                    <strong>Submit feedback</strong>
                    {!canSubmit && <p style={{ color: '#b91c1c', fontSize: 13 }}>Missing submit_feedback permission.</p>}
                    <div style={{ display: 'grid', gap: 8, marginTop: 8, maxWidth: 520 }}>
                        <select style={field} value={form.sourceModule} onChange={(e) => setForm({ ...form, sourceModule: e.target.value })}>
                            {['industry_classification', 'product_recommendation', 'lead_scoring', 'contact_intelligence', 'sales_assistant', 'knowledge_graph', 'lead_relevance', 'crm_enrichment', 'sales_workflow', 'marketing_audience'].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <input style={field} placeholder="Source record ID" value={form.sourceRecordId} onChange={(e) => setForm({ ...form, sourceRecordId: e.target.value })} />
                        <select style={field} value={form.feedbackType} onChange={(e) => setForm({ ...form, feedbackType: e.target.value })}>
                            {['ACCEPT', 'REJECT', 'CORRECT', 'INCORRECT', 'HELPFUL', 'NOT_HELPFUL', 'RELEVANT', 'NOT_RELEVANT', 'TOO_HIGH', 'TOO_LOW', 'WRONG_PRODUCT', 'WRONG_SCORE', 'CONFIRM_RELATIONSHIP', 'REJECT_RELATIONSHIP', 'MISSING_DATA', 'PRIVACY_CONCERN', 'OTHER'].map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <textarea style={field} rows={3} placeholder="Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
                        <button type="button" style={btnPrimary} disabled={!canSubmit || busy === 'submit'} onClick={submitFeedback}>
                            Submit feedback (does not modify source)
                        </button>
                    </div>
                </div>
            )}

            {tab === 'queue' && (
                <div style={card}>
                    <strong>Human review queue / conflicts</strong>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                        {(queue || []).map((q) => (
                            <div key={q._id} style={{ ...card, marginBottom: 6 }}>
                                <div>{q.module} · {q.status} · priority {q.priority} · disagreements {q.disagreementCount}</div>
                                <div style={{ color: '#64748b' }}>conflictGroup: {q.conflictGroup || '—'}</div>
                            </div>
                        ))}
                        {!queue?.length && <div>No open review queue items.</div>}
                    </div>
                </div>
            )}

            {tab === 'proposals' && (
                <div>
                    <div style={{ marginBottom: 8 }}>
                        {canPropose && (
                            <button type="button" style={btnPrimary} disabled={busy === 'propose'} onClick={generateProposals}>
                                Generate draft proposals
                            </button>
                        )}
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                            Proposals stay executable:false / approvedForImplementation:false
                        </span>
                    </div>
                    {(proposals || []).map((p) => (
                        <div key={p.id || p._id} style={card}>
                            <div style={{ fontWeight: 600 }}>{p.title}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {p.proposalType} · {p.sourceModule} · sample {p.sampleSize} · {p.reviewerAgreement} · GT {p.groundTruthCategory}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 6 }}>{p.problemStatement}</div>
                            <div style={{ fontSize: 12, marginTop: 6 }}>
                                Risk: {p.riskLevel} · executable: {String(p.executable)} · approvedForImplementation: {String(p.approvedForImplementation)}
                            </div>
                            <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                                Limitations: {(p.limitations || []).join(' · ')}
                            </div>
                            <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, overflow: 'auto' }}>
                                {JSON.stringify({ current: p.currentConfigurationReference, proposed: p.proposedConfiguration }, null, 2)}
                            </pre>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'datasets' && (
                <div>
                    {canDataset && (
                        <button type="button" style={btnPrimary} disabled={busy === 'dataset'} onClick={prepareDataset}>
                            Prepare redacted offline dataset
                        </button>
                    )}
                    <p style={{ fontSize: 12, color: '#64748b' }}>Metadata in MongoDB; JSONL on local export storage. No AI provider / no training.</p>
                    {(datasets || []).map((d) => (
                        <div key={d.id} style={card}>
                            <div style={{ fontWeight: 600 }}>{d.name}</div>
                            <div style={{ fontSize: 12 }}>{d.module} · rows {d.rowCount} · {d.redactionLevel} · {d.status}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>checksum {d.checksum?.slice(0, 16)}…</div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'audit' && (
                <div style={card}>
                    <strong>Append-only audit</strong>
                    <div style={{ maxHeight: 400, overflow: 'auto', fontSize: 12, marginTop: 8 }}>
                        {(audit || []).map((a) => (
                            <div key={a._id} style={{ borderBottom: '1px solid #f1f5f9', padding: '6px 0' }}>
                                {a.action} · {a.entityType} · {a.createdAt}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'settings' && (
                <div style={card}>
                    <strong>Learning settings</strong>
                    {!canSettings && <p style={{ fontSize: 12, color: '#b91c1c' }}>View-only; manage/settings permission required to save.</p>}
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(settings, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
