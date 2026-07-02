import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Server, RefreshCw, ExternalLink, Save, Copy, ClipboardList, HeartPulse, Wand2, GitBranch, History, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import {
    getDeploymentManagerOverview,
    getDeploymentManagerReport,
    getClientDeployChecklist,
    updateCompanyDeploymentTracking,
    applyCompanyReferenceDefaults,
    probeBackendHealth,
    getLocalGitInfo,
    addCompanyDeployRecord,
} from '@/services/deploymentManagerApi';

const inp = {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
};

const card = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
};

const btnSecondary = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    background: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
};

const copyText = async (text, label = 'Copied') => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(label);
    } catch {
        toast.error('Copy failed');
    }
};

const statusBadge = (status) => {
    const map = {
        live: { bg: '#dcfce7', color: '#166534', label: 'Live' },
        planned: { bg: '#f1f5f9', color: '#475569', label: 'Planned' },
        pending: { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
        staging: { bg: '#dbeafe', color: '#1d4ed8', label: 'Staging' },
        local: { bg: '#ede9fe', color: '#5b21b6', label: 'Local' },
    };
    const s = map[status] || { bg: '#f8fafc', color: '#64748b', label: status || '—' };
    return (
        <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            {s.label}
        </span>
    );
};

function DeployHistoryPanel({ company, clientKey, onSaved }) {
    const today = new Date().toISOString().slice(0, 10);
    const [recordForm, setRecordForm] = useState({
        commitHash: '',
        deployDate: today,
        changeScope: '',
        targetServices: '',
        notes: '',
    });
    const [gitInfo, setGitInfo] = useState(null);
    const [loadingGit, setLoadingGit] = useState(false);
    const [savingRecord, setSavingRecord] = useState(false);

    const loadGit = async () => {
        setLoadingGit(true);
        try {
            const data = await getLocalGitInfo();
            setGitInfo(data);
            if (!data.available) toast.error(data.message || 'Git not available');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to load git info');
        } finally {
            setLoadingGit(false);
        }
    };

    const useHeadCommit = () => {
        if (!gitInfo?.headCommit) return;
        setRecordForm((p) => ({
            ...p,
            commitHash: gitInfo.headCommit,
            notes: p.notes || gitInfo.headMessage || '',
        }));
        toast.success('Filled from local HEAD');
    };

    const handleAddRecord = async () => {
        setSavingRecord(true);
        try {
            await addCompanyDeployRecord(company._id, {
                ...recordForm,
                targetServices: recordForm.targetServices || (clientKey ? `${clientKey} Render service(s)` : ''),
            });
            toast.success('Deploy record added');
            setRecordForm({
                commitHash: '',
                deployDate: today,
                changeScope: '',
                targetServices: '',
                notes: '',
            });
            onSaved();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to add record');
        } finally {
            setSavingRecord(false);
        }
    };

    const history = company.deploymentHistory || [];

    return (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <History size={14} />
                Deploy History Log
            </h4>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button type="button" onClick={loadGit} disabled={loadingGit} style={btnSecondary}>
                    <GitBranch size={14} />
                    {loadingGit ? 'Loading git…' : 'Load Local Git'}
                </button>
                {gitInfo?.available && (
                    <button type="button" onClick={useHeadCommit} style={btnSecondary}>
                        Use HEAD ({gitInfo.headCommit})
                    </button>
                )}
            </div>

            {gitInfo?.available && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b' }}>
                    Branch: <strong>{gitInfo.branch}</strong> — {gitInfo.headMessage}
                </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Commit</label>
                    <input
                        list={`git-commits-${company._id}`}
                        value={recordForm.commitHash}
                        onChange={(e) => setRecordForm((p) => ({ ...p, commitHash: e.target.value }))}
                        style={{ ...inp, marginTop: 4 }}
                        placeholder="e.g. f2ac41a0"
                    />
                    {gitInfo?.recentCommits?.length > 0 && (
                        <datalist id={`git-commits-${company._id}`}>
                            {gitInfo.recentCommits.map((c) => (
                                <option key={c.hash} value={c.hash}>{c.message}</option>
                            ))}
                        </datalist>
                    )}
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Deploy Date</label>
                    <input
                        type="date"
                        value={recordForm.deployDate}
                        onChange={(e) => setRecordForm((p) => ({ ...p, deployDate: e.target.value }))}
                        style={{ ...inp, marginTop: 4 }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Change Scope</label>
                    <input
                        value={recordForm.changeScope}
                        onChange={(e) => setRecordForm((p) => ({ ...p, changeScope: e.target.value }))}
                        style={{ ...inp, marginTop: 4 }}
                        placeholder="e.g. Sales Order lock"
                    />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Target Services</label>
                    <input
                        value={recordForm.targetServices}
                        onChange={(e) => setRecordForm((p) => ({ ...p, targetServices: e.target.value }))}
                        style={{ ...inp, marginTop: 4 }}
                        placeholder="jsk-urja-backend"
                    />
                </div>
            </div>
            <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Notes</label>
                <textarea
                    value={recordForm.notes}
                    onChange={(e) => setRecordForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    style={{ ...inp, marginTop: 4, resize: 'vertical' }}
                    placeholder="Manual deploy record — does not trigger Render"
                />
            </div>
            <button
                type="button"
                onClick={handleAddRecord}
                disabled={savingRecord}
                style={{ ...btnSecondary, background: '#0f766e', color: '#fff', border: 'none', marginBottom: 12 }}
            >
                <Plus size={14} />
                {savingRecord ? 'Adding…' : 'Add Deploy Record'}
            </button>

            {history.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={{ padding: 6 }}>Date</th>
                            <th style={{ padding: 6 }}>Commit</th>
                            <th style={{ padding: 6 }}>Scope</th>
                            <th style={{ padding: 6 }}>Services</th>
                            <th style={{ padding: 6 }}>By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((row, idx) => (
                            <tr key={`${row.recordedAt}-${idx}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 6 }}>{row.deployDate || '—'}</td>
                                <td style={{ padding: 6, fontFamily: 'monospace' }}>{row.commitHash || '—'}</td>
                                <td style={{ padding: 6 }}>{row.changeScope || row.notes || '—'}</td>
                                <td style={{ padding: 6 }}>{row.targetServices || '—'}</td>
                                <td style={{ padding: 6 }}>{row.recordedByName || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>No deploy records yet.</p>
            )}
        </div>
    );
}

function TrackingEditor({ company, clientKey, onSaved }) {
    const [form, setForm] = useState({
        deploymentStatus: company.deploymentConfig?.deploymentStatus || '',
        lastLiveCommit: company.deploymentConfig?.lastLiveCommit || '',
        lastDeployDate: company.deploymentConfig?.lastDeployDate || '',
        deployNotes: company.deploymentConfig?.deployNotes || '',
        renderFrontendService: company.deploymentConfig?.renderFrontendService || '',
        renderBackendService: company.deploymentConfig?.renderBackendService || '',
        databaseName: company.deploymentConfig?.databaseName || '',
        backendUrl: company.deploymentConfig?.backendUrl || '',
        frontendUrl: company.deploymentConfig?.frontendUrl || '',
    });
    const [saving, setSaving] = useState(false);
    const [applying, setApplying] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateCompanyDeploymentTracking(company._id, form);
            toast.success(`Tracking saved for ${company.companyName}`);
            onSaved();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save tracking');
        } finally {
            setSaving(false);
        }
    };

    const handleApplyReference = async () => {
        if (!clientKey) {
            toast.error('No client group to apply');
            return;
        }
        if (!window.confirm(`Apply reference defaults from "${clientKey}" for empty fields only?`)) return;
        setApplying(true);
        try {
            const result = await applyCompanyReferenceDefaults(company._id, clientKey);
            const applied = result?.applied;
            toast.success(`Applied: ${applied?.fields?.join(', ') || 'clientCode'}`);
            onSaved();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to apply reference');
        } finally {
            setApplying(false);
        }
    };

    return (
        <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {clientKey && (
                    <button type="button" onClick={handleApplyReference} disabled={applying} style={btnSecondary}>
                        <Wand2 size={14} />
                        {applying ? 'Applying…' : 'Apply Group Reference'}
                    </button>
                )}
                <Link
                    to={`${PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION}?companyId=${company._id}`}
                    style={{ ...btnSecondary, textDecoration: 'none', color: '#1e293b' }}
                >
                    Module Allocation
                </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Deployment Status</label>
                    <select
                        value={form.deploymentStatus}
                        onChange={(e) => setForm((p) => ({ ...p, deploymentStatus: e.target.value }))}
                        style={{ ...inp, marginTop: 4 }}
                    >
                        {['', 'local', 'staging', 'live', 'pending'].map((s) => (
                            <option key={s} value={s}>{s || '—'}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Last Live Commit</label>
                    <input value={form.lastLiveCommit} onChange={(e) => setForm((p) => ({ ...p, lastLiveCommit: e.target.value }))} style={{ ...inp, marginTop: 4 }} placeholder="e.g. f2ac41a0" />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Last Deploy Date</label>
                    <input value={form.lastDeployDate} onChange={(e) => setForm((p) => ({ ...p, lastDeployDate: e.target.value }))} style={{ ...inp, marginTop: 4 }} placeholder="2026-06-27" />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Database Name</label>
                    <input value={form.databaseName} onChange={(e) => setForm((p) => ({ ...p, databaseName: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Render FE Service</label>
                    <input value={form.renderFrontendService} onChange={(e) => setForm((p) => ({ ...p, renderFrontendService: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Render BE Service</label>
                    <input value={form.renderBackendService} onChange={(e) => setForm((p) => ({ ...p, renderBackendService: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Backend URL</label>
                    <input value={form.backendUrl} onChange={(e) => setForm((p) => ({ ...p, backendUrl: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Frontend URL</label>
                    <input value={form.frontendUrl} onChange={(e) => setForm((p) => ({ ...p, frontendUrl: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                </div>
            </div>
            <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Deploy Notes</label>
                <textarea
                    value={form.deployNotes}
                    onChange={(e) => setForm((p) => ({ ...p, deployNotes: e.target.value }))}
                    rows={2}
                    style={{ ...inp, marginTop: 4, resize: 'vertical' }}
                    placeholder="Manual deploy notes only — does not trigger Render deploy"
                />
            </div>
            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save Tracking'}
            </button>

            <DeployHistoryPanel company={company} clientKey={clientKey} onSaved={onSaved} />
        </div>
    );
}

function ClientGroupCard({ group, expandedCompanyId, setExpandedCompanyId, onReload }) {
    const [health, setHealth] = useState(null);
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [onboarding, setOnboarding] = useState(null);

    const copyChecklist = async () => {
        try {
            const data = await getClientDeployChecklist(group.clientKey);
            const lines = [
                `# Pre-deploy: ${data.clientName}`,
                '',
                ...data.buildLines,
                '',
                '## Checklist',
                ...data.checklist.map((c) => `- [ ] ${c}`),
            ];
            if (data.onboardingSteps?.length) {
                lines.push('', '## Onboarding', ...data.onboardingSteps.map((s) => `- ${s}`));
            }
            await copyText(lines.join('\n'), 'Checklist copied');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to load checklist');
        }
    };

    const loadOnboarding = async () => {
        if (onboarding) {
            setOnboarding(null);
            return;
        }
        try {
            const data = await getClientDeployChecklist(group.clientKey);
            setOnboarding(data.onboardingSteps || []);
        } catch {
            toast.error('Failed to load onboarding steps');
        }
    };

    const runHealthCheck = async () => {
        const url = group.backendUrl || group.companies?.[0]?.deploymentConfig?.backendUrl;
        if (!url) {
            toast.error('No backend URL for health check');
            return;
        }
        setCheckingHealth(true);
        const result = await probeBackendHealth(url);
        setHealth(result);
        setCheckingHealth(false);
        toast[result.ok ? 'success' : 'error'](result.ok ? 'Backend health OK' : (result.message || `HTTP ${result.status}`));
    };

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{group.clientName}</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        {group.industryTemplateLabels?.map((t) => t.name).join(', ') || '—'}
                        {' · '}
                        {group.companyCount} compan{group.companyCount === 1 ? 'y' : 'ies'}
                    </p>
                </div>
                {statusBadge(group.status)}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" onClick={copyChecklist} style={btnSecondary}>
                    <ClipboardList size={14} />
                    Copy Pre-deploy Checklist
                </button>
                {group.backendUrl && (
                    <button type="button" onClick={runHealthCheck} disabled={checkingHealth} style={btnSecondary}>
                        <HeartPulse size={14} />
                        {checkingHealth ? 'Checking…' : 'Health Check (browser)'}
                    </button>
                )}
                {group.status === 'planned' && (
                    <button type="button" onClick={loadOnboarding} style={btnSecondary}>
                        {onboarding ? 'Hide Onboarding' : 'Show Onboarding Steps'}
                    </button>
                )}
            </div>

            {health && (
                <p style={{ margin: '0 0 12px', fontSize: 12, color: health.ok ? '#166534' : '#b91c1c' }}>
                    Health: {health.ok ? 'OK' : 'Failed'} {health.body ? `— ${health.body}` : health.message || ''}
                </p>
            )}

            {onboarding?.length > 0 && (
                <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 12, color: '#475569' }}>
                    {onboarding.map((step) => <li key={step} style={{ marginBottom: 4 }}>{step}</li>)}
                </ol>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, fontSize: 12, marginBottom: 12 }}>
                <div><strong>FE Service:</strong> {group.renderFrontendService || '—'}</div>
                <div><strong>BE Service:</strong> {group.renderBackendService || '—'}</div>
                <div><strong>Database:</strong> {group.databaseName || '—'}</div>
                <div><strong>Branch:</strong> {group.deployBranch || '—'}</div>
                <div><strong>Build:</strong> {group.buildCommand || group.buildCommandFrontend || '—'}</div>
                <div><strong>Auto-deploy:</strong> {group.autoDeployRecommended ? 'On' : 'Off (recommended)'}</div>
            </div>

            {(group.frontendUrl || group.backendUrl) && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {group.frontendUrl && (
                        <a href={group.frontendUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            Frontend <ExternalLink size={12} />
                        </a>
                    )}
                    {group.backendUrl && (
                        <a href={`${group.backendUrl}/api/v1/health`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            Backend Health <ExternalLink size={12} />
                        </a>
                    )}
                </div>
            )}

            {group.notes && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#475569' }}>{group.notes}</p>}

            {group.companies?.length ? (
                <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Companies in this group</h3>
                    {group.companies.map((company) => (
                        <div key={company._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fff' }}>
                            <button
                                type="button"
                                onClick={() => setExpandedCompanyId(expandedCompanyId === company._id ? '' : company._id)}
                                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{company.companyName}</span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {company.industryTemplateCode || '—'}
                                        {' · '}
                                        commit {company.deploymentConfig?.lastLiveCommit || '—'}
                                        {' · '}
                                        {company.enabledModuleCount} modules
                                    </span>
                                </div>
                            </button>
                            {expandedCompanyId === company._id && (
                                <TrackingEditor company={company} clientKey={group.clientKey} onSaved={onReload} />
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No companies matched to this client group yet.</p>
            )}
        </div>
    );
}

export default function IndustryDeploymentManagerPage() {
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedCompanyId, setExpandedCompanyId] = useState('');
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getDeploymentManagerOverview();
            setOverview(data);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to load deployment overview');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const exportReport = async () => {
        setExporting(true);
        try {
            const data = await getDeploymentManagerReport();
            await copyText(data.markdown || '', 'Deployment report copied');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Loading deployment manager…</div>;
    }

    const { clientGroups = [], unassignedCompanies = [], deployDecisionRules = [], preDeployChecklist = [], sharedRiskHints = [] } = overview || {};

    return (
        <div style={{ padding: '20px 24px', fontFamily: 'Inter, sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Server size={22} />
                        Industry-wise Deployment &amp; Update Manager
                    </h1>
                    <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13, maxWidth: 720 }}>
                        Client/group deployment reference and update tracking only. Does not deploy to Render or change env vars.
                        Use <Link to={PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION}>Company Module Allocation</Link> for module on/off without deploy.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={exportReport} disabled={exporting} style={btnSecondary}>
                        <Copy size={14} />
                        {exporting ? 'Exporting…' : 'Copy Full Report'}
                    </button>
                    <button type="button" onClick={load} style={btnSecondary}>
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </div>

            <div style={card}>
                <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Deploy Decision Rules</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={{ padding: 8 }}>Change Type</th>
                            <th style={{ padding: 8 }}>Action</th>
                            <th style={{ padding: 8 }}>Deploy?</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deployDecisionRules.map((rule) => (
                            <tr key={rule.changeType} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>{rule.changeType}{rule.sharedRisk ? ' (shared-risk)' : ''}</td>
                                <td style={{ padding: 8 }}>{rule.action}</td>
                                <td style={{ padding: 8 }}>{rule.deployRequired ? 'Yes' : 'No'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Pre-deploy Checklist (all clients)</h2>
                    <button type="button" onClick={() => copyText(preDeployChecklist.map((c) => `- [ ] ${c}`).join('\n'), 'Checklist copied')} style={btnSecondary}>
                        <Copy size={14} />
                        Copy
                    </button>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#475569' }}>
                    {preDeployChecklist.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
                </ul>
            </div>

            {sharedRiskHints?.length > 0 && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#b45309' }}>Shared-risk change hints</h2>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#92400e' }}>
                        {sharedRiskHints.map((hint) => <li key={hint} style={{ marginBottom: 4 }}>{hint}</li>)}
                    </ul>
                </div>
            )}

            {clientGroups.map((group) => (
                <ClientGroupCard
                    key={group.clientKey}
                    group={group}
                    expandedCompanyId={expandedCompanyId}
                    setExpandedCompanyId={setExpandedCompanyId}
                    onReload={load}
                />
            ))}

            {unassignedCompanies.length > 0 && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800 }}>Unassigned Companies</h2>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                        Set clientCode or deployment URLs, or use Apply Group Reference after expanding a company under the correct client.
                    </p>
                    {unassignedCompanies.map((company) => (
                        <div key={company._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                            <button
                                type="button"
                                onClick={() => setExpandedCompanyId(expandedCompanyId === company._id ? '' : company._id)}
                                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: 13 }}
                            >
                                {company.companyName}
                            </button>
                            {expandedCompanyId === company._id && (
                                <TrackingEditor company={company} clientKey="" onSaved={load} />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
