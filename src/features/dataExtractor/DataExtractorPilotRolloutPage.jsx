import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#0f766e', color: '#fff', border: 'none' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

const TABS = [
    'Overview', 'Programs', 'Staging', 'Companies', 'Industries', 'Cohorts', 'Module Plans', 'Feature Flags',
    'UAT Plans', 'Test Cases', 'Cycles', 'Executions', 'Defects', 'Feedback', 'Monitoring', 'Risks',
    'Exceptions', 'Pause/Suspension', 'Rollback', 'Criteria', 'Closure', 'Recommendation', 'Saved Views', 'Audit', 'Settings',
];

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorPilotRolloutPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.pilot.view') || can(hasPermission, 'data_extractor.pilot.create');
    const canCreate = can(hasPermission, 'data_extractor.pilot.create');
    const canAudit = can(hasPermission, 'data_extractor.pilot.audit');
    const [tab, setTab] = useState('Overview');
    const [programs, setPrograms] = useState([]);
    const [health, setHealth] = useState(null);
    const [audit, setAudit] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        pilotCode: '',
        pilotName: '',
        releasePackageId: '',
        readinessCertificationId: '',
        environmentType: 'STAGING_SIMULATION',
    });

    const load = useCallback(async () => {
        try {
            const [p, h] = await Promise.all([
                dataExtractorApi.listPilotPrograms(),
                dataExtractorApi.getPilotHealthDashboard(),
            ]);
            setPrograms(p?.items || []);
            setHealth(h);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load pilot center');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (['Overview', 'Programs', 'Monitoring'].includes(tab)) load();
        if (tab === 'Audit' && canAudit) {
            dataExtractorApi.getPilotAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canAudit, load]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            toast.success(`${label} OK`);
            await load();
            return data;
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || `${label} failed`);
            return null;
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view Pilot & UAT Center.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1200 }}>
            <div style={{ ...card, background: '#ecfdf5' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Controlled Staging, Pilot Rollout and UAT Center</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>
                    Phase 25 is a non-deploying planning, simulation and UAT center.
                    simulationOnly=true · productionExecutionAllowed=false · deploymentExecuted=false · productionActivated=false.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    No Deploy / Activate Production / Execute Rollback / Backup / Restore / Migration / Render Push.
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.READINESS_CERTIFICATION}>Readiness Certification</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.RELEASE_MANAGER}>Release Manager</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {TABS.map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'Overview' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Pilot Health</h3>
                    {!health && <p style={{ fontSize: 13 }}>Loading…</p>}
                    {health && (
                        <>
                            <div style={{ fontSize: 13 }}>Programs: {(health.pilotSummary || []).length}</div>
                            <div style={{ fontSize: 13 }}>Open defects: {health.defectSummary?.open ?? 0} · Critical: {health.defectSummary?.critical ?? 0}</div>
                            <div style={{ fontSize: 13 }}>Feedback: {health.feedbackSummary?.total ?? 0} · Risks open: {health.riskSummary?.open ?? 0}</div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                Allowed: {(health.actions || []).join(' · ')}
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === 'Programs' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Pilot Programs</h3>
                    {canCreate && (
                        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                            {['pilotCode', 'pilotName', 'releasePackageId', 'readinessCertificationId'].map((k) => (
                                <input key={k} style={{ padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} placeholder={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                            ))}
                            <button
                                type="button"
                                style={btnPrimary}
                                disabled={!!busy}
                                onClick={() => run('Record plan', () => dataExtractorApi.createPilotProgram(form))}
                            >
                                Record plan
                            </button>
                        </div>
                    )}
                    {(programs || []).length === 0 && <p style={{ fontSize: 13 }}>No pilot programs yet.</p>}
                    {(programs || []).map((p) => (
                        <div key={p.id || p._id} style={{ ...card, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{p.pilotCode} — {p.pilotName}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {p.status} · {p.environmentType} · simulationOnly={String(p.simulationOnly !== false)} · productionActivated={String(p.productionActivated === true)}
                            </div>
                            <button type="button" style={{ ...btn, marginTop: 6 }} onClick={async () => setSelected(await dataExtractorApi.getPilotProgram(p.id || p._id))}>Open</button>
                            <button type="button" style={{ ...btn, marginTop: 6, marginLeft: 6 }} onClick={() => run('Submit for review', () => dataExtractorApi.transitionPilotLifecycle(p.id || p._id, { status: 'PENDING_REVIEW' }))}>Submit for review</button>
                        </div>
                    ))}
                    {selected && (
                        <pre style={{ fontSize: 11, overflow: 'auto', background: '#f8fafc', padding: 8 }}>{JSON.stringify(selected, null, 2)}</pre>
                    )}
                </div>
            )}

            {tab === 'Monitoring' && health && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Monitoring (local metadata only)</h3>
                    <pre style={{ fontSize: 11, overflow: 'auto' }}>{JSON.stringify(health, null, 2)}</pre>
                </div>
            )}

            {tab === 'Audit' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Audit (append-only)</h3>
                    {(audit || []).slice(0, 50).map((a) => (
                        <div key={a.id || a._id} style={{ fontSize: 12, borderBottom: '1px solid #e2e8f0', padding: '6px 0' }}>
                            {a.action} · {a.entityType} · {a.createdAt}
                        </div>
                    ))}
                </div>
            )}

            {!['Overview', 'Programs', 'Monitoring', 'Audit'].includes(tab) && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>{tab}</h3>
                    <p style={{ fontSize: 13, color: '#475569' }}>
                        Use API-backed workflows for {tab}. Actions available: Record plan, Run local validation, Simulate, Submit for review, Recommend Phase 26 review.
                        This screen never offers Deploy / Activate Production / Execute Rollback.
                    </p>
                    {selected?.id && (
                        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Run local validation', () => dataExtractorApi.getPilotRecommendation(selected.id || selected._id))}>
                            Recommend Phase 26 review (read-only check)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}