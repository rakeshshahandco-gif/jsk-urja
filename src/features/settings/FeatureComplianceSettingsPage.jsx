import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { updateCompanyFeatureSettings } from '@/services/featureSettingsApi';
import { mergeFeatureSettings } from '@/utils/featureSettings';
import { useCompany } from '@/contexts/CompanyContext';
import { FEATURE_SETTINGS_TABS, FEATURE_SETTINGS_FIELDS } from '@/config/featureSettingsFields';

const TABS = FEATURE_SETTINGS_TABS;
const FIELDS = FEATURE_SETTINGS_FIELDS;

function ToggleRow({ label, checked, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{label}</span>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
    );
}

export default function FeatureComplianceSettingsPage() {
    const { selectedCompany } = useCompany();
    const { settings: loaded, refreshFeatureSettings } = useFeatureSettings();
    const [tab, setTab] = useState('sales');
    const [draft, setDraft] = useState(() => mergeFeatureSettings(null));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(mergeFeatureSettings(loaded));
    }, [loaded]);

    const setFlag = (section, key, val) => {
        setDraft((p) => ({
            ...p,
            [section]: { ...p[section], [key]: val },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateCompanyFeatureSettings(draft);
            await refreshFeatureSettings();
            toast.success('Feature settings saved for this company');
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const section = FIELDS[tab] || [];
    const industry = draft.industry || {};
    const isLegacyJsk = industry.behaviorMode === 'legacy-compatible';

    return (
        <div style={{ padding: '24px 30px', maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Feature / Compliance Settings</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
                Company: <strong>{selectedCompany?.companyName || '—'}</strong>. Overrides apply on top of platform defaults (Admin → Platform Default Settings). Disabled features hide menus and block related APIs.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {TABS.map((t) => (
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
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                {tab === 'industry' && (
                    <>
                        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                            JSK URJA uses <strong>legacy-compatible</strong> mode: existing production, accounting, GST, and reports run unchanged.
                        </p>
                        <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                            <div><strong>Display name:</strong> {industry.companyDisplayName || 'JSK URJA'}</div>
                            <div><strong>Industry type:</strong> {industry.industryTemplate || '—'}</div>
                            <div><strong>Production process:</strong> {industry.productionProcessTemplate || '—'}</div>
                            <div><strong>Behavior mode:</strong> {industry.behaviorMode || 'legacy-compatible'}</div>
                        </div>
                        {isLegacyJsk && (
                            <p style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                                Work orders use the existing 9-stage JSK flow (PCB through Final QC).
                            </p>
                        )}
                    </>
                )}
                {tab !== 'industry' && section.map(([key, label]) => (
                    <ToggleRow
                        key={key}
                        label={label}
                        checked={draft[tab]?.[key]}
                        onChange={(v) => setFlag(tab, key, v)}
                    />
                ))}
                {tab === 'saas' && (
                    <div style={{ marginTop: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>User limit (0 = unlimited)</label>
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

            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
            >
                {saving ? 'Saving...' : 'Save settings'}
            </button>
        </div>
    );
}
