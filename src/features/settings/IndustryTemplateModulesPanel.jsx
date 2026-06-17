import React, { useCallback, useEffect, useState } from 'react';
import { getModuleRegistry, updateIndustryTemplateModules } from '@/services/moduleAllocationApi';
import { useToast } from '@/components/ui/Toast';

export default function IndustryTemplateModulesPanel({ template, onSaved, sectionId = 'industry-template-modules' }) {
    const { addToast } = useToast();
    const [registry, setRegistry] = useState([]);
    const [enabledModules, setEnabledModules] = useState([]);
    const [enforceModuleGuard, setEnforceModuleGuard] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadRegistry = useCallback(async () => {
        const reg = await getModuleRegistry();
        setRegistry(reg?.modules || []);
    }, []);

    useEffect(() => {
        loadRegistry();
    }, [loadRegistry]);

    useEffect(() => {
        const ms = template?.templateSettings?.moduleSettings || {};
        setEnabledModules(ms.enabledModules || []);
        setEnforceModuleGuard(!!ms.enforceModuleGuard);
    }, [template?._id, template?.templateSettings?.moduleSettings]);

    const toggle = (code) => {
        setEnabledModules((prev) => (
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
        ));
    };

    const handleSave = async () => {
        if (!template?._id) return;
        setSaving(true);
        try {
            await updateIndustryTemplateModules(template._id, {
                enabledModules,
                enforceModuleGuard,
            });
            addToast('Industry template modules saved', 'success');
            onSaved?.();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Save failed', 'error');
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
        <div id={sectionId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Enabled Modules (Industry Template)</h4>
                <button type="button" onClick={handleSave} disabled={saving} style={{ height: 28, padding: '0 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? 'Saving…' : 'Save Modules'}
                </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12 }}>
                <input type="checkbox" checked={enforceModuleGuard} onChange={(e) => setEnforceModuleGuard(e.target.checked)} />
                Enforce module guard for companies using this template (when allocation is configured)
            </label>
            {Object.entries(grouped).map(([group, mods]) => (
                <div key={group} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>{group}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                        {mods.map((m) => (
                            <label key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                                <input type="checkbox" checked={enabledModules.includes(m.code)} onChange={() => toggle(m.code)} />
                                {m.label}
                            </label>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
