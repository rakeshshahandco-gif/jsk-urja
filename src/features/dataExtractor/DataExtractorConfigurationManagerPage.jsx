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

export default function DataExtractorConfigurationManagerPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.configuration_manager.view')
        || can(hasPermission, 'data_extractor.configuration_manager.create_draft');
    const canCreate = can(hasPermission, 'data_extractor.configuration_manager.create_draft');
    const canEdit = can(hasPermission, 'data_extractor.configuration_manager.edit_draft');
    const canValidate = can(hasPermission, 'data_extractor.configuration_manager.validate');
    const canReview = can(hasPermission, 'data_extractor.configuration_manager.review');
    const canSandbox = can(hasPermission, 'data_extractor.configuration_manager.ready_for_sandbox');
    const canCompare = can(hasPermission, 'data_extractor.configuration_manager.compare');
    const canDeps = can(hasPermission, 'data_extractor.configuration_manager.dependencies');
    const canCompat = can(hasPermission, 'data_extractor.configuration_manager.compatibility');
    const canExport = can(hasPermission, 'data_extractor.configuration_manager.export');
    const canAudit = can(hasPermission, 'data_extractor.configuration_manager.audit');
    const canSettings = can(hasPermission, 'data_extractor.configuration_manager.settings')
        || can(hasPermission, 'data_extractor.configuration_manager.manage');

    const [tab, setTab] = useState('families');
    const [families, setFamilies] = useState([]);
    const [versions, setVersions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [familyId, setFamilyId] = useState('');
    const [specId, setSpecId] = useState('');
    const [payloadText, setPayloadText] = useState('{\n  "weights": { "fit": 0.5, "intent": 0.5 }\n}');
    const [compareOtherId, setCompareOtherId] = useState('');
    const [rollbackId, setRollbackId] = useState('');
    const [report, setReport] = useState(null);
    const [audit, setAudit] = useState([]);
    const [settings, setSettings] = useState(null);
    const [busy, setBusy] = useState('');

    const loadFamilies = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listConfigFamilies();
            setFamilies(data?.items || []);
            if (!familyId && data?.items?.[0]?._id) setFamilyId(String(data.items[0]._id));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load families');
        }
    }, [familyId]);

    const loadVersions = useCallback(async () => {
        try {
            const data = await dataExtractorApi.listConfigVersions(familyId ? { familyId } : {});
            setVersions(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load versions');
        }
    }, [familyId]);

    useEffect(() => {
        if (!canView) return;
        if (tab === 'families') loadFamilies();
        if (tab === 'versions' || tab === 'editor') {
            loadFamilies();
            loadVersions();
        }
        if (tab === 'settings' && canSettings) {
            dataExtractorApi.getConfigSettings().then(setSettings).catch(() => {});
        }
        if (tab === 'audit' && canAudit) {
            dataExtractorApi.getConfigAudit().then((d) => setAudit(d?.items || [])).catch(() => {});
        }
    }, [tab, canView, canSettings, canAudit, loadFamilies, loadVersions]);

    const run = async (label, fn) => {
        setBusy(label);
        try {
            const data = await fn();
            setReport(data);
            toast.success(label + ' OK');
            await loadVersions();
            return data;
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || label + ' failed');
            return null;
        } finally {
            setBusy('');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view the Configuration Manager.</div>;
    }

    return (
        <div style={{ padding: 16, maxWidth: 1100 }}>
            <div style={{ ...card, background: '#f8fafc' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Intelligence Configuration Manager</h2>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569' }}>
                    Phase 21 manages configuration versions only. READY_FOR_SANDBOX means Phase 22 may evaluate —
                    it does <strong>not</strong> activate runtime, recalculate scores, or modify CRM.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                    <Link to={PATHS.DATA_EXTRACTOR.IMPROVEMENT_APPROVAL}>Improvement Approval</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.LEARNING_INTELLIGENCE}>Learning Intelligence</Link>
                    {' · '}
                    <Link to={PATHS.DATA_EXTRACTOR.SANDBOX_EVALUATION}>Sandbox Evaluation</Link>
                </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['families', 'versions', 'editor', 'compare', 'deps', 'settings', 'audit'].map((t) => (
                    <button key={t} type="button" style={tab === t ? btnPrimary : btn} onClick={() => setTab(t)}>{t}</button>
                ))}
            </div>

            {tab === 'families' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Configuration Families</h3>
                    <p style={{ fontSize: 12, color: '#64748b' }}>Company-scoped families. Baseline reference remains EXISTING_RUNTIME_BASELINE.</p>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th align="left">Code</th>
                                <th align="left">Name</th>
                                <th align="left">Module</th>
                                <th align="left">Schema</th>
                            </tr>
                        </thead>
                        <tbody>
                            {families.map((f) => (
                                <tr key={f._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td>{f.code}</td>
                                    <td>{f.name}</td>
                                    <td>{f.module}</td>
                                    <td>{f.schemaVersion}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'versions' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Version List</h3>
                    <label style={{ fontSize: 12 }}>Family filter</label>
                    <select style={field} value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                        <option value="">All</option>
                        {families.map((f) => <option key={f._id} value={f._id}>{f.code}</option>)}
                    </select>
                    <button type="button" style={{ ...btn, marginTop: 8 }} onClick={loadVersions}>Refresh</button>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 10 }}>
                        <thead>
                            <tr>
                                <th align="left">#</th>
                                <th align="left">Status</th>
                                <th align="left">Validation</th>
                                <th align="left">Checksum</th>
                                <th align="left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {versions.map((v) => (
                                <tr key={v._id || v.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td>v{v.versionNumber}</td>
                                    <td>{v.status}</td>
                                    <td>{v.validationStatus}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{(v.payloadChecksum || '').slice(0, 12)}</td>
                                    <td>
                                        <button type="button" style={btn} onClick={() => { setSelected(v); setTab('editor'); }}>Open</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'editor' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Draft Version Editor</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div>
                            <label style={{ fontSize: 12 }}>Family</label>
                            <select style={field} value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                                {families.map((f) => <option key={f._id} value={f._id}>{f.code}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 12 }}>Linked Implementation Specification ID (Phase 20)</label>
                            <input style={field} value={specId} onChange={(e) => setSpecId(e.target.value)} placeholder="optional ObjectId" />
                        </div>
                        <div>
                            <label style={{ fontSize: 12 }}>Structured configuration payload (JSON)</label>
                            <textarea style={{ ...field, minHeight: 140, fontFamily: 'monospace' }} value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {canCreate && (
                                <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Create draft', async () => {
                                    const configurationPayload = JSON.parse(payloadText);
                                    return dataExtractorApi.createConfigDraft({
                                        familyId,
                                        configurationPayload,
                                        linkedImplementationSpecificationId: specId || undefined,
                                    });
                                })}>Create Draft</button>
                            )}
                            {canEdit && selected && (
                                <button type="button" style={btn} disabled={!!busy} onClick={() => run('Edit draft', async () => {
                                    const configurationPayload = JSON.parse(payloadText);
                                    return dataExtractorApi.updateConfigDraft(selected._id || selected.id, { configurationPayload });
                                })}>Save Draft / Fork Immutable</button>
                            )}
                            {canCreate && selected && (
                                <button type="button" style={btn} disabled={!!busy} onClick={() => run('Clone', () => dataExtractorApi.cloneConfigVersion(selected._id || selected.id))}>Clone Version</button>
                            )}
                            {canValidate && selected && (
                                <button type="button" style={btn} disabled={!!busy} onClick={() => run('Validate', () => dataExtractorApi.validateConfigVersion(selected._id || selected.id))}>Validate Schema</button>
                            )}
                            {canReview && selected && (
                                <>
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => run('Submit review', () => dataExtractorApi.reviewConfigVersion(selected._id || selected.id, { decision: 'SUBMIT' }))}>Submit IN_REVIEW</button>
                                    <button type="button" style={btn} disabled={!!busy} onClick={() => run('Mark validated', () => dataExtractorApi.reviewConfigVersion(selected._id || selected.id, { decision: 'VALIDATE' }))}>Mark VALIDATED</button>
                                </>
                            )}
                            {canSandbox && selected && (
                                <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run('Ready for sandbox', () => dataExtractorApi.readyConfigForSandbox(selected._id || selected.id))}>Ready for Sandbox</button>
                            )}
                            {canExport && selected && (
                                <button type="button" style={btn} disabled={!!busy} onClick={() => run('Export', () => dataExtractorApi.exportConfigVersion(selected._id || selected.id))}>Export Sandbox Package</button>
                            )}
                        </div>
                        {selected && (
                            <div style={{ fontSize: 12, color: '#334155' }}>
                                Selected: v{selected.versionNumber} · {selected.status} · runtimeActive={String(selected.runtimeActive === true)}
                                <div style={{ marginTop: 6 }}>
                                    <strong>Scope:</strong> {selected.companyScope || 'OWN_COMPANY'}
                                    {' · '}
                                    <strong>Risk:</strong> metadata preview only
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <label style={{ fontSize: 12 }}>Rollback target version id</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input style={field} value={rollbackId} onChange={(e) => setRollbackId(e.target.value)} />
                                        {canReview && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => run('Rollback target', () => dataExtractorApi.setConfigRollbackTarget(selected._id || selected.id, { rollbackTargetVersionId: rollbackId }))}>
                                                Select Rollback Target
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>Selecting a rollback target does not perform a rollback.</div>
                                </div>
                                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" style={btn} onClick={() => run('Impact preview', () => dataExtractorApi.getConfigImpactPreview(selected._id || selected.id))}>Impact Preview</button>
                                    {canDeps && <button type="button" style={btn} onClick={() => run('Dependencies', () => dataExtractorApi.getConfigDependencies(selected._id || selected.id))}>Dependencies</button>}
                                    {canCompat && <button type="button" style={btn} onClick={() => run('Compatibility', () => dataExtractorApi.getConfigCompatibility(selected._id || selected.id))}>Compatibility</button>}
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, color: '#b91c1c' }}>
                        No Activate Production / Apply to Runtime / Recalculate / Regenerate / Deploy / Train / Execute / Send actions in Phase 21.
                    </div>
                </div>
            )}

            {tab === 'compare' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Version Comparison</h3>
                    <p style={{ fontSize: 12 }}>Select a version in Editor first, then provide another version id.</p>
                    <input style={field} value={compareOtherId} onChange={(e) => setCompareOtherId(e.target.value)} placeholder="other version id" />
                    {canCompare && selected && (
                        <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={() => run('Compare', () => dataExtractorApi.compareConfigVersions(selected._id || selected.id, compareOtherId))}>
                            Compare (no execution)
                        </button>
                    )}
                </div>
            )}

            {tab === 'deps' && selected && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Dependency / Compatibility Viewer</h3>
                    <button type="button" style={btn} onClick={() => run('Dependencies', () => dataExtractorApi.getConfigDependencies(selected._id || selected.id))}>Load Dependencies</button>
                    {' '}
                    <button type="button" style={btn} onClick={() => run('Compatibility', () => dataExtractorApi.getConfigCompatibility(selected._id || selected.id))}>Load Compatibility</button>
                </div>
            )}

            {tab === 'settings' && (
                <div style={card}>
                    <h3 style={{ marginTop: 0 }}>Settings</h3>
                    <pre style={{ fontSize: 11, overflow: 'auto' }}>{JSON.stringify(settings, null, 2)}</pre>
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
