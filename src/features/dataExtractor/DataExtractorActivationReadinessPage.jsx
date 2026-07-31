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
    'Overview', 'Readiness Programs', 'Release Lineage', 'Package Integrity', 'Phase Dependencies', 'Final Gates',
    'Defect Gate', 'Risk Gate', 'Approvals', 'Environment Review', 'Maintenance Review', 'Monitoring Review',
    'Incident Readiness', 'Escalation Readiness', 'Backup Review', 'Restore Review', 'Rollback Review',
    'DR Review', 'Business Continuity', 'Communication', 'Customer Impact', 'Hypercare', 'Smoke Test Plan',
    'Manual Deployment Checklist', 'Handover Package', 'Final Review Board', 'Recommendation',
    'Blockers', 'Exceptions', 'Saved Views', 'Audit', 'Settings',
];

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorActivationReadinessPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.activation_readiness.view')
        || can(hasPermission, 'data_extractor.activation_readiness.create');
    const canCreate = can(hasPermission, 'data_extractor.activation_readiness.create');
    const canAudit = can(hasPermission, 'data_extractor.activation_readiness.audit');
    const [tab, setTab] = useState('Overview');
    const [programs, setPrograms] = useState([]);
    const [audit, setAudit] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        programCode: '',
        programName: '',
        releasePackageId: '',
        readinessCertificationId: '',
        pilotProgramId: '',
        operationsProgramId: '',
        proposedEnvironment: 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY',
    });

    const load = useCallback(async () => {
        try {
            const p = await dataExtractorApi.listActivationReadinessPrograms();
            setPrograms(p?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load activation readiness');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (['Overview', 'Readiness Programs', 'Recommendation'].includes(tab)) load();
        if (tab === 'Audit' && canAudit) {
            dataExtractorApi.getActivationReadinessAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canAudit, load]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            toast.success(`${label} OK`);
            await load();
            if (data?.id) setSelected(data);
            return data;
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || `${label} failed`);
            return null;
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view Production Activation Readiness.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1200 }}>
            <div style={{ ...card, background: '#fef3c7', borderColor: '#f59e0b' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Production Activation Readiness Orchestrator</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#78350f', fontWeight: 600 }}>
                    Planning and readiness only. Deployment and production activation are not available in this module.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#334155' }}>
                    simulationOnly=true · manualDeploymentOnly=true · productionExecutionAllowed=false ·
                    deploymentExecuted/productionActivated/render/git/rollback/backup/restore/migrationExecuted=false.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    No Deploy / Go Live / Activate Production / Push to Render / Commit / Push / Execute Rollback / Run Backup / Restore / Migration.
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.ENTERPRISE_OPERATIONS}>Enterprise Operations</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.PILOT_ROLLOUT}>Pilot & UAT Center</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {TABS.map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'Overview' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Readiness Overview</h3>
                    <p style={{ fontSize: 13 }}>Programs: {programs.length}</p>
                    <p style={{ fontSize: 12, color: '#64748b' }}>
                        READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT is a recommendation only. Separate human authorization outside Cursor is required.
                    </p>
                    {selected && (
                        <div style={{ fontSize: 12, marginTop: 8 }}>
                            Selected: {selected.programCode} · {selected.status} · {selected.recommendation}
                        </div>
                    )}
                </div>
            )}

            {tab === 'Readiness Programs' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Activation Readiness Programs</h3>
                    {canCreate && (
                        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                            {['programCode', 'programName', 'releasePackageId', 'readinessCertificationId', 'pilotProgramId', 'operationsProgramId'].map((k) => (
                                <input
                                    key={k}
                                    placeholder={k}
                                    value={form[k]}
                                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                                    style={{ padding: 6, border: '1px solid #cbd5e1', borderRadius: 6 }}
                                />
                            ))}
                            <button
                                type="button"
                                style={btnPrimary}
                                disabled={!!busy}
                                onClick={() => run('Create', () => dataExtractorApi.createActivationReadinessProgram(form))}
                            >
                                Create readiness program
                            </button>
                        </div>
                    )}
                    {(programs || []).map((p) => (
                        <div key={p.id || p._id} style={{ ...card, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{p.programName} ({p.programCode})</div>
                            <div style={{ fontSize: 12 }}>{p.status} · rec: {p.recommendation}</div>
                            <button type="button" style={btn} onClick={() => setSelected(p)}>Select</button>
                            <button
                                type="button"
                                style={btn}
                                onClick={() => run('Validate lineage', () => dataExtractorApi.validateActivationLineage(p.id || p._id))}
                            >
                                Validate lineage
                            </button>
                            <button
                                type="button"
                                style={btn}
                                onClick={() => run('Recommend review', () => dataExtractorApi.getActivationReadinessRecommendation(p.id || p._id))}
                            >
                                View recommendation
                            </button>
                        </div>
                    ))}
                    {!programs.length && <p style={{ fontSize: 13 }}>No readiness programs yet.</p>}
                </div>
            )}

            {['Release Lineage', 'Package Integrity', 'Phase Dependencies', 'Final Gates', 'Defect Gate', 'Risk Gate',
                'Approvals', 'Environment Review', 'Maintenance Review', 'Monitoring Review', 'Incident Readiness',
                'Escalation Readiness', 'Backup Review', 'Restore Review', 'Rollback Review', 'DR Review',
                'Business Continuity', 'Communication', 'Customer Impact', 'Hypercare', 'Smoke Test Plan',
                'Manual Deployment Checklist', 'Handover Package', 'Final Review Board', 'Recommendation',
                'Blockers', 'Exceptions', 'Settings'].includes(tab) && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>{tab}</h3>
                    <p style={{ fontSize: 13 }}>
                        Record reviews and validations via API. Planning metadata only — no production execution.
                    </p>
                    {selected ? (
                        <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 360, background: '#f8fafc', padding: 8 }}>
                            {JSON.stringify(selected, null, 2)}
                        </pre>
                    ) : (
                        <p style={{ fontSize: 13 }}>Select a readiness program first.</p>
                    )}
                </div>
            )}

            {tab === 'Saved Views' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Saved Views</h3>
                    <p style={{ fontSize: 13 }}>User and company scoped readiness views.</p>
                </div>
            )}

            {tab === 'Audit' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Audit (append-only)</h3>
                    {(audit || []).slice(0, 50).map((a) => (
                        <div key={a.id || a._id} style={{ fontSize: 12, borderBottom: '1px solid #e2e8f0', padding: '4px 0' }}>
                            {a.action} · {a.entityType} · {a.createdAt}
                        </div>
                    ))}
                    {!audit.length && <p style={{ fontSize: 13 }}>No audit entries.</p>}
                </div>
            )}
        </div>
    );
}