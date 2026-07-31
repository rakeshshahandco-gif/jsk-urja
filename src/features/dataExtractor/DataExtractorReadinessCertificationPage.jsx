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

export default function DataExtractorReadinessCertificationPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.readiness_certification.view')
        || can(hasPermission, 'data_extractor.readiness_certification.create');
    const canCreate = can(hasPermission, 'data_extractor.readiness_certification.create');
    const canChecks = can(hasPermission, 'data_extractor.readiness_certification.run_local_checks');
    const canFinal = can(hasPermission, 'data_extractor.readiness_certification.final_review');
    const canAudit = can(hasPermission, 'data_extractor.readiness_certification.audit');

    const [tab, setTab] = useState('dashboard');
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [findings, setFindings] = useState([]);
    const [report, setReport] = useState(null);
    const [audit, setAudit] = useState([]);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({
        certificationNumber: '',
        certificationName: '',
        releasePackageId: '',
        targetEnvironment: 'STAGING',
    });

    const load = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listReadinessCertifications();
            setItems(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load certifications');
        }
    }, []);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'dashboard' || tab === 'wizard') load();
        if (tab === 'audit' && canAudit) {
            dataExtractorApi.getReadinessAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canAudit, load]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            setReport(data);
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
        return <div style={card}>You do not have permission to view Readiness Certification.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1100 }}>
            <div style={{ ...card, background: '#ecfdf5' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Production Readiness Certification Center</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155' }}>
                    Phase 24 certifies eligibility for <strong>staging / controlled pilot review</strong> only.
                    executable=false · deploymentAuthorized=false · productionApproved=false.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    No Deploy / Activate / Promote / Production Ready / Backup Now / Restore Now / Rollback Now / Scan Production.
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.RELEASE_MANAGER}>Release Manager</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['dashboard', 'wizard', 'detail', 'findings', 'audit'].map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'dashboard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Certification Projects</h3>
                    {(items || []).length === 0 && <p style={{ fontSize: 13 }}>No certifications yet.</p>}
                    {(items || []).map((c) => (
                        <div key={c.id || c._id} style={{ ...card, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{c.certificationNumber} — {c.certificationName}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {c.status} · {c.overallReadiness}
                                {' · '}
                                executable={String(c.executable === true)}
                                {' · '}
                                deploymentAuthorized={String(c.deploymentAuthorized === true)}
                            </div>
                            <button
                                type="button"
                                style={{ ...btn, marginTop: 6 }}
                                onClick={async () => {
                                    const id = c.id || c._id;
                                    const full = await dataExtractorApi.getReadinessCertification(id);
                                    setSelected(full);
                                    const f = await dataExtractorApi.listReadinessFindings(id);
                                    setFindings(f?.items || []);
                                    setTab('detail');
                                }}
                            >
                                Open
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'wizard' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>New Certification Wizard</h3>
                    <label style={{ fontSize: 12 }}>Certification number</label>
                    <input style={field} value={form.certificationNumber} onChange={(e) => setForm({ ...form, certificationNumber: e.target.value })} />
                    <label style={{ fontSize: 12 }}>Name</label>
                    <input style={field} value={form.certificationName} onChange={(e) => setForm({ ...form, certificationName: e.target.value })} />
                    <label style={{ fontSize: 12 }}>Phase 23 Release Package ID</label>
                    <input style={field} value={form.releasePackageId} onChange={(e) => setForm({ ...form, releasePackageId: e.target.value })} />
                    <label style={{ fontSize: 12 }}>Target environment</label>
                    <select style={field} value={form.targetEnvironment} onChange={(e) => setForm({ ...form, targetEnvironment: e.target.value })}>
                        <option value="STAGING">STAGING</option>
                        <option value="TESTING">TESTING</option>
                        <option value="PRODUCTION">PRODUCTION (plan review only)</option>
                    </select>
                    {canCreate && (
                        <button
                            type="button"
                            style={{ ...btnPrimary, marginTop: 10 }}
                            disabled={!!busy}
                            onClick={() => run('Create certification', () => dataExtractorApi.createReadinessCertification(form))}
                        >
                            Create Certification
                        </button>
                    )}
                </div>
            )}

            {tab === 'detail' && selected && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>{selected.certificationNumber}</h3>
                    <p style={{ fontSize: 13 }}>
                        Status: {selected.status} · Readiness: {selected.overallReadiness}
                        <br />
                        Recommendation: {selected.certificationRecommendation}
                        <br />
                        executable={String(selected.executable === true)}
                        {' · '}
                        deploymentAuthorized={String(selected.deploymentAuthorized === true)}
                        {' · '}
                        productionApproved={String(selected.productionApproved === true)}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {canChecks && (
                            <>
                                <button type="button" style={btn} disabled={!!busy} onClick={() => run('Validate Release Package', () => dataExtractorApi.validateReadinessRelease(selected.id || selected._id))}>
                                    Validate Release Package
                                </button>
                                <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Run Local Readiness Checks', () => dataExtractorApi.runReadinessLocalChecks(selected.id || selected._id))}>
                                    Run Local Readiness Checks
                                </button>
                            </>
                        )}
                        {canFinal && (
                            <button
                                type="button"
                                style={btn}
                                disabled={!!busy}
                                onClick={() => run('Complete Final Review', () => dataExtractorApi.finalReadinessReview(selected.id || selected._id, { decision: 'PASS' }))}
                            >
                                Complete Final Review
                            </button>
                        )}
                        <button type="button" style={btn} disabled={!!busy} onClick={() => run('Export Certification Report', () => dataExtractorApi.exportReadinessCertification(selected.id || selected._id))}>
                            Export Certification Report
                        </button>
                    </div>
                    {report && (
                        <pre style={{ marginTop: 12, fontSize: 11, background: '#f8fafc', padding: 10, overflow: 'auto', maxHeight: 280 }}>
                            {JSON.stringify(report, null, 2)}
                        </pre>
                    )}
                </div>
            )}

            {tab === 'findings' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Findings Register</h3>
                    {(findings || []).length === 0 && <p style={{ fontSize: 13 }}>Open a certification detail first, or no findings yet.</p>}
                    {(findings || []).map((f) => (
                        <div key={f._id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                            <strong>{f.severity}</strong> · {f.status} · {f.title}
                        </div>
                    ))}
                </div>
            )}

            {tab === 'audit' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Audit</h3>
                    {(audit || []).slice(0, 50).map((a) => (
                        <div key={a._id} style={{ fontSize: 12, padding: '4px 0' }}>{a.action} · {a.entityType} · {a.createdAt}</div>
                    ))}
                </div>
            )}
        </div>
    );
}
