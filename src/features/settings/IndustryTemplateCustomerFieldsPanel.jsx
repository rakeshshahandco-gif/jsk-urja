import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { CUSTOMER_MASTER_TEMPLATE_FIELDS } from '@/constants/customerMasterTemplateFields';
import {
    getCustomerFieldRegistry,
    updateTemplateCustomerFieldSettings,
    getCompanyCustomerFieldOverride,
    upsertCompanyCustomerFieldOverride,
    previewCustomerFieldSettings,
} from '@/services/customerTemplateFieldSettingsApi';
import { apiClient } from '@/config/apiClient';
import { useToast } from '@/components/ui/Toast';

const inp = {
    height: 28, fontSize: 11, padding: '0 6px',
    border: '1px solid #d1d5db', borderRadius: 4, width: '100%', boxSizing: 'border-box',
};

const emptyRule = () => ({ visible: true, required: false, readOnly: false, defaultValue: '' });

function mergeRules(base = {}, draft = {}) {
    const out = { ...base };
    for (const def of CUSTOMER_MASTER_TEMPLATE_FIELDS) {
        out[def.key] = { ...emptyRule(), ...(base[def.key] || {}), ...(draft[def.key] || {}) };
    }
    return out;
}

export default function IndustryTemplateCustomerFieldsPanel({ template, onSaved, sectionId }) {
    const { addToast } = useToast();
    const [registry, setRegistry] = useState(CUSTOMER_MASTER_TEMPLATE_FIELDS);
    const [templateRules, setTemplateRules] = useState({});
    const [overrideRules, setOverrideRules] = useState({});
    const [companies, setCompanies] = useState([]);
    const [previewCompanyId, setPreviewCompanyId] = useState('');
    const [overrideCompanyId, setOverrideCompanyId] = useState('');
    const [preview, setPreview] = useState(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savingOverride, setSavingOverride] = useState(false);
    const [mode, setMode] = useState('template');

    const isLegacyElectronics = template?.templateCode === 'ELECTRONICS_JSK';

    useEffect(() => {
        getCustomerFieldRegistry().then((r) => { if (r?.length) setRegistry(r); }).catch(() => {});
        apiClient.get('/companies/active').then((res) => setCompanies(res.data?.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        const cm = template?.templateSettings?.fieldSettings?.customerMaster || {};
        setTemplateRules(mergeRules(cm, {}));
    }, [template]);

    const loadOverride = useCallback(async (companyId) => {
        if (!companyId) { setOverrideRules({}); return; }
        try {
            const data = await getCompanyCustomerFieldOverride(companyId);
            setOverrideRules(mergeRules({}, data?.customerMaster || {}));
        } catch {
            setOverrideRules({});
        }
    }, []);

    useEffect(() => {
        if (overrideCompanyId) loadOverride(overrideCompanyId);
    }, [overrideCompanyId, loadOverride]);

    const activeRules = mode === 'template' ? templateRules : overrideRules;
    const setActiveRules = mode === 'template' ? setTemplateRules : setOverrideRules;

    const bulkUpdateColumn = (column, value) => {
        setActiveRules((prev) => {
            const next = { ...prev };
            for (const def of registry) {
                next[def.key] = { ...emptyRule(), ...(next[def.key] || {}), [column]: value };
            }
            return next;
        });
    };

    const columnAllChecked = useMemo(() => {
        const keys = registry.map((d) => d.key);
        const allShow = keys.length > 0 && keys.every((k) => activeRules[k]?.visible !== false);
        const allRequired = keys.length > 0 && keys.every((k) => !!activeRules[k]?.required);
        const allReadOnly = keys.length > 0 && keys.every((k) => !!activeRules[k]?.readOnly);
        const someShow = keys.some((k) => activeRules[k]?.visible !== false);
        const someRequired = keys.some((k) => !!activeRules[k]?.required);
        const someReadOnly = keys.some((k) => !!activeRules[k]?.readOnly);
        return {
            allShow,
            allRequired,
            allReadOnly,
            someShow,
            someRequired,
            someReadOnly,
        };
    }, [activeRules, registry]);

    const updateRule = (key, patch) => {
        setActiveRules((prev) => ({
            ...prev,
            [key]: { ...emptyRule(), ...(prev[key] || {}), ...patch },
        }));
    };

    const handleSaveTemplate = async () => {
        if (!template?._id) return;
        setSavingTemplate(true);
        try {
            await updateTemplateCustomerFieldSettings(template._id, templateRules);
            addToast('Template customer field settings saved', 'success');
            onSaved?.();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save template settings', 'error');
        } finally {
            setSavingTemplate(false);
        }
    };

    const handleSaveOverride = async () => {
        if (!overrideCompanyId) { addToast('Select a company for override', 'error'); return; }
        setSavingOverride(true);
        try {
            await upsertCompanyCustomerFieldOverride(overrideCompanyId, overrideRules);
            addToast('Company override saved', 'success');
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save company override', 'error');
        } finally {
            setSavingOverride(false);
        }
    };

    const runPreview = async () => {
        try {
            const data = await previewCustomerFieldSettings({
                companyId: previewCompanyId || undefined,
                templateId: template?._id,
            });
            setPreview(data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Preview failed', 'error');
        }
    };

    const previewRows = useMemo(() => {
        if (!preview?.fields) return [];
        return registry.map((def) => {
            const rule = preview.fields[def.key] || {};
            const visible = preview.useLegacy
                ? 'Legacy (Feature Config)'
                : (rule.visible === false ? 'Hidden' : 'Visible');
            return { ...def, visible, required: rule.required ? 'Yes' : 'No', readOnly: rule.readOnly ? 'Yes' : 'No' };
        });
    }, [preview, registry]);

    return (
        <div id={sectionId} style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>Customer Master Field Settings</h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#64748b' }}>
                Template = default rules. Company override = exception only.
                {isLegacyElectronics && ' Electronics (JSK) uses legacy behavior until you save field rules here.'}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setMode('template')} style={{ padding: '6px 12px', borderRadius: 6, border: mode === 'template' ? '2px solid #0d9488' : '1px solid #e2e8f0', background: mode === 'template' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Template Defaults
                </button>
                <button type="button" onClick={() => setMode('override')} style={{ padding: '6px 12px', borderRadius: 6, border: mode === 'override' ? '2px solid #0d9488' : '1px solid #e2e8f0', background: mode === 'override' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Company Override
                </button>
            </div>

            {mode === 'override' && (
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Company</label>
                    <select style={{ ...inp, marginTop: 4, maxWidth: 360 }} value={overrideCompanyId} onChange={(e) => setOverrideCompanyId(e.target.value)}>
                        <option value="">Select company…</option>
                        {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
                    </select>
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: 8, textAlign: 'left' }}>Field</th>
                            <th style={{ padding: 8, textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span>Show</span>
                                    <input
                                        type="checkbox"
                                        title={columnAllChecked.allShow ? 'Uncheck all Show' : 'Check all Show'}
                                        checked={columnAllChecked.allShow}
                                        ref={(el) => {
                                            if (el) {
                                                el.indeterminate = !columnAllChecked.allShow && columnAllChecked.someShow;
                                            }
                                        }}
                                        onChange={(e) => bulkUpdateColumn('visible', e.target.checked)}
                                    />
                                </div>
                            </th>
                            <th style={{ padding: 8, textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span>Required</span>
                                    <input
                                        type="checkbox"
                                        title={columnAllChecked.allRequired ? 'Uncheck all Required' : 'Check all Required'}
                                        checked={columnAllChecked.allRequired}
                                        ref={(el) => {
                                            if (el) {
                                                el.indeterminate = !columnAllChecked.allRequired && columnAllChecked.someRequired;
                                            }
                                        }}
                                        onChange={(e) => bulkUpdateColumn('required', e.target.checked)}
                                    />
                                </div>
                            </th>
                            <th style={{ padding: 8, textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span>Read Only</span>
                                    <input
                                        type="checkbox"
                                        title={columnAllChecked.allReadOnly ? 'Uncheck all Read Only' : 'Check all Read Only'}
                                        checked={columnAllChecked.allReadOnly}
                                        ref={(el) => {
                                            if (el) {
                                                el.indeterminate = !columnAllChecked.allReadOnly && columnAllChecked.someReadOnly;
                                            }
                                        }}
                                        onChange={(e) => bulkUpdateColumn('readOnly', e.target.checked)}
                                    />
                                </div>
                            </th>
                            <th style={{ padding: 8 }}>Default</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registry.map((def) => {
                            const rule = activeRules[def.key] || emptyRule();
                            return (
                                <tr key={def.key} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: 8, fontWeight: 600 }}>{def.label}</td>
                                    <td style={{ padding: 8, textAlign: 'center' }}>
                                        <input type="checkbox" checked={rule.visible !== false} onChange={(e) => updateRule(def.key, { visible: e.target.checked })} />
                                    </td>
                                    <td style={{ padding: 8, textAlign: 'center' }}>
                                        <input type="checkbox" checked={!!rule.required} onChange={(e) => updateRule(def.key, { required: e.target.checked })} />
                                    </td>
                                    <td style={{ padding: 8, textAlign: 'center' }}>
                                        <input type="checkbox" checked={!!rule.readOnly} onChange={(e) => updateRule(def.key, { readOnly: e.target.checked })} />
                                    </td>
                                    <td style={{ padding: 8 }}>
                                        <input style={inp} value={rule.defaultValue ?? ''} onChange={(e) => updateRule(def.key, { defaultValue: e.target.value })} placeholder="—" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {mode === 'template' ? (
                    <button type="button" onClick={handleSaveTemplate} disabled={savingTemplate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Save size={14} /> {savingTemplate ? 'Saving…' : 'Save Template Field Settings'}
                    </button>
                ) : (
                    <button type="button" onClick={handleSaveOverride} disabled={savingOverride || !overrideCompanyId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Save size={14} /> {savingOverride ? 'Saving…' : 'Save Company Override'}
                    </button>
                )}
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Preview / Test Mode</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Company (optional)</label>
                        <select style={{ ...inp, marginTop: 4, minWidth: 200 }} value={previewCompanyId} onChange={(e) => setPreviewCompanyId(e.target.value)}>
                            <option value="">Template only</option>
                            {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
                        </select>
                    </div>
                    <button type="button" onClick={runPreview} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Eye size={14} /> Preview Fields
                    </button>
                </div>
                {preview && (
                    <div style={{ fontSize: 11 }}>
                        <p style={{ margin: '0 0 8px' }}>
                            Mode: <strong>{preview.useLegacy ? 'Legacy (Feature Configuration)' : 'Template-driven'}</strong>
                            {' · '}Template: {preview.templateName} ({preview.templateCode})
                            {preview.hasCompanyOverride && ' · Company override applied'}
                        </p>
                        <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ padding: 6, textAlign: 'left' }}>Field</th>
                                        <th style={{ padding: 6 }}>Visible</th>
                                        <th style={{ padding: 6 }}>Required</th>
                                        <th style={{ padding: 6 }}>Read Only</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row) => (
                                        <tr key={row.key} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: 6 }}>{row.label}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{row.visible}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{row.required}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{row.readOnly}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
