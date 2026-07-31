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
    'Overview', 'Programs', 'Release Board', 'Production Control', 'Environments', 'Calendar', 'Maintenance',
    'Changes', 'Emergency Changes', 'Checklists', 'Monitoring', 'Incidents', 'Problems', 'Risks', 'Exceptions',
    'Rollback', 'Backup/Restore/DR', 'Phase 27 Recommendation', 'Saved Views', 'Audit', 'Settings',
];

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorEnterpriseOperationsPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.operations.view') || can(hasPermission, 'data_extractor.operations.create');
    const canCreate = can(hasPermission, 'data_extractor.operations.create');
    const canAudit = can(hasPermission, 'data_extractor.operations.audit');
    const [tab, setTab] = useState('Overview');
    const [programs, setPrograms] = useState([]);
    const [health, setHealth] = useState(null);
    const [audit, setAudit] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        programCode: '',
        programName: '',
        releasePackageId: '',
        readinessCertificationId: '',
        pilotProgramId: '',
        proposedEnvironment: 'PRODUCTION_PLANNING_ONLY',
    });

    const load = useCallback(async () => {
        try {
            const [p, h] = await Promise.all([
                dataExtractorApi.listOperationsPrograms(),
                dataExtractorApi.getOperationsHealthDashboard(),
            ]);
            setPrograms(p?.items || []);
            setHealth(h);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load operations center');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (['Overview', 'Programs'].includes(tab)) load();
        if (tab === 'Audit' && canAudit) {
            dataExtractorApi.getOperationsAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
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
        return <div style={card}>You do not have permission to view Enterprise Operations Center.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1200 }}>
            <div style={{ ...card, background: '#ecfdf5' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Enterprise Operations, Release Governance and Production Control Center</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>
                    Phase 26 is non-deploying operational governance.
                    simulationOnly=true · productionExecutionAllowed=false · deploymentExecuted=false · productionActivated=false · rollback/backup/restore/migrationExecuted=false.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    No Deploy / Go Live / Activate Production / Execute Rollback / Backup Now / Restore Now / Migration / Render / Git.
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.PILOT_ROLLOUT}>Pilot & UAT Center</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.READINESS_CERTIFICATION}>Readiness Certification</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {TABS.map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'Overview' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Operations Health</h3>
                    {!health && <p style={{ fontSize: 13 }}>Loading…</p>}
                    {health && (
                        <>
                            <div style={{ fontSize: 13 }}>Programs: {(health.programSummary || []).length}</div>
                            <div style={{ fontSize: 13 }}>Open critical risks: {health.riskSummary?.openCritical ?? 0} · SEV1: {health.incidentSummary?.sev1 ?? 0}</div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Allowed: {(health.actions || []).join(' · ')}</div>
                        </>
                    )}
                </div>
            )}

            {tab === 'Programs' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Operations Programs</h3>
                    {canCreate && (
                        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                            {['programCode', 'programName', 'releasePackageId', 'readinessCertificationId', 'pilotProgramId'].map((k) => (
                                <input key={k} style={{ padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} placeholder={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                            ))}
                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Record plan', () => dataExtractorApi.createOperationsProgram(form))}>
                                Record plan
                            </button>
                        </div>
                    )}
                    {(programs || []).map((p) => (
                        <div key={p.id || p._id} style={{ ...card, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{p.programCode} — {p.programName}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {p.status} · {p.proposedEnvironment} · simulationOnly={String(p.simulationOnly !== false)} · productionActivated={String(p.productionActivated === true)}
                            </div>
                            <button type="button" style={{ ...btn, marginTop: 6 }} onClick={async () => setSelected(await dataExtractorApi.getOperationsProgram(p.id || p._id))}>Open</button>
                            <button type="button" style={{ ...btn, marginTop: 6, marginLeft: 6 }} onClick={() => run('Submit for review', () => dataExtractorApi.transitionOperationsLifecycle(p.id || p._id, { status: 'PENDING_REVIEW' }))}>Submit for review</button>
                            <button type="button" style={{ ...btn, marginTop: 6, marginLeft: 6 }} onClick={() => run('Recommend Phase 27 review', () => dataExtractorApi.getPhase27Recommendation(p.id || p._id))}>Recommend Phase 27 review</button>
                        </div>
                    ))}
                    {selected && <pre style={{ fontSize: 11, overflow: 'auto', background: '#f8fafc', padding: 8 }}>{JSON.stringify(selected, null, 2)}</pre>}
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

            {!['Overview', 'Programs', 'Audit'].includes(tab) && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>{tab}</h3>
                    <p style={{ fontSize: 13, color: '#475569' }}>
                        Planning-only workflows for {tab}. Use Record plan / Submit for review / Approve as plan / Run local validation / Simulate decision / Recommend Phase 27 review.
                        This screen never offers Deploy / Go Live / Activate Production / Execute Rollback / Backup / Restore / Migration.
                    </p>
                </div>
            )}
        </div>
    );
}