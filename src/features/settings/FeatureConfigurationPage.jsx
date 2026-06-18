import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { getFeatureConfiguration, saveFeatureConfiguration } from '@/services/featureConfigurationApi';
import { PATHS } from '@/routes/paths';

const TAB_META = [
    { id: 'module', label: 'Modules' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'customer', label: 'Customer Master' },
    { id: 'supplier', label: 'Supplier Master' },
    { id: 'industry', label: 'Industry Fields' },
];

function ToggleRow({ label, sub, checked, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <span>
                <span style={{ fontSize: 14, color: '#334155', fontWeight: 500, display: 'block' }}>{label}</span>
                {sub && <span style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</span>}
            </span>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
    );
}

export default function FeatureConfigurationPage() {
    const { selectedCompany } = useCompany();
    const { refreshFeatureSettings } = useFeatureSettings();
    const [tab, setTab] = useState('customer');
    const [registry, setRegistry] = useState([]);
    const [overrides, setOverrides] = useState({});
    const [customDefinitions, setCustomDefinitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newField, setNewField] = useState({ featureName: '', module: 'customer', industry: '' });

    const load = async () => {
        if (!selectedCompany?._id) {
            setLoading(false);
            setRegistry([]);
            setOverrides({});
            setCustomDefinitions([]);
            return;
        }
        setLoading(true);
        try {
            const data = await getFeatureConfiguration();
            setRegistry(data?.registry || []);
            setOverrides(data?.overrides || {});
            setCustomDefinitions(data?.featureEngine?.customDefinitions || []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load feature configuration');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [selectedCompany?._id]);

    const setFlag = (key, val) => setOverrides((p) => ({ ...p, [key]: val }));

    const items = registry.filter((r) => r.category === tab);
    const customInTab = customDefinitions.filter((c) => c.category === tab);

    const handleAddCustom = () => {
        const name = newField.featureName.trim();
        if (!name) return toast.error('Field name required');
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const featureKey = `custom.${newField.module}.${slug}`;
        if (overrides[featureKey] !== undefined || registry.some((r) => r.featureKey === featureKey)) {
            return toast.error('Field key already exists');
        }
        const entry = {
            featureKey,
            featureName: name,
            module: newField.module,
            category: tab === 'industry' ? 'industry' : newField.module,
            industry: newField.industry || null,
            defaultEnabled: false,
            required: false,
        };
        setCustomDefinitions((p) => [...p, entry]);
        setOverrides((p) => ({ ...p, [featureKey]: false }));
        setNewField({ featureName: '', module: 'customer', industry: '' });
        toast.success('Custom field added — save to persist');
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveFeatureConfiguration({ overrides, customDefinitions });
            toast.success('Feature configuration saved');
            await refreshFeatureSettings?.();
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                <Link to={PATHS.SETTINGS.HOME} style={{ color: '#2563eb', textDecoration: 'none' }}>Settings</Link>
                {' / '}
                <span style={{ fontWeight: 600, color: '#334155' }}>Feature Configuration</span>
            </div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Feature Configuration Engine</h1>
            <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
                Master enable/disable for <strong>all industries</strong> — company: <strong>{selectedCompany?.companyName || '—'}</strong>.
                OFF = hidden in UI; existing data is never deleted.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#94a3b8' }}>
                Legacy toggles also remain under{' '}
                <Link to={PATHS.SETTINGS.FEATURE_COMPLIANCE}>Feature / Compliance Settings</Link> (modules, GST, etc.).
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
                {TAB_META.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: tab === t.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                            background: tab === t.id ? '#eff6ff' : '#fff',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {!selectedCompany?._id ? (
                <p style={{ padding: 16, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 14 }}>
                    Select a company from the top bar to load and save feature configuration for that company.
                </p>
            ) : loading ? (
                <p style={{ color: '#64748b' }}>Loading…</p>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                    {items.map((def) => (
                        <ToggleRow
                            key={def.featureKey}
                            label={def.featureName}
                            sub={def.featureKey + (def.industry ? ` · ${def.industry}` : '')}
                            checked={overrides[def.featureKey]}
                            onChange={(v) => setFlag(def.featureKey, v)}
                        />
                    ))}
                    {customInTab.map((def) => (
                        <ToggleRow
                            key={def.featureKey}
                            label={`${def.featureName} (custom)`}
                            sub={def.featureKey}
                            checked={overrides[def.featureKey]}
                            onChange={(v) => setFlag(def.featureKey, v)}
                        />
                    ))}
                    {items.length === 0 && customInTab.length === 0 && (
                        <p style={{ color: '#94a3b8', fontSize: 13 }}>No features in this category.</p>
                    )}

                    {(tab === 'industry' || tab === 'customer') && (
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                Add custom field (no code deploy)
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                                <input
                                    placeholder="Field label e.g. Consultant"
                                    value={newField.featureName}
                                    onChange={(e) => setNewField((p) => ({ ...p, featureName: e.target.value }))}
                                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }}
                                />
                                <input
                                    placeholder="Industry (optional)"
                                    value={newField.industry}
                                    onChange={(e) => setNewField((p) => ({ ...p, industry: e.target.value }))}
                                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }}
                                />
                                <select
                                    value={newField.module}
                                    onChange={(e) => setNewField((p) => ({ ...p, module: e.target.value }))}
                                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }}
                                >
                                    <option value="customer">customer</option>
                                    <option value="supplier">supplier</option>
                                </select>
                                <button type="button" onClick={handleAddCustom} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                                    + Add
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
                {saving ? 'Saving…' : 'Save Feature Configuration'}
            </button>
        </div>
    );
}
