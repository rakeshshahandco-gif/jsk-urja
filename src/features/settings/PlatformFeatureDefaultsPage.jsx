import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { mergeFeatureSettings } from '@/utils/featureSettings';
import {
    getPlatformFeatureSettings,
    updatePlatformFeatureSettings,
    applyPlatformDefaultsToAllCompanies,
} from '@/services/featureSettingsApi';
import { PLATFORM_FEATURE_TABS, FEATURE_SETTINGS_FIELDS } from '@/config/featureSettingsFields';
import { useAuth } from '@/hooks/useAuth';

function ToggleRow({ label, checked, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{label}</span>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
    );
}

export default function PlatformFeatureDefaultsPage() {
    const { hasRole } = useAuth();
    const isSuperAdmin = hasRole('superadmin');
    const [tab, setTab] = useState('sales');
    const [draft, setDraft] = useState(() => mergeFeatureSettings(null));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [applying, setApplying] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getPlatformFeatureSettings();
            setDraft(mergeFeatureSettings(data?.settings));
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load platform defaults');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const setFlag = (section, key, val) => {
        setDraft((p) => ({
            ...p,
            [section]: { ...p[section], [key]: val },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updatePlatformFeatureSettings(draft);
            toast.success('Platform default settings saved');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save platform defaults');
        } finally {
            setSaving(false);
        }
    };

    const handleApplyAll = async () => {
        if (!window.confirm('Apply these platform defaults to ALL companies? Each company keeps its industry settings only.')) {
            return;
        }
        setApplying(true);
        try {
            const res = await applyPlatformDefaultsToAllCompanies();
            const updated = res?.updated;
            toast.success(`Applied to ${updated ?? 0} companies`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to apply to all companies');
        } finally {
            setApplying(false);
        }
    };

    const section = FEATURE_SETTINGS_FIELDS[tab] || [];
    const tabCheckboxKeys = section.map(([key]) => key);
    const checkedCount = tabCheckboxKeys.filter((key) => !!draft[tab]?.[key]).length;
    const allChecked = tabCheckboxKeys.length > 0 && checkedCount === tabCheckboxKeys.length;
    const someChecked = checkedCount > 0 && !allChecked;
    const tabLabel = PLATFORM_FEATURE_TABS.find((t) => t.id === tab)?.label || tab;

    const setAllInTab = (val) => {
        setDraft((p) => {
            const next = { ...p, [tab]: { ...p[tab] } };
            for (const [key] of section) {
                next[tab][key] = val;
                if (tab === 'accounting' && key === 'enableScanEntry') {
                    next.accounting = { ...next.accounting, enableAiSmartImport: val, enableScanEntry: val };
                }
            }
            return next;
        });
        toast.success(val ? `All ${tabLabel} toggles ON — click Save platform defaults` : `All ${tabLabel} toggles OFF — click Save platform defaults`);
    };

    if (loading) {        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading platform defaults…</div>;
    }

    return (
        <div style={{ padding: '24px 30px', maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Platform Default Settings</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                Common toggles for <strong>all companies and industries</strong>. New companies inherit these defaults. Each company can override under
                Feature / Compliance Settings. Industry / production is always per company.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 20, paddingBottom: 6 }}>
                {PLATFORM_FEATURE_TABS.map((t) => (
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

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                {tab === 'customer' && (
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                        <strong>Customer</strong> — default visibility for Sundry Debtor / credit fields on Customer Master (all industries).
                    </p>
                )}
                {section.length > 0 && (
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 0 12px',
                            marginBottom: 8,
                            borderBottom: '2px solid #e2e8f0',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: 13,
                            color: '#1e40af',
                        }}
                    >
                        <span>Select all in {tabLabel}</span>
                        <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => {
                                if (el) el.indeterminate = someChecked;
                            }}
                            onChange={(e) => setAllInTab(e.target.checked)}
                            style={{ width: 18, height: 18 }}
                        />
                    </label>
                )}
                {section.map(([key, label]) => (                    <ToggleRow
                        key={key}
                        label={label}
                        checked={draft[tab]?.[key]}
                        onChange={(v) => setFlag(tab, key, v)}
                    />
                ))}
                {tab === 'saas' && (
                    <div style={{ marginTop: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Default user limit (0 = unlimited)</label>
                        <input
                            type="number"
                            min={0}
                            value={draft.saas?.userLimit ?? 0}
                            onChange={(e) => setFlag('saas', 'userLimit', Number(e.target.value) || 0)}
                            style={{ marginTop: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: 120 }}
                        />
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
                >
                    {saving ? 'Saving…' : 'Save platform defaults'}
                </button>
                {isSuperAdmin && (
                    <button
                        type="button"
                        onClick={handleApplyAll}
                        disabled={applying}
                        style={{ padding: '10px 24px', background: '#fff', color: '#b45309', border: '2px solid #f59e0b', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
                    >
                        {applying ? 'Applying…' : 'Apply to all companies'}
                    </button>
                )}
            </div>
        </div>
    );
}
