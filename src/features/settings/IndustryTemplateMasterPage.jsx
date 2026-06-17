import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Pencil, Eye, ToggleLeft, ToggleRight, Check, X } from 'lucide-react';
import {
    getIndustryTemplates,
    createIndustryTemplate,
    updateIndustryTemplate,
    toggleIndustryTemplateActive,
    getIndustryTemplate,
} from '@/services/industryTemplateApi';
import IndustryTemplateCustomerFieldsPanel from './IndustryTemplateCustomerFieldsPanel';
import IndustryTemplateSupplierFieldsPanel from './IndustryTemplateSupplierFieldsPanel';
import IndustryTemplateItemFieldsPanel from './IndustryTemplateItemFieldsPanel';
import IndustryTemplateDocumentsKycPanel from './IndustryTemplateDocumentsKycPanel';
import IndustryTemplateModulesPanel from './IndustryTemplateModulesPanel';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const BLANK = {
    templateName: '',
    templateCode: '',
    description: '',
    isActive: true,
    isDefaultTemplate: false,
};

const SETTINGS_SECTIONS = [
    'moduleSettings',
    'fieldSettings',
    'workflowSettings',
    'sopSettings',
    'productionProcessSettings',
    'documentSettings',
    'reportSettings',
    'dashboardSettings',
];

const SETTINGS_LABELS = {
    moduleSettings: 'Module Settings',
    fieldSettings: 'Field Settings',
    workflowSettings: 'Workflow Settings',
    sopSettings: 'SOP Settings',
    productionProcessSettings: 'Production Process Settings',
    documentSettings: 'Document Settings',
    reportSettings: 'Report Settings',
    dashboardSettings: 'Dashboard Settings',
};

const inp = {
    height: 30, fontSize: 12, padding: '0 8px',
    border: '1px solid #d1d5db', borderRadius: 5,
    background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const th = { padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
const td = { padding: '5px 10px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };

const formatDate = (val) => {
    if (!val) return '—';
    return new Date(val).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function IndustryTemplateMasterPage() {
    const { addToast } = useToast();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ ...BLANK });
    const [editId, setEditId] = useState(null);
    const [viewItem, setViewItem] = useState(null);
    const [viewDetail, setViewDetail] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getIndustryTemplates();
            setTemplates(data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to load industry templates', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setForm({ ...BLANK });
        setEditId(null);
        setViewItem(null);
        setShowForm(true);
    };

    const openEdit = (t) => {
        setForm({
            templateName: t.templateName || '',
            templateCode: t.templateCode || '',
            description: t.description || '',
            isActive: t.isActive !== false,
            isDefaultTemplate: !!t.isDefaultTemplate,
        });
        setEditId(t._id);
        setViewItem(null);
        setShowForm(true);
    };

    const openView = async (t) => {
        setViewItem(t);
        setShowForm(false);
        setEditId(null);
        try {
            const full = await getIndustryTemplate(t._id);
            setViewDetail(full);
        } catch {
            setViewDetail(t);
        }
    };

    const closePanels = () => {
        setShowForm(false);
        setViewItem(null);
        setViewDetail(null);
        setEditId(null);
        setForm({ ...BLANK });
    };

    const handleNameChange = (val) => {
        setForm((f) => ({
            ...f,
            templateName: val,
            templateCode: editId
                ? f.templateCode
                : val.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 30),
        }));
    };

    const handleSave = async () => {
        if (!form.templateName.trim()) { addToast('Template name is required', 'error'); return; }
        if (!form.templateCode.trim()) { addToast('Template code is required', 'error'); return; }
        setSaving(true);
        try {
            if (editId) {
                await updateIndustryTemplate(editId, form);
                addToast('Industry template updated', 'success');
            } else {
                await createIndustryTemplate(form);
                addToast('Industry template created', 'success');
            }
            closePanels();
            load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save template', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (t) => {
        try {
            await toggleIndustryTemplateActive(t._id);
            addToast(t.isActive ? 'Template deactivated' : 'Template activated', 'success');
            load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to update status', 'error');
        }
    };

    if (loading) return <BrandedLoader message="Loading industry templates…" />;

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={15} style={{ color: '#0d9488' }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Industry Template Master</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>
                        {templates.length} templates
                    </span>
                </div>
                {!showForm && (
                    <button
                        type="button"
                        onClick={openAdd}
                        style={{ height: 30, padding: '0 12px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                        <Plus size={13} /> Add Template
                    </button>
                )}
            </div>

            <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                Phase 2–4: Customer, Supplier, and Item Master field settings per template. JSK Electronics uses legacy Feature Configuration until template rules are saved.
            </p>

            {showForm && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                        {editId ? 'Edit Industry Template' : 'Add Industry Template'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Template Name *</label>
                            <input style={inp} value={form.templateName} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Electronics Manufacturing" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Template Code *</label>
                            <input style={inp} value={form.templateCode} onChange={(e) => setForm((f) => ({ ...f, templateCode: e.target.value.toUpperCase() }))} placeholder="ELECTRONICS_JSK" />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Description</label>
                        <textarea
                            style={{ ...inp, height: 60, padding: '6px 8px', resize: 'vertical' }}
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Brief description of this industry template"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                            Active
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.isDefaultTemplate} onChange={(e) => setForm((f) => ({ ...f, isDefaultTemplate: e.target.checked }))} />
                            Default Template
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={closePanels} style={{ height: 30, padding: '0 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <X size={13} /> Cancel
                        </button>
                        <button type="button" onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 12px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Check size={13} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {viewItem && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '78vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 8, position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{viewItem.templateName}</span>
                        <button type="button" onClick={closePanels} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'sticky', top: 36, background: '#fff', zIndex: 2, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                        {[
                            { id: 'customer-master-field-settings', label: 'Customer Fields' },
                            { id: 'supplier-master-field-settings', label: 'Supplier Fields' },
                            { id: 'item-master-field-settings', label: 'Item Fields' },
                            { id: 'documents-kyc-template-rules', label: 'Documents / KYC' },
                            { id: 'industry-template-modules', label: 'Modules' },
                        ].map((link) => (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                style={{ height: 26, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', fontSize: 10, fontWeight: 700, cursor: 'pointer', color: '#334155' }}
                            >
                                {link.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
                        <div><strong>Code:</strong> {viewItem.templateCode}</div>
                        <div><strong>Status:</strong> {viewItem.isActive ? 'Active' : 'Inactive'}</div>
                        <div><strong>Default:</strong> {viewItem.isDefaultTemplate ? 'Yes' : 'No'}</div>
                        <div><strong>Created:</strong> {formatDate(viewItem.createdAt)}</div>
                        <div><strong>Updated:</strong> {formatDate(viewItem.updatedAt)}</div>
                    </div>
                    {viewItem.description && (
                        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{viewItem.description}</p>
                    )}
                    <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Template Settings Structure (empty — future use)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                            {SETTINGS_SECTIONS.map((key) => (
                                <div key={key} style={{ fontSize: 11, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    {SETTINGS_LABELS[key]} — empty
                                </div>
                            ))}
                        </div>
                    </div>
                    <IndustryTemplateCustomerFieldsPanel
                        sectionId="customer-master-field-settings"
                        template={viewDetail || viewItem}
                        onSaved={async () => {
                            await load();
                            if (viewItem?._id) {
                                const full = await getIndustryTemplate(viewItem._id);
                                setViewDetail(full);
                            }
                        }}
                    />
                    <IndustryTemplateSupplierFieldsPanel
                        sectionId="supplier-master-field-settings"
                        template={viewDetail || viewItem}
                        onSaved={async () => {
                            await load();
                            if (viewItem?._id) {
                                const full = await getIndustryTemplate(viewItem._id);
                                setViewDetail(full);
                            }
                        }}
                    />
                    <IndustryTemplateItemFieldsPanel
                        sectionId="item-master-field-settings"
                        template={viewDetail || viewItem}
                        onSaved={async () => {
                            await load();
                            if (viewItem?._id) {
                                const full = await getIndustryTemplate(viewItem._id);
                                setViewDetail(full);
                            }
                        }}
                    />
                    <IndustryTemplateDocumentsKycPanel
                        sectionId="documents-kyc-template-rules"
                        template={viewDetail || viewItem}
                        onSaved={async () => {
                            await load();
                            if (viewItem?._id) {
                                const full = await getIndustryTemplate(viewItem._id);
                                setViewDetail(full);
                            }
                        }}
                    />
                    <IndustryTemplateModulesPanel
                        sectionId="industry-template-modules"
                        template={viewDetail || viewItem}
                        onSaved={async () => {
                            await load();
                            if (viewItem?._id) {
                                const full = await getIndustryTemplate(viewItem._id);
                                setViewDetail(full);
                            }
                        }}
                    />

                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={th}>Template Name</th>
                            <th style={th}>Code</th>
                            <th style={th}>Status</th>
                            <th style={th}>Default</th>
                            <th style={th}>Created</th>
                            <th style={th}>Updated</th>
                            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {templates.map((t) => (
                            <tr key={t._id}>
                                <td style={td}><strong>{t.templateName}</strong></td>
                                <td style={td}><code style={{ fontSize: 11 }}>{t.templateCode}</code></td>
                                <td style={td}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: t.isActive ? '#dcfce7' : '#fee2e2', color: t.isActive ? '#166534' : '#991b1b' }}>
                                        {t.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={td}>{t.isDefaultTemplate ? 'Yes' : '—'}</td>
                                <td style={td}>{formatDate(t.createdAt)}</td>
                                <td style={td}>{formatDate(t.updatedAt)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        <button type="button" title="View" onClick={() => openView(t)} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Eye size={13} />
                                        </button>
                                        <button type="button" title="Edit" onClick={() => openEdit(t)} style={{ width: 28, height: 28, border: '1px solid #dbeafe', borderRadius: 5, background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                            <Pencil size={13} />
                                        </button>
                                        <button type="button" title={t.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggleActive(t)} disabled={t.isDefaultTemplate && t.isActive} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', cursor: t.isDefaultTemplate && t.isActive ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: t.isDefaultTemplate && t.isActive ? 0.4 : 1 }}>
                                            {t.isActive ? <ToggleRight size={14} color="#16a34a" /> : <ToggleLeft size={14} color="#9ca3af" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
