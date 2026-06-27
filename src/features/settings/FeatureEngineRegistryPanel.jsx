import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { getFeatureConfiguration, saveFeatureConfiguration } from '@/services/featureConfigurationApi';

export const ENGINE_REGISTRY_TABS = [
    { id: 'engine-module', engineCategory: 'module', label: 'Modules' },
    { id: 'engine-compliance', engineCategory: 'compliance', label: 'Registry · Compliance' },
    { id: 'engine-customer', engineCategory: 'customer', label: 'Registry · Customer' },
    { id: 'engine-supplier', engineCategory: 'supplier', label: 'Registry · Supplier' },
    { id: 'engine-industry', engineCategory: 'industry', label: 'Registry · Industry' },
];

export const ENGINE_REGISTRY_TAB_IDS = new Set(ENGINE_REGISTRY_TABS.map((t) => t.id));

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

export default function FeatureEngineRegistryPanel({ activeTabId = 'engine-module' }) {
    const { selectedCompany } = useCompany();
    const { refreshFeatureSettings } = useFeatureSettings();
    const engineCategory = ENGINE_REGISTRY_TABS.find((t) => t.id === activeTabId)?.engineCategory || 'module';
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

    const items = registry.filter((r) => r.category === engineCategory);
    const customInTab = customDefinitions.filter((c) => c.category === engineCategory);

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
            category: engineCategory === 'industry' ? 'industry' : newField.module,
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
            toast.success('Feature engine registry saved');
            await refreshFeatureSettings?.();
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (!selectedCompany?._id) {
        return (
            <p style={{ padding: 16, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 14 }}>
                Select a company from the top bar to load and save the feature engine registry.
            </p>
        );
    }

    if (loading) {
        return <p style={{ color: '#64748b' }}>Loading feature engine registry…</p>;
    }

    return (
        <>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                Platform feature engine — registry overrides for <strong>{selectedCompany?.companyName}</strong>.
                OFF hides UI only; data is never deleted. Company compliance toggles are on the other tabs.
            </p>
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
                    <p style={{ color: '#94a3b8', fontSize: 13 }}>No registry features in this category.</p>
                )}

                {(engineCategory === 'industry' || engineCategory === 'customer') && (
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
            <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
                {saving ? 'Saving…' : 'Save feature engine registry'}
            </button>
        </>
    );
}
