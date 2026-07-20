import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import {
    getModuleRegistry,
    getCompanyModuleAllocation,
    updateCompanyModuleAllocation,
    lockCompanyConfiguration,
    unlockCompanyConfiguration,
} from '@/services/moduleAllocationApi';
import { getIndustryTemplates } from '@/services/industryTemplateApi';
import toast from 'react-hot-toast';
import { PHASE2_PILOT_MODULE_KEYS, MODULE_STATE, MODULE_LOCK_MODE } from '@/utils/moduleAccessDecision';

const inp = {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
};

const emptyPilotState = (moduleKey) => ({
    moduleKey,
    state: MODULE_STATE.ON,
    lockMode: null,
    lockReason: '',
    remarks: '',
    changedBy: null,
    changedAt: null,
    source: 'enabledModules',
});


export default function CompanyModuleAllocationPage() {
    const [searchParams] = useSearchParams();
    const { companies, selectedCompany } = useCompany();
    const { refreshModules } = useModuleGuard();
    const [registry, setRegistry] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [companyId, setCompanyId] = useState(searchParams.get('companyId') || selectedCompany?._id || '');
    const [configurationLocked, setConfigurationLocked] = useState(false);
    const [configurationLockReason, setConfigurationLockReason] = useState('');
    const [form, setForm] = useState({
        clientCode: '',
        loginSlug: '',
        loginTagline: '',
        loginPrimaryColor: '',
        industryTemplateRef: '',
        enabledModules: [],
        disabledModules: [],
        moduleGuardEnabled: false,
        moduleAllocationConfigured: false,
        moduleStates: PHASE2_PILOT_MODULE_KEYS.map(emptyPilotState),
        deploymentConfig: {
            databaseName: '',
            backendUrl: '',
            frontendUrl: '',
            deploymentStatus: '',
        },
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadRegistry = useCallback(async () => {
        const [reg, tpls] = await Promise.all([
            getModuleRegistry(),
            getIndustryTemplates({ isActive: true }),
        ]);
        setRegistry(reg?.modules || []);
        setTemplates(tpls || []);
    }, []);

    const loadCompany = useCallback(async (id) => {
        if (!id) return;
        setLoading(true);
        try {
            const data = await getCompanyModuleAllocation(id);
            const c = data?.company || {};
            setConfigurationLocked(!!c.configurationLocked);
            setConfigurationLockReason(c.configurationLockReason || '');
            const resolvedPilot = data?.effective?.resolvedPilotModules || [];
            const pilotStates = PHASE2_PILOT_MODULE_KEYS.map((key) => {
                const fromResolved = resolvedPilot.find((r) => r.moduleKey === key);
                const fromStored = (c.moduleStates || []).find((s) => String(s.moduleKey).toLowerCase() === key);
                return {
                    moduleKey: key,
                    state: fromResolved?.state || MODULE_STATE.ON,
                    lockMode: fromResolved?.lockMode || fromStored?.lockMode || null,
                    lockReason: fromStored?.lockReason || fromResolved?.lockReason || '',
                    remarks: fromStored?.remarks || '',
                    changedBy: fromStored?.changedBy || fromResolved?.changedBy || null,
                    changedAt: fromStored?.changedAt || fromResolved?.changedAt || null,
                    source: fromResolved?.source || 'enabledModules',
                };
            });
            setForm({
                clientCode: c.clientCode || '',
                loginSlug: c.loginSlug || '',
                loginTagline: c.loginTagline || '',
                loginPrimaryColor: c.loginPrimaryColor || '',
                industryTemplateRef: c.industryTemplateRef?._id || c.industryTemplateRef || '',
                enabledModules: c.enabledModules || [],
                disabledModules: c.disabledModules || [],
                moduleGuardEnabled: !!c.moduleGuardEnabled,
                moduleAllocationConfigured: !!c.moduleAllocationConfigured,
                moduleStates: pilotStates,
                deploymentConfig: {
                    databaseName: c.deploymentConfig?.databaseName || '',
                    backendUrl: c.deploymentConfig?.backendUrl || '',
                    frontendUrl: c.deploymentConfig?.frontendUrl || '',
                    deploymentStatus: c.deploymentConfig?.deploymentStatus || '',
                },
            });
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to load allocation');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRegistry();
    }, [loadRegistry]);

    useEffect(() => {
        const fromUrl = searchParams.get('companyId');
        if (fromUrl) setCompanyId(fromUrl);
    }, [searchParams]);

    useEffect(() => {
        if (selectedCompany?._id && !companyId && !searchParams.get('companyId')) {
            setCompanyId(selectedCompany._id);
        }
    }, [selectedCompany?._id, companyId, searchParams]);

    useEffect(() => {
        if (companyId) loadCompany(companyId);
    }, [companyId, loadCompany]);

    const toggleModule = (code) => {
        if (configurationLocked) return;
        setForm((prev) => {
            const nextEnabled = prev.enabledModules.includes(code)
                ? prev.enabledModules.filter((m) => m !== code)
                : [...prev.enabledModules, code];
            const nextStates = (prev.moduleStates || []).map((s) => {
                if (s.moduleKey !== code) return s;
                const on = nextEnabled.includes(code);
                return {
                    ...s,
                    state: on ? (s.state === MODULE_STATE.OFF ? MODULE_STATE.ON : s.state) : MODULE_STATE.OFF,
                    lockMode: on && s.state === MODULE_STATE.LOCKED ? s.lockMode : null,
                };
            });
            return {
                ...prev,
                enabledModules: nextEnabled,
                moduleStates: nextStates,
            };
        });
    };

    const updatePilotState = (moduleKey, patch) => {
        if (configurationLocked) return;
        setForm((prev) => {
            const moduleStates = (prev.moduleStates || []).map((s) => {
                if (s.moduleKey !== moduleKey) return s;
                const next = { ...s, ...patch };
                if (next.state !== MODULE_STATE.LOCKED) next.lockMode = null;
                if (next.state === MODULE_STATE.LOCKED && !next.lockMode) {
                    next.lockMode = MODULE_LOCK_MODE.READ_ONLY;
                }
                return next;
            });
            let enabledModules = [...prev.enabledModules];
            let disabledModules = [...(prev.disabledModules || [])];
            const st = moduleStates.find((s) => s.moduleKey === moduleKey);
            if (st?.state === MODULE_STATE.OFF) {
                enabledModules = enabledModules.filter((m) => m !== moduleKey);
                if (!disabledModules.includes(moduleKey)) disabledModules.push(moduleKey);
            } else if (st) {
                if (!enabledModules.includes(moduleKey)) enabledModules.push(moduleKey);
                disabledModules = disabledModules.filter((m) => m !== moduleKey);
            }
            return { ...prev, moduleStates, enabledModules, disabledModules };
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!companyId) {
            toast.error('Select a company');
            return;
        }
        if (configurationLocked) {
            toast.error('Company configuration is locked');
            return;
        }
        setSaving(true);
        try {
            await updateCompanyModuleAllocation(companyId, {
                ...form,
                moduleAllocationConfigured: true,
                moduleStates: (form.moduleStates || []).map((s) => ({
                    moduleKey: s.moduleKey,
                    state: s.state,
                    lockMode: s.state === MODULE_STATE.LOCKED ? (s.lockMode || MODULE_LOCK_MODE.READ_ONLY) : null,
                    lockReason: s.lockReason || '',
                    remarks: s.remarks || '',
                })),
            });
            await refreshModules();
            toast.success('Module allocation saved');
            await loadCompany(companyId);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const applyTemplateDefaults = async () => {
        if (!companyId) return;
        if (configurationLocked) {
            toast.error('Company configuration is locked');
            return;
        }
        setSaving(true);
        try {
            await updateCompanyModuleAllocation(companyId, {
                industryTemplateRef: form.industryTemplateRef || null,
                applyTemplateDefaults: true,
                moduleAllocationConfigured: true,
                moduleGuardEnabled: true,
            });
            await loadCompany(companyId);
            await refreshModules();
            toast.success('Template defaults applied');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Apply failed');
        } finally {
            setSaving(false);
        }
    };

    const handleLockToggle = async () => {
        if (!companyId) return;
        setSaving(true);
        try {
            if (configurationLocked) {
                await unlockCompanyConfiguration(companyId, { reason: 'Unlocked by Super Admin' });
                toast.success('Company configuration unlocked');
            } else {
                await lockCompanyConfiguration(companyId, {
                    reason: 'Locked after industry/module confirmation — Client Admin cannot change setup',
                });
                toast.success('Company configuration locked');
            }
            await loadCompany(companyId);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Lock action failed');
        } finally {
            setSaving(false);
        }
    };

    const grouped = registry.reduce((acc, m) => {
        const g = m.group || 'core';
        if (!acc[g]) acc[g] = [];
        acc[g].push(m);
        return acc;
    }, {});

    const fieldDisabled = configurationLocked || saving;

    return (
        <div style={{ padding: 28, background: '#f8fafc', minHeight: '100vh' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>Company Module Allocation</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
                Select which modules are enabled per company. Use Industry Template
                {' '}
                <strong>Textile / Handloom (TEXTILE)</strong>
                {' '}
                for Handloom. Lock setup after confirmation so Client Admin cannot change it.
            </p>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Company</label>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={{ ...inp, marginTop: 6 }}>
                    <option value="">Select company…</option>
                    {companies.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <p style={{ color: '#94a3b8' }}>Loading…</p>
            ) : companyId && (
                <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                    {configurationLocked && (
                        <div style={{
                            marginBottom: 16,
                            padding: '12px 14px',
                            background: '#fef3c7',
                            border: '1px solid #f59e0b',
                            borderRadius: 8,
                            color: '#92400e',
                            fontSize: 13,
                        }}
                        >
                            Configuration locked
                            {configurationLockReason ? ` — ${configurationLockReason}` : ''}.
                            Unlock as Super Admin to edit industry template, modules, branding fields, or deployment mapping.
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Client Code</label>
                            <input disabled={fieldDisabled} value={form.clientCode} onChange={(e) => setForm((p) => ({ ...p, clientCode: e.target.value }))} style={{ ...inp, marginTop: 6 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Login URL Slug</label>
                            <input
                                disabled={fieldDisabled}
                                value={form.loginSlug}
                                onChange={(e) => setForm((p) => ({ ...p, loginSlug: e.target.value }))}
                                placeholder="e.g. jsk, handloom"
                                style={{ ...inp, marginTop: 6 }}
                            />
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
                                Branded login: /login/
                                {form.loginSlug || form.clientCode || 'your-slug'}
                                {' '}
                                (logo from Company Profile)
                            </p>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Login Tagline</label>
                            <input
                                disabled={fieldDisabled}
                                value={form.loginTagline}
                                onChange={(e) => setForm((p) => ({ ...p, loginTagline: e.target.value }))}
                                placeholder="CRM Application"
                                style={{ ...inp, marginTop: 6 }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Login Accent Color</label>
                            <input
                                disabled={fieldDisabled}
                                value={form.loginPrimaryColor}
                                onChange={(e) => setForm((p) => ({ ...p, loginPrimaryColor: e.target.value }))}
                                placeholder="#2563eb"
                                style={{ ...inp, marginTop: 6 }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Industry Template</label>
                            <select
                                disabled={fieldDisabled}
                                value={form.industryTemplateRef}
                                onChange={(e) => setForm((p) => ({ ...p, industryTemplateRef: e.target.value }))}
                                style={{ ...inp, marginTop: 6 }}
                            >
                                <option value="">—</option>
                                {templates
                                    .filter((t) => String(t.templateCode || '').toUpperCase() !== 'HETPL')
                                    .map((t) => (
                                    <option key={t._id} value={t._id}>{t.templateName} ({t.templateCode})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        {['databaseName', 'backendUrl', 'frontendUrl'].map((key) => (
                            <div key={key}>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{key}</label>
                                <input
                                    disabled={fieldDisabled}
                                    value={form.deploymentConfig[key] || ''}
                                    onChange={(e) => setForm((p) => ({
                                        ...p,
                                        deploymentConfig: { ...p.deploymentConfig, [key]: e.target.value },
                                    }))}
                                    style={{ ...inp, marginTop: 6 }}
                                />
                            </div>
                        ))}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Deployment Status</label>
                            <select
                                disabled={fieldDisabled}
                                value={form.deploymentConfig.deploymentStatus || ''}
                                onChange={(e) => setForm((p) => ({
                                    ...p,
                                    deploymentConfig: { ...p.deploymentConfig, deploymentStatus: e.target.value },
                                }))}
                                style={{ ...inp, marginTop: 6 }}
                            >
                                {['', 'local', 'staging', 'live', 'pending'].map((s) => (
                                    <option key={s} value={s}>{s || '—'}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            disabled={fieldDisabled}
                            checked={form.moduleGuardEnabled}
                            onChange={(e) => setForm((p) => ({ ...p, moduleGuardEnabled: e.target.checked }))}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Enable Module Guard (hide/block unselected modules)</span>
                    </label>

                    <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button type="button" onClick={applyTemplateDefaults} disabled={fieldDisabled} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: fieldDisabled ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                            Apply industry template defaults
                        </button>
                        <button
                            type="button"
                            onClick={handleLockToggle}
                            disabled={saving}
                            style={{
                                padding: '8px 14px',
                                background: configurationLocked ? '#ecfdf5' : '#fff7ed',
                                border: `1px solid ${configurationLocked ? '#34d399' : '#fb923c'}`,
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 700,
                            }}
                        >
                            {configurationLocked ? 'Unlock Company Configuration' : 'Lock Company Configuration'}
                        </button>
                    </div>

                    <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                            Phase 2 — Pilot module states (tasks / crm / sales)
                        </h3>
                        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b' }}>
                            ON = normal. LOCKED = visible with lock mode. OFF = hidden and API blocked. Missing state falls back to enabledModules checkbox.
                        </p>
                        {(form.moduleStates || []).map((s) => {
                            const label = registry.find((m) => m.code === s.moduleKey)?.label || s.moduleKey;
                            const changedByLabel = s.changedBy?.name || s.changedBy?.username || s.changedBy?.email || (s.changedBy ? String(s.changedBy) : '—');
                            const changedAtLabel = s.changedAt ? new Date(s.changedAt).toLocaleString() : '—';
                            return (
                                <div
                                    key={s.moduleKey}
                                    style={{
                                        marginBottom: 12,
                                        padding: 12,
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                                        <strong style={{ fontSize: 13 }}>{label} ({s.moduleKey})</strong>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>
                                            Status source: {s.source || '—'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>State</label>
                                            <select
                                                disabled={fieldDisabled}
                                                value={s.state}
                                                onChange={(e) => updatePilotState(s.moduleKey, { state: e.target.value })}
                                                style={{ ...inp, marginTop: 4 }}
                                            >
                                                <option value={MODULE_STATE.ON}>ON</option>
                                                <option value={MODULE_STATE.LOCKED}>LOCKED</option>
                                                <option value={MODULE_STATE.OFF}>OFF</option>
                                            </select>
                                        </div>
                                        {s.state === MODULE_STATE.LOCKED && (
                                            <div>
                                                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Lock mode</label>
                                                <select
                                                    disabled={fieldDisabled}
                                                    value={s.lockMode || MODULE_LOCK_MODE.READ_ONLY}
                                                    onChange={(e) => updatePilotState(s.moduleKey, { lockMode: e.target.value })}
                                                    style={{ ...inp, marginTop: 4 }}
                                                >
                                                    <option value={MODULE_LOCK_MODE.READ_ONLY}>READ_ONLY</option>
                                                    <option value={MODULE_LOCK_MODE.NEW_ENTRY_BLOCKED}>NEW_ENTRY_BLOCKED</option>
                                                    <option value={MODULE_LOCK_MODE.FULL_LOCK}>FULL_LOCK</option>
                                                </select>
                                            </div>
                                        )}
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Lock reason</label>
                                            <input
                                                disabled={fieldDisabled || s.state !== MODULE_STATE.LOCKED}
                                                value={s.lockReason || ''}
                                                onChange={(e) => updatePilotState(s.moduleKey, { lockReason: e.target.value })}
                                                style={{ ...inp, marginTop: 4 }}
                                                placeholder="Shown to users when locked"
                                            />
                                        </div>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Remarks</label>
                                            <input
                                                disabled={fieldDisabled}
                                                value={s.remarks || ''}
                                                onChange={(e) => updatePilotState(s.moduleKey, { remarks: e.target.value })}
                                                style={{ ...inp, marginTop: 4 }}
                                                placeholder="Internal notes"
                                            />
                                        </div>
                                    </div>
                                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>
                                        Last changed by: {changedByLabel} · {changedAtLabel}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {Object.entries(grouped).map(([group, mods]) => (
                        <div key={group} style={{ marginBottom: 20 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: 10 }}>{group}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                                {mods.map((m) => (
                                    <label key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                                        <input
                                            type="checkbox"
                                            disabled={fieldDisabled}
                                            checked={form.enabledModules.includes(m.code)}
                                            onChange={() => toggleModule(m.code)}
                                        />
                                        {m.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                        <button type="submit" disabled={fieldDisabled} style={{ padding: '10px 20px', background: fieldDisabled ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: fieldDisabled ? 'not-allowed' : 'pointer' }}>
                            {saving ? 'Saving…' : (configurationLocked ? 'Locked — Unlock to Save' : 'Save Allocation')}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
