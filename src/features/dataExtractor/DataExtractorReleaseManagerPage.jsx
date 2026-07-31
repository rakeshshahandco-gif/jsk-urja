import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#4338ca', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorReleaseManagerPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.release_manager.view')
        || can(hasPermission, 'data_extractor.release_manager.create');
    const canCreate = can(hasPermission, 'data_extractor.release_manager.create');
    const canValidate = can(hasPermission, 'data_extractor.release_manager.validate');
    const canSimulate = can(hasPermission, 'data_extractor.release_manager.simulate');
    const canFinalize = can(hasPermission, 'data_extractor.release_manager.manage');
    const canAudit = can(hasPermission, 'data_extractor.release_manager.audit');

    const [tab, setTab] = useState('dashboard');
    const [releases, setReleases] = useState([]);
    const [envs, setEnvs] = useState([]);
    const [selected, setSelected] = useState(null);
    const [report, setReport] = useState(null);
    const [audit, setAudit] = useState([]);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        releaseNumber: '',
        releaseName: '',
        sourceEnvironment: 'LOCALHOST',
        targetEnvironment: 'TESTING',
        releaseType: 'DATA_EXTRACTOR_RELEASE',
    });

    const load = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listReleasePackages();
            setReleases(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load releases');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'dashboard' || tab === 'wizard') load();
        if (tab === 'environments') {
            dataExtractorApi.listReleaseEnvironments().then((d) => setEnvs(d?.items || [])).catch(() => {});
        }
        if (tab === 'audit' && canAudit) {
            dataExtractorApi.getReleaseAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canAudit, load]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            setReport(data);
            toast.success(label + ' OK');
            await load();
            return data;
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || label + ' failed');
            return null;
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view the Release Manager.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1100 }}>
            <div style={{ ...card, background: '#eef2ff' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Release Management Center</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>
                    Phase 23 prepares deployment <strong>plans only</strong>. executable=false.
                    No Deploy / Activate / Push / Restart / Migration execution in this phase.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.SANDBOX_EVALUATION}>Sandbox Evaluation</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.CONFIGURATION_MANAGER}>Configuration Manager</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['dashboard', 'wizard', 'environments', 'detail', 'audit'].map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'dashboard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Release Packages</h3>
                    <button type="button" style={btn} onClick={load}>Refresh</button>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 10 }}>
                        <thead>
                            <tr>
                                <th align="left">Number</th>
                                <th align="left">Target</th>
                                <th align="left">Status</th>
                                <th align="left">Readiness</th>
                                <th align="left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {releases.map((r) => (
                                <tr key={r._id || r.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td>{r.releaseNumber}</td>
                                    <td>{r.targetEnvironment}</td>
                                    <td>{r.status}</td>
                                    <td>{r.readinessStatus}</td>
                                    <td>
                                        <button type="button" style={btn} onClick={() => { setSelected(r); setTab('detail'); }}>Open</button>
                                        {canValidate && ['DRAFT', 'NEEDS_CHANGES', 'VALIDATION_FAILED'].includes(r.status) && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => run('Validate Plan', () => dataExtractorApi.validateReleasePackage(r._id || r.id))}>Validate Plan</button>
                                        )}
                                        {canSimulate && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => run('Run Simulation', () => dataExtractorApi.simulateReleasePackage(r._id || r.id))}>Run Simulation</button>
                                        )}
                                        {canFinalize && r.status === 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN' && (
                                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Finalize Package', () => dataExtractorApi.finalizeReleasePackage(r._id || r.id))}>Finalize Release Package</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#b91c1c' }}>
                        No Deploy / Deploy Now / Activate / Promote to Production / Push / Commit / Restart / Run Migration / Backup Now / Restore Now / Rollback Now / Enable Live / Execute.
                    </div>
                </div>
            )}

            {tab === 'wizard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>New Release Wizard</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <input style={field} placeholder="Release number (REL-...)" value={form.releaseNumber} onChange={(e) => setForm({ ...form, releaseNumber: e.target.value })} />
                        <input style={field} placeholder="Release name" value={form.releaseName} onChange={(e) => setForm({ ...form, releaseName: e.target.value })} />
                        <select style={field} value={form.sourceEnvironment} onChange={(e) => setForm({ ...form, sourceEnvironment: e.target.value })}>
                            {['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING'].map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <select style={field} value={form.targetEnvironment} onChange={(e) => setForm({ ...form, targetEnvironment: e.target.value })}>
                            {['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION'].map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <select style={field} value={form.releaseType} onChange={(e) => setForm({ ...form, releaseType: e.target.value })}>
                            {['DATA_EXTRACTOR_RELEASE', 'AI_INTELLIGENCE_RELEASE', 'CONFIGURATION_RELEASE', 'FEATURE_RELEASE', 'BUG_FIX', 'HOTFIX_PLAN'].map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                        {canCreate && (
                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Create release', () => dataExtractorApi.createReleasePackage({
                                releaseNumber: form.releaseNumber || undefined,
                                releaseName: form.releaseName || 'Phase 23 Release Plan',
                                sourceEnvironment: form.sourceEnvironment,
                                targetEnvironment: form.targetEnvironment,
                                releaseType: form.releaseType,
                            }))}>Create Draft Release</button>
                        )}
                    </div>
                </div>
            )}

            {tab === 'environments' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Environment Manager</h3>
                    <ul style={{ fontSize: 12 }}>
                        {envs.map((e) => (
                            <li key={e._id || e.id}>{e.environmentCode} · {e.environmentName} · protected={String(!!e.protectedEnvironment)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {tab === 'detail' && selected && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Release Detail</h3>
                    <div style={{ fontSize: 12 }}>
                        {selected.releaseNumber} · {selected.status} · readiness={selected.readinessStatus}
                        · executable={String(selected.executable === true)}
                        · deploymentExecuted={String(selected.deploymentExecuted === true)}
                        · productionActivated={String(selected.productionActivated === true)}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" style={btn} onClick={() => run('Export Deployment Instructions', () => dataExtractorApi.exportReleasePackage(selected._id || selected.id))}>Export Deployment Instructions</button>
                    </div>
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

            {report && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Last Report</h3>
                    <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 320 }}>{JSON.stringify(report, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
