import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { CUSTOMER_DOCUMENT_TYPES } from '@/config/customerKyc.config';
import { SUPPLIER_DOCUMENT_TYPES } from '@/config/supplierKyc.config';
import { emptyDocumentRule, mergeDocumentRules } from '@/constants/documentsKycTemplate.constants';
import {
    getDocumentsKycRegistry,
    updateTemplateDocumentsKycSettings,
    getCompanyDocumentsKycOverride,
    upsertCompanyDocumentsKycOverride,
    previewDocumentsKycSettings,
} from '@/services/documentsKycTemplateSettingsApi';
import { apiClient } from '@/config/apiClient';
import { useToast } from '@/components/ui/Toast';

const inp = {
    height: 28, fontSize: 11, padding: '0 6px',
    border: '1px solid #d1d5db', borderRadius: 4, width: '100%', boxSizing: 'border-box',
};

const th = { padding: 6, fontSize: 10, fontWeight: 700, color: '#64748b', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: 6, fontSize: 11, borderTop: '1px solid #f1f5f9', verticalAlign: 'middle' };

const PARTY_TABS = [
    { id: 'customer', label: 'Customer Documents' },
    { id: 'supplier', label: 'Supplier Documents' },
];

function defsForParty(party, registry) {
    const list = party === 'customer'
        ? (registry.customerDocuments?.length ? registry.customerDocuments : CUSTOMER_DOCUMENT_TYPES.map((d) => ({ documentType: d.id, label: d.label })))
        : (registry.supplierDocuments?.length ? registry.supplierDocuments : SUPPLIER_DOCUMENT_TYPES.map((d) => ({ documentType: d.id, label: d.label })));
    return list.map((d) => ({
        documentType: d.documentType || d.id,
        label: d.label,
        supportsExpiry: d.supportsExpiry,
        defaultReminderDays: d.defaultReminderDays,
    }));
}

export default function IndustryTemplateDocumentsKycPanel({ template, onSaved, sectionId }) {
    const { addToast } = useToast();
    const [registry, setRegistry] = useState({ customerDocuments: [], supplierDocuments: [] });
    const [partyTab, setPartyTab] = useState('customer');
    const [templateRules, setTemplateRules] = useState({ customerDocuments: {}, supplierDocuments: {} });
    const [overrideRules, setOverrideRules] = useState({ customerDocuments: {}, supplierDocuments: {} });
    const [companies, setCompanies] = useState([]);
    const [previewCompanyId, setPreviewCompanyId] = useState('');
    const [overrideCompanyId, setOverrideCompanyId] = useState('');
    const [preview, setPreview] = useState(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savingOverride, setSavingOverride] = useState(false);
    const [mode, setMode] = useState('template');

    const isLegacyElectronics = template?.templateCode === 'ELECTRONICS_JSK';
    const definitions = useMemo(() => defsForParty(partyTab, registry), [partyTab, registry]);

    useEffect(() => {
        getDocumentsKycRegistry().then((r) => {
            if (r) setRegistry(r);
        }).catch(() => {});
        apiClient.get('/companies/active').then((res) => setCompanies(res.data?.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        const ds = template?.templateSettings?.documentSettings || {};
        setTemplateRules({
            customerDocuments: mergeDocumentRules(ds.customerDocuments || {}, {}, defsForParty('customer', registry)),
            supplierDocuments: mergeDocumentRules(ds.supplierDocuments || {}, {}, defsForParty('supplier', registry)),
        });
    }, [template, registry]);

    const loadOverride = useCallback(async (companyId) => {
        if (!companyId) { setOverrideRules({ customerDocuments: {}, supplierDocuments: {} }); return; }
        try {
            const data = await getCompanyDocumentsKycOverride(companyId);
            setOverrideRules({
                customerDocuments: mergeDocumentRules({}, data?.customerDocuments || {}, defsForParty('customer', registry)),
                supplierDocuments: mergeDocumentRules({}, data?.supplierDocuments || {}, defsForParty('supplier', registry)),
            });
        } catch {
            setOverrideRules({ customerDocuments: {}, supplierDocuments: {} });
        }
    }, [registry]);

    useEffect(() => {
        if (overrideCompanyId) loadOverride(overrideCompanyId);
    }, [overrideCompanyId, loadOverride]);

    const activeBucket = mode === 'template' ? templateRules : overrideRules;
    const setActiveBucket = mode === 'template' ? setTemplateRules : setOverrideRules;
    const activeRules = activeBucket[partyTab === 'customer' ? 'customerDocuments' : 'supplierDocuments'] || {};

    const setActiveRules = (updater) => {
        const key = partyTab === 'customer' ? 'customerDocuments' : 'supplierDocuments';
        setActiveBucket((prev) => {
            const nextRules = typeof updater === 'function' ? updater(prev[key] || {}) : updater;
            return { ...prev, [key]: nextRules };
        });
    };

    const updateRule = (documentType, patch) => {
        setActiveRules((prev) => ({
            ...prev,
            [documentType]: { ...emptyDocumentRule(), ...(prev[documentType] || {}), ...patch },
        }));
    };

    const bulkUpdateColumn = (column, value) => {
        setActiveRules((prev) => {
            const next = { ...prev };
            for (const def of definitions) {
                next[def.documentType] = { ...emptyDocumentRule(def), ...(next[def.documentType] || {}), [column]: value };
            }
            return next;
        });
    };

    const handleSaveTemplate = async () => {
        if (!template?._id) return;
        setSavingTemplate(true);
        try {
            await updateTemplateDocumentsKycSettings(template._id, templateRules);
            addToast('Documents / KYC template rules saved', 'success');
            onSaved?.();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save document rules', 'error');
        } finally {
            setSavingTemplate(false);
        }
    };

    const handleSaveOverride = async () => {
        if (!overrideCompanyId) { addToast('Select a company for override', 'error'); return; }
        setSavingOverride(true);
        try {
            await upsertCompanyDocumentsKycOverride(overrideCompanyId, overrideRules);
            addToast('Company document override saved', 'success');
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save company override', 'error');
        } finally {
            setSavingOverride(false);
        }
    };

    const runPreview = async () => {
        try {
            const data = await previewDocumentsKycSettings({
                companyId: previewCompanyId || undefined,
                templateId: template?._id,
            });
            setPreview(data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Preview failed', 'error');
        }
    };

    const previewDefs = partyTab === 'customer' ? CUSTOMER_DOCUMENT_TYPES : SUPPLIER_DOCUMENT_TYPES;
    const previewDocs = preview?.[partyTab === 'customer' ? 'customerDocuments' : 'supplierDocuments'] || {};

    return (
        <div id={sectionId} style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>Documents / KYC Template Rules</h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#64748b' }}>
                Control document visibility, mandatory rules, scan/upload/download, expiry tracking, and OCR-ready flags per industry template.
                {isLegacyElectronics && ' Electronics (JSK) uses legacy Feature Configuration until you save document rules here.'}
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setMode('template')} style={{ padding: '6px 12px', borderRadius: 6, border: mode === 'template' ? '2px solid #0d9488' : '1px solid #e2e8f0', background: mode === 'template' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Template Defaults
                </button>
                <button type="button" onClick={() => setMode('override')} style={{ padding: '6px 12px', borderRadius: 6, border: mode === 'override' ? '2px solid #0d9488' : '1px solid #e2e8f0', background: mode === 'override' ? '#f0fdfa' : '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    Company Override
                </button>
                {PARTY_TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setPartyTab(t.id)}
                        style={{ padding: '6px 12px', borderRadius: 6, border: partyTab === t.id ? '2px solid #2563eb' : '1px solid #e2e8f0', background: partyTab === t.id ? '#eff6ff' : '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                    >
                        {t.label}
                    </button>
                ))}
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
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ ...th, textAlign: 'left' }}>Document Name</th>
                            {[
                                { key: 'visible', label: 'Show' },
                                { key: 'required', label: 'Required' },
                                { key: 'allowScan', label: 'Allow Scan' },
                                { key: 'allowUpload', label: 'Allow Upload' },
                                { key: 'allowDownload', label: 'Allow Download' },
                                { key: 'allowOcr', label: 'Allow OCR (Future)' },
                                { key: 'trackExpiry', label: 'Track Expiry' },
                            ].map((col) => (
                                <th key={col.key} style={th}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <span>{col.label}</span>
                                        <input type="checkbox" title={`Toggle all ${col.label}`} onChange={(e) => bulkUpdateColumn(col.key, e.target.checked)} />
                                    </div>
                                </th>
                            ))}
                            <th style={th}>Reminder Days</th>
                            <th style={th}>Default Visibility</th>
                        </tr>
                    </thead>
                    <tbody>
                        {definitions.map((def) => {
                            const rule = activeRules[def.documentType] || emptyDocumentRule(def);
                            return (
                                <tr key={def.documentType}>
                                    <td style={{ ...td, fontWeight: 600 }}>{def.label}</td>
                                    {['visible', 'required', 'allowScan', 'allowUpload', 'allowDownload', 'allowOcr', 'trackExpiry'].map((col) => (
                                        <td key={col} style={{ ...td, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={col === 'visible' ? rule.visible !== false : !!rule[col]}
                                                onChange={(e) => updateRule(def.documentType, { [col]: e.target.checked })}
                                            />
                                        </td>
                                    ))}
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            style={{ ...inp, width: 56 }}
                                            value={rule.reminderDays ?? 30}
                                            onChange={(e) => updateRule(def.documentType, { reminderDays: Number(e.target.value) || 0 })}
                                        />
                                    </td>
                                    <td style={td}>
                                        <select
                                            style={inp}
                                            value={rule.defaultVisibility || 'visible'}
                                            onChange={(e) => updateRule(def.documentType, { defaultVisibility: e.target.value })}
                                        >
                                            <option value="visible">Visible</option>
                                            <option value="hidden">Hidden</option>
                                        </select>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {mode === 'template' ? (
                    <button type="button" onClick={handleSaveTemplate} disabled={savingTemplate} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Save size={13} /> {savingTemplate ? 'Saving…' : 'Save Template Rules'}
                    </button>
                ) : (
                    <button type="button" onClick={handleSaveOverride} disabled={savingOverride} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Save size={13} /> {savingOverride ? 'Saving…' : 'Save Company Override'}
                    </button>
                )}
            </div>

            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800 }}>Preview effective rules</h4>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <select style={{ ...inp, maxWidth: 280 }} value={previewCompanyId} onChange={(e) => setPreviewCompanyId(e.target.value)}>
                        <option value="">Template only (no company override)</option>
                        {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
                    </select>
                    <button type="button" onClick={runPreview} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Eye size={13} /> Preview
                    </button>
                </div>
                {preview && (
                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                        Legacy mode: {preview.useLegacy ? 'Yes (Feature Config fallback)' : 'No (template rules active)'}
                    </p>
                )}
                {preview && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: 6, textAlign: 'left' }}>Document</th>
                                    <th style={{ padding: 6 }}>Show</th>
                                    <th style={{ padding: 6 }}>Required</th>
                                    <th style={{ padding: 6 }}>Scan</th>
                                    <th style={{ padding: 6 }}>Expiry</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewDefs.map(({ id, label }) => {
                                    const rule = previewDocs[id] || {};
                                    const visible = preview.useLegacy
                                        ? 'Legacy'
                                        : (rule.visible === false ? 'Hidden' : 'Visible');
                                    return (
                                        <tr key={id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: 6 }}>{label}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{visible}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{rule.required ? 'Yes' : 'No'}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{rule.allowScan !== false ? 'Yes' : 'No'}</td>
                                            <td style={{ padding: 6, textAlign: 'center' }}>{rule.trackExpiry ? 'Yes' : 'No'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
