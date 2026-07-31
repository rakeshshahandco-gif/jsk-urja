import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#0f766e', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorSandboxEvaluationPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.sandbox_evaluation.view')
        || can(hasPermission, 'data_extractor.sandbox_evaluation.create');
    const canCreate = can(hasPermission, 'data_extractor.sandbox_evaluation.create');
    const canValidate = can(hasPermission, 'data_extractor.sandbox_evaluation.validate');
    const canRun = can(hasPermission, 'data_extractor.sandbox_evaluation.run');
    const canCancel = can(hasPermission, 'data_extractor.sandbox_evaluation.cancel');
    const canCompare = can(hasPermission, 'data_extractor.sandbox_evaluation.compare');
    const canAudit = can(hasPermission, 'data_extractor.sandbox_evaluation.audit');

    const [tab, setTab] = useState('dashboard');
    const [runs, setRuns] = useState([]);
    const [selected, setSelected] = useState(null);
    const [compare, setCompare] = useState(null);
    const [audit, setAudit] = useState([]);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        familyId: '',
        baselineVersionId: '',
        candidateVersionId: '',
        datasetId: '',
        evaluationMode: 'HISTORICAL_SIMULATION',
    });

    const loadRuns = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listSandboxRuns();
            setRuns(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load runs');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'dashboard' || tab === 'wizard') loadRuns();
        if (tab === 'audit' && canAudit) {
            dataExtractorApi.getSandboxAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canAudit, loadRuns]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            toast.success(label + ' OK');
            await loadRuns();
            return data;
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || label + ' failed');
            return null;
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view Sandbox Evaluation.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1100 }}>
            <div style={{ ...card, background: '#f0fdfa' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Sandbox Evaluation</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>
                    Phase 22 compares baseline vs candidate configuration versions in memory.
                    Results are advisory only. Gate PASS does <strong>not</strong> activate production.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.CONFIGURATION_MANAGER}>Configuration Manager</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['dashboard', 'wizard', 'compare', 'audit'].map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'dashboard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Evaluation Runs</h3>
                    <button type="button" style={btn} onClick={loadRuns}>Refresh</button>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 10 }}>
                        <thead>
                            <tr>
                                <th align="left">Mode</th>
                                <th align="left">Status</th>
                                <th align="left">Gate</th>
                                <th align="left">Recommendation</th>
                                <th align="left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((r) => (
                                <tr key={r._id || r.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td>{r.evaluationMode}</td>
                                    <td>{r.status}</td>
                                    <td>{r.gateResult}</td>
                                    <td>{r.recommendationCode}</td>
                                    <td>
                                        <button type="button" style={btn} onClick={() => { setSelected(r); setTab('compare'); }}>Open</button>
                                        {canValidate && r.status === 'DRAFT' && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => run('Validate', () => dataExtractorApi.validateSandboxRun(r._id || r.id))}>Validate</button>
                                        )}
                                        {canRun && r.status === 'READY' && (
                                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Start', () => dataExtractorApi.startSandboxRun(r._id || r.id))}>Start</button>
                                        )}
                                        {canCancel && ['DRAFT', 'READY', 'RUNNING'].includes(r.status) && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => run('Cancel', () => dataExtractorApi.cancelSandboxRun(r._id || r.id))}>Cancel</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#b91c1c' }}>
                        No Activate / Apply / Deploy / Promote / Update Live Data / Recalculate Live / Train / Send actions.
                    </div>
                </div>
            )}

            {tab === 'wizard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>New Evaluation Wizard</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <input style={field} placeholder="Family ID" value={form.familyId} onChange={(e) => setForm({ ...form, familyId: e.target.value })} />
                        <input style={field} placeholder="Baseline Version ID" value={form.baselineVersionId} onChange={(e) => setForm({ ...form, baselineVersionId: e.target.value })} />
                        <input style={field} placeholder="Candidate Version ID (READY_FOR_SANDBOX)" value={form.candidateVersionId} onChange={(e) => setForm({ ...form, candidateVersionId: e.target.value })} />
                        <input style={field} placeholder="Dataset ID (optional — synthetic used if empty)" value={form.datasetId} onChange={(e) => setForm({ ...form, datasetId: e.target.value })} />
                        <select style={field} value={form.evaluationMode} onChange={(e) => setForm({ ...form, evaluationMode: e.target.value })}>
                            {['DRY_RUN', 'HISTORICAL_SIMULATION', 'FIXTURE_COMPARISON', 'FEEDBACK_ALIGNMENT', 'OUTCOME_ALIGNMENT', 'PERFORMANCE_BENCHMARK', 'SECURITY_VALIDATION', 'TENANT_ISOLATION_VALIDATION', 'AGGREGATE_ONLY_VALIDATION'].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        {canCreate && (
                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Create run', async () => {
                                const body = {
                                    familyId: form.familyId,
                                    baselineVersionId: form.baselineVersionId,
                                    candidateVersionId: form.candidateVersionId,
                                    evaluationMode: form.evaluationMode,
                                };
                                if (form.datasetId) body.datasetId = form.datasetId;
                                return dataExtractorApi.createSandboxRun(body);
                            })}>Create Draft Run</button>
                        )}
                    </div>
                </div>
            )}

            {tab === 'compare' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>A/B Comparison</h3>
                    {selected ? (
                        <>
                            <div style={{ fontSize: 12, marginBottom: 8 }}>
                                Run {selected._id || selected.id} · {selected.status} · gate={selected.gateResult}
                                · runtimeActivation={String(selected.runtimeActivation === true)}
                            </div>
                            {canCompare && (
                                <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Compare', async () => {
                                    const data = await dataExtractorApi.getSandboxCompare(selected._id || selected.id);
                                    setCompare(data);
                                    return data;
                                })}>Load A/B Compare</button>
                            )}
                            {compare && (
                                <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 420 }}>{JSON.stringify(compare, null, 2)}</pre>
                            )}
                        </>
                    ) : (
                        <p style={{ fontSize: 13 }}>Select a run from the dashboard.</p>
                    )}
                </div>
            )}

            {tab === 'audit' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Audit (append-only)</h3>
                    <ul style={{ fontSize: 12, paddingLeft: 16 }}>
                        {audit.map((a) => (
                            <li key={a._id}>{a.action} · {a.entityType} · {new Date(a.createdAt).toLocaleString()}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
