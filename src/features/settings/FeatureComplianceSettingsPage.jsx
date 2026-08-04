import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { updateCompanyFeatureSettings } from '@/services/featureSettingsApi';
import { mergeFeatureSettings } from '@/utils/featureSettings';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser } from '@/constants/platformAccess';
import { FEATURE_SETTINGS_TABS, FEATURE_SETTINGS_FIELDS, FEATURE_SETTINGS_SELECTS, CUSTOMER_FIELD_SECTIONS } from '@/config/featureSettingsFields';
import { PATHS } from '@/routes/paths';
import FeatureEngineRegistryPanel, { ENGINE_REGISTRY_TABS, ENGINE_REGISTRY_TAB_IDS } from './FeatureEngineRegistryPanel';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';

const COMPLIANCE_TABS = FEATURE_SETTINGS_TABS;
const FIELDS = FEATURE_SETTINGS_FIELDS;
const VALID_TAB_IDS = new Set([
    ...COMPLIANCE_TABS.map((t) => t.id),
    ...ENGINE_REGISTRY_TABS.map((t) => t.id),
]);

function ToggleRow({ label, checked, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{label}</span>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
    );
}

const tabButtonStyle = (active, accent) => ({
    padding: '7px 12px',
    borderRadius: 8,
    border: active ? '2px solid #2563eb' : accent ? `2px solid ${accent.border}` : '1px solid #e2e8f0',
    background: active ? '#eff6ff' : accent ? accent.bg : '#fff',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: accent?.color,
    flexShrink: 0,
});

export default function FeatureComplianceSettingsPage() {
    const { user } = useAuth();
    const isPlatformAdmin = isPlatformAdminUser(user);
    const { selectedCompany } = useCompany();
    const { settings: loaded, refreshFeatureSettings } = useFeatureSettings();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const initialTab = tabParam && VALID_TAB_IDS.has(tabParam)
        ? tabParam
        : (isPlatformAdmin ? 'engine-module' : 'customer');
    const [tab, setTab] = useState(initialTab);
    const [draft, setDraft] = useState(() => mergeFeatureSettings(null));
    const [saving, setSaving] = useState(false);

    const isEngineTab = ENGINE_REGISTRY_TAB_IDS.has(tab);

    useEffect(() => {
        setDraft(mergeFeatureSettings(loaded));
    }, [loaded]);

    useEffect(() => {
        if (tabParam && VALID_TAB_IDS.has(tabParam) && tabParam !== tab) {
            setTab(tabParam);
        }
    }, [tabParam, tab]);

    useEffect(() => {
        if (!isPlatformAdmin && isEngineTab) {
            setTab('customer');
            setSearchParams({ tab: 'customer' }, { replace: true });
        }
    }, [isPlatformAdmin, isEngineTab, setSearchParams]);

    const selectTab = (id) => {
        setTab(id);
        if (id === 'customer') {
            setSearchParams({ tab: 'customer' }, { replace: true });
        } else {
            setSearchParams({ tab: id }, { replace: true });
        }
    };

    const setFlag = (section, key, val) => {
        setDraft((p) => {
            const next = { ...p, [section]: { ...p[section], [key]: val } };
            if (section === 'accounting' && key === 'enableScanEntry') {
                next.accounting = { ...next.accounting, enableAiSmartImport: val, enableScanEntry: val };
            }
            return next;
        });
    };

    const enableAllKycFields = () => {
        setDraft((p) => {
            const next = { ...p, customer: { ...p.customer } };
            for (const sec of CUSTOMER_FIELD_SECTIONS) {
                for (const [key] of sec.fields) {
                    if (key.startsWith('enable')) next.customer[key] = true;
                }
            }
            return next;
        });
        toast.success('All Customer / KYC toggles turned ON — click Save settings');
    };

    const handleSave = async () => {
        if (!selectedCompany?._id) {
            toast.error('Select a company from the top bar first');
            return;
        }
        setSaving(true);
        try {
            const mergedCustomer = { ...mergeFeatureSettings(null).customer, ...draft.customer };
            await updateCompanyFeatureSettings({ ...draft, customer: mergedCustomer });
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
        <div style={{ padding: '24px 30px', maxWidth: 960, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <ModuleHomeBackLink to={PATHS.SETTINGS.HOME} label="Back to Admin Home" />
            <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                <Link to={PATHS.SETTINGS.HOME} style={{ color: '#2563eb', textDecoration: 'none' }}>Admin</Link>
                {' / '}
                <span style={{ fontWeight: 600, color: '#334155' }}>Feature Configuration Engine</span>
            </div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Feature Configuration Engine</h1>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>
                Company: <strong>{selectedCompany?.companyName || '—'}</strong>. Overrides apply on top of platform defaults.
                Disabled features hide menus and block related APIs. Existing data is never deleted.
            </p>
            {isPlatformAdmin && (
                <div
                    style={{
                        margin: '0 0 16px',
                        padding: '12px 16px',
                        background: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 600 }}>
                        Industry Template Master — platform templates for Electronics, Textile, Exporter, and more.
                    </div>
                    <Link
                        to={PATHS.SETTINGS.INDUSTRY_TEMPLATES}
                        style={{
                            padding: '8px 14px',
                            background: '#0d9488',
                            color: '#fff',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Open Industry Template Master
                    </Link>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
                {isPlatformAdmin && (
                    <>
                        <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', paddingRight: 4 }}>
                            Engine
                        </span>
                        {ENGINE_REGISTRY_TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => selectTab(t.id)}
                                style={tabButtonStyle(tab === t.id, tab === t.id ? null : { border: '#ddd6fe', bg: '#f5f3ff', color: '#6d28d9' })}
                            >
                                {t.label}
                            </button>
                        ))}
                        <span style={{ alignSelf: 'center', width: 1, height: 24, background: '#e2e8f0', margin: '0 4px' }} />
                        <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', paddingRight: 4 }}>
                            Company
                        </span>
                    </>
                )}
                {COMPLIANCE_TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTab(t.id)}
                        style={tabButtonStyle(
                            tab === t.id,
                            t.id === 'customer' && tab !== t.id ? { border: '#99f6e4', bg: '#f0fdfa', color: '#0f766e' } : null,
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {isEngineTab && isPlatformAdmin ? (
                <FeatureEngineRegistryPanel activeTabId={tab} />
            ) : (
                <>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        {tab === 'industry' && (
                            <>
                                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                                    Per-company industry / production template. Other tabs (including <strong>Customer</strong>) are common across all industries.
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
                        {tab === 'ui' && (
                            <p style={{ margin: '0 0 16px', padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
                                Logo controls — 3 toggles below. Untick both logo options for Handloom / non-JSK companies. If you only see 1 toggle, restart frontend and hard-refresh (Ctrl+Shift+R).
                            </p>
                        )}
                        {tab === 'customer' && (
                            <>
                                <p style={{ margin: '0 0 8px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, fontSize: 13, color: '#047857', fontWeight: 600 }}>
                                    KYC / Tax / Banking module — {CUSTOMER_FIELD_SECTIONS.reduce((n, s) => n + s.fields.length, 0)} toggles below.
                                </p>
                                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                                    <strong>Customer Master fields</strong> — controls tabs on{' '}
                                    <Link to="/customers/list" style={{ fontWeight: 700 }}>Customer Master</Link>.
                                    Turn ON → <strong>Save settings</strong> → hard-refresh Customer add/edit (Ctrl+Shift+R).
                                </p>
                            </>
                        )}
                        {tab !== 'industry' && (FEATURE_SETTINGS_SELECTS[tab] || []).map((sel) => (
                            <div key={sel.key} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <label style={{ display: 'block', fontSize: 14, color: '#334155', fontWeight: 500, marginBottom: 6 }}>
                                    {sel.label}
                                </label>
                                <select
                                    value={draft[tab]?.[sel.key] ?? sel.options[0]?.value}
                                    onChange={(e) => setFlag(tab, sel.key, e.target.value)}
                                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, minWidth: 280 }}
                                >
                                    {sel.options.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                        {tab === 'accounting' && !!(draft.accounting?.enableScanEntry || draft.accounting?.enableAiSmartImport) && (
                            <p style={{ margin: '0 0 12px', padding: '12px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af' }}>
                                AI Smart Import is enabled. Open{' '}
                                <Link to="/documents/smart-import" style={{ fontWeight: 700 }}>AI Smart Import Hub</Link>
                                {' '}or expand <strong>Documents</strong> in the sidebar.
                            </p>
                        )}
                        {tab === 'customer' && CUSTOMER_FIELD_SECTIONS.map((sec) => (
                            <div key={sec.id} style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                                    {sec.title}
                                </h3>
                                {sec.fields.map(([key, label]) => (
                                    <ToggleRow
                                        key={key}
                                        label={label}
                                        checked={!!draft.customer?.[key]}
                                        onChange={(v) => setFlag('customer', key, v)}
                                    />
                                ))}
                            </div>
                        ))}
                        {tab !== 'industry' && tab !== 'customer' && section.map(([key, label]) => (
                            <ToggleRow
                                key={key}
                                label={label}
                                checked={
                                    tab === 'accounting' && key === 'enableScanEntry'
                                        ? !!(draft[tab]?.enableScanEntry || draft[tab]?.enableAiSmartImport)
                                        : !!draft[tab]?.[key]
                                }
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

                    {tab === 'customer' && (
                        <button
                            type="button"
                            onClick={enableAllKycFields}
                            disabled={saving || !selectedCompany?._id}
                            style={{ padding: '10px 20px', marginRight: 12, background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
                        >
                            Enable all KYC fields
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !selectedCompany?._id}
                        style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}
                    >
                        {saving ? 'Saving...' : 'Save company settings'}
                    </button>
                </>
            )}
        </div>
    );
}
