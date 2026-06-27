import React, { useCallback, useEffect, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import {
    getModuleRegistry,
    getCompanyModuleAllocation,
    updateCompanyModuleAllocation,
} from '@/services/moduleAllocationApi';
import { getIndustryTemplates } from '@/services/industryTemplateApi';
import toast from 'react-hot-toast';

const inp = {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
};

export default function CompanyModuleAllocationPage() {
    const { companies, selectedCompany } = useCompany();
    const { refreshModules } = useModuleGuard();
    const [registry, setRegistry] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [companyId, setCompanyId] = useState(selectedCompany?._id || '');
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
        if (selectedCompany?._id && !companyId) setCompanyId(selectedCompany._id);
    }, [selectedCompany?._id, companyId]);

    useEffect(() => {
        if (companyId) loadCompany(companyId);
    }, [companyId, loadCompany]);

    const toggleModule = (code) => {
        setForm((prev) => ({
            ...prev,
            enabledModules: prev.enabledModules.includes(code)
                ? prev.enabledModules.filter((m) => m !== code)
                : [...prev.enabledModules, code],
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!companyId) {
            toast.error('Select a company');
            return;
        }
        setSaving(true);
        try {
            await updateCompanyModuleAllocation(companyId, {
                ...form,
                moduleAllocationConfigured: true,
            });
            await refreshModules();
            toast.success('Module allocation saved');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const applyTemplateDefaults = async () => {
        if (!companyId) return;
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

    const grouped = registry.reduce((acc, m) => {
        const g = m.group || 'core';
        if (!acc[g]) acc[g] = [];
        acc[g].push(m);
        return acc;
    }, {});

    return (
        <div style={{ padding: 28, background: '#f8fafc', minHeight: '100vh' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>Company Module Allocation</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
                Select which modules are enabled per company. JSK companies keep full access until you enable module guard here.
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Client Code</label>
                            <input value={form.clientCode} onChange={(e) => setForm((p) => ({ ...p, clientCode: e.target.value }))} style={{ ...inp, marginTop: 6 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Login URL Slug</label>
                            <input
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
                                value={form.loginTagline}
                                onChange={(e) => setForm((p) => ({ ...p, loginTagline: e.target.value }))}
                                placeholder="CRM Application"
                                style={{ ...inp, marginTop: 6 }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Login Accent Color</label>
                            <input
                                value={form.loginPrimaryColor}
                                onChange={(e) => setForm((p) => ({ ...p, loginPrimaryColor: e.target.value }))}
                                placeholder="#2563eb"
                                style={{ ...inp, marginTop: 6 }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Industry Template</label>
                            <select
                                value={form.industryTemplateRef}
                                onChange={(e) => setForm((p) => ({ ...p, industryTemplateRef: e.target.value }))}
                                style={{ ...inp, marginTop: 6 }}
                            >
                                <option value="">—</option>
                                {templates.map((t) => (
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
                            checked={form.moduleGuardEnabled}
                            onChange={(e) => setForm((p) => ({ ...p, moduleGuardEnabled: e.target.checked }))}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Enable Module Guard (hide/block unselected modules)</span>
                    </label>

                    <div style={{ marginBottom: 16 }}>
                        <button type="button" onClick={applyTemplateDefaults} disabled={saving} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            Apply industry template defaults
                        </button>
                    </div>

                    {Object.entries(grouped).map(([group, mods]) => (
                        <div key={group} style={{ marginBottom: 20 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: 10 }}>{group}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                                {mods.map((m) => (
                                    <label key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                                        <input
                                            type="checkbox"
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
                        <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                            {saving ? 'Saving…' : 'Save Allocation'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
