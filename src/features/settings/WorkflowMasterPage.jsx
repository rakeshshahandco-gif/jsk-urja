import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Check, X, ArrowUp, ArrowDown } from 'lucide-react';
import { getIndustryTemplates } from '@/services/industryTemplateApi';
import {
    getWorkflowMasters,
    createWorkflowMaster,
    updateWorkflowMaster,
    toggleWorkflowMasterActive,
    deleteWorkflowMaster,
} from '@/services/workflowMasterApi';
import {
    WORKFLOW_STAGE_TYPE_LABELS,
    WORKFLOW_STAGE_TYPES,
    emptyStage,
    presetToStages,
} from '@/constants/workflowMaster.constants';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const BLANK = {
    workflowName: '',
    industryTemplateRef: '',
    description: '',
    isActive: true,
    stages: [],
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

export default function WorkflowMasterPage() {
    const { addToast } = useToast();
    const [workflows, setWorkflows] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ ...BLANK, stages: [emptyStage(1)] });
    const [editId, setEditId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [wf, tpl] = await Promise.all([
                getWorkflowMasters(),
                getIndustryTemplates(),
            ]);
            setWorkflows(wf);
            setTemplates(tpl);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to load workflows', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { load(); }, [load]);

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm({ ...BLANK, stages: [emptyStage(1)] });
    };

    const openAdd = () => {
        setForm({ ...BLANK, stages: [emptyStage(1)] });
        setEditId(null);
        setShowForm(true);
    };

    const openEdit = (w) => {
        setForm({
            workflowName: w.workflowName || '',
            industryTemplateRef: w.industryTemplateRef?._id || w.industryTemplateRef || '',
            description: w.description || '',
            isActive: w.isActive !== false,
            stages: (w.stages || []).length ? w.stages.map((s, i) => ({ ...emptyStage(i + 1), ...s, sequenceNo: i + 1 })) : [emptyStage(1)],
        });
        setEditId(w._id);
        setShowForm(true);
    };

    const updateStage = (idx, patch) => {
        setForm((f) => {
            const stages = [...(f.stages || [])];
            stages[idx] = { ...stages[idx], ...patch };
            return { ...f, stages };
        });
    };

    const addStage = () => {
        setForm((f) => ({ ...f, stages: [...(f.stages || []), emptyStage((f.stages?.length || 0) + 1)] }));
    };

    const removeStage = (idx) => {
        setForm((f) => {
            const stages = (f.stages || []).filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequenceNo: i + 1 }));
            return { ...f, stages: stages.length ? stages : [emptyStage(1)] };
        });
    };

    const moveStage = (idx, dir) => {
        setForm((f) => {
            const stages = [...(f.stages || [])];
            const next = idx + dir;
            if (next < 0 || next >= stages.length) return f;
            [stages[idx], stages[next]] = [stages[next], stages[idx]];
            return { ...f, stages: stages.map((s, i) => ({ ...s, sequenceNo: i + 1 })) };
        });
    };

    const loadPreset = (key) => {
        setForm((f) => ({ ...f, stages: presetToStages(key) }));
    };

    const handleSave = async () => {
        if (!String(form.workflowName || '').trim()) {
            addToast('Workflow name is required', 'error');
            return;
        }
        if (!form.industryTemplateRef) {
            addToast('Select an industry template', 'error');
            return;
        }
        const stages = (form.stages || []).filter((s) => String(s.stageName || '').trim());
        if (!stages.length) {
            addToast('Add at least one stage', 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                workflowName: form.workflowName.trim(),
                industryTemplateRef: form.industryTemplateRef,
                description: form.description || '',
                isActive: form.isActive !== false,
                stages: stages.map((s, i) => ({ ...s, sequenceNo: i + 1 })),
            };
            if (editId) {
                await updateWorkflowMaster(editId, payload);
                addToast('Workflow updated', 'success');
            } else {
                await createWorkflowMaster(payload);
                addToast('Workflow created', 'success');
            }
            closeForm();
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (w) => {
        try {
            await toggleWorkflowMasterActive(w._id);
            addToast(`Workflow ${w.isActive ? 'deactivated' : 'activated'}`, 'success');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Toggle failed', 'error');
        }
    };

    const handleDelete = async (w) => {
        if (!window.confirm(`Delete workflow "${w.workflowName}"?`)) return;
        try {
            await deleteWorkflowMaster(w._id);
            addToast('Workflow deleted', 'success');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Delete failed', 'error');
        }
    };

    if (loading) return <BrandedLoader message="Loading Workflow Master..." />;

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitBranch size={20} color="#0d9488" />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Workflow Master</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Phase 6 — configurable process flows per industry template</span>
                </div>
                <button type="button" onClick={openAdd} style={{ height: 32, padding: '0 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> New Workflow
                </button>
            </div>

            {showForm && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <strong style={{ fontSize: 13 }}>{editId ? 'Edit Workflow' : 'Create Workflow'}</strong>
                        <button type="button" onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280' }}>Workflow Name *</label>
                            <input style={inp} value={form.workflowName} onChange={(e) => setForm((f) => ({ ...f, workflowName: e.target.value }))} placeholder="e.g. Electronics Production Workflow" />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280' }}>Industry Template *</label>
                            <select style={{ ...inp, cursor: 'pointer' }} value={form.industryTemplateRef} onChange={(e) => setForm((f) => ({ ...f, industryTemplateRef: e.target.value }))}>
                                <option value="">Select template…</option>
                                {templates.map((t) => (
                                    <option key={t._id} value={t._id}>{t.templateName} ({t.templateCode})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280' }}>Description</label>
                        <textarea style={{ ...inp, height: 56, padding: '6px 8px', resize: 'vertical' }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12 }}>
                        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} /> Active
                    </label>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', alignSelf: 'center' }}>Load preset:</span>
                        {['ELECTRONICS', 'TEXTILE', 'EXPORTER'].map((k) => (
                            <button key={k} type="button" onClick={() => loadPreset(k)} style={{ height: 26, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{k}</button>
                        ))}
                        <button type="button" onClick={addStage} style={{ height: 26, padding: '0 10px', border: '1px solid #0d9488', borderRadius: 6, background: '#f0fdfa', fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>+ Add Stage</button>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                            <thead>
                                <tr>
                                    <th style={th}>Seq</th>
                                    <th style={{ ...th, textAlign: 'left' }}>Stage Name</th>
                                    <th style={th}>Stage Type</th>
                                    <th style={th}>Start</th>
                                    <th style={th}>Complete</th>
                                    <th style={th}>Skip</th>
                                    <th style={th}>Remarks Req.</th>
                                    <th style={th}>Attach Req.</th>
                                    <th style={th}>Order</th>
                                    <th style={th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {(form.stages || []).map((stage, idx) => (
                                    <tr key={stage._id || idx}>
                                        <td style={{ ...td, textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={td}>
                                            <input style={inp} value={stage.stageName || ''} onChange={(e) => updateStage(idx, { stageName: e.target.value })} placeholder="Stage name" />
                                        </td>
                                        <td style={td}>
                                            <select style={{ ...inp, minWidth: 140 }} value={stage.stageType || 'general'} onChange={(e) => updateStage(idx, { stageType: e.target.value })}>
                                                {WORKFLOW_STAGE_TYPES.map((t) => (
                                                    <option key={t} value={t}>{WORKFLOW_STAGE_TYPE_LABELS[t] || t}</option>
                                                ))}
                                            </select>
                                        </td>
                                        {['allowStart', 'allowComplete', 'allowSkip', 'remarksRequired', 'attachmentRequired'].map((col) => (
                                            <td key={col} style={{ ...td, textAlign: 'center' }}>
                                                <input type="checkbox" checked={!!stage[col]} onChange={(e) => updateStage(idx, { [col]: e.target.checked })} />
                                            </td>
                                        ))}
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <button type="button" title="Move up" disabled={idx === 0} onClick={() => moveStage(idx, -1)} style={{ border: 'none', background: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}><ArrowUp size={14} /></button>
                                            <button type="button" title="Move down" disabled={idx === (form.stages?.length || 0) - 1} onClick={() => moveStage(idx, 1)} style={{ border: 'none', background: 'none', cursor: idx === (form.stages?.length || 0) - 1 ? 'not-allowed' : 'pointer', opacity: idx === (form.stages?.length || 0) - 1 ? 0.3 : 1 }}><ArrowDown size={14} /></button>
                                        </td>
                                        <td style={td}>
                                            <button type="button" onClick={() => removeStage(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }} title="Remove stage"><Trash2 size={14} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={closeForm} style={{ height: 30, padding: '0 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        <button type="button" onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 12px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Check size={13} /> {saving ? 'Saving…' : 'Save Workflow'}
                        </button>
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={th}>Workflow Name</th>
                            <th style={th}>Industry Template</th>
                            <th style={th}>Stages</th>
                            <th style={th}>Status</th>
                            <th style={th}>Updated</th>
                            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workflows.length === 0 && (
                            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No workflows yet. Click New Workflow to create one.</td></tr>
                        )}
                        {workflows.map((w) => (
                            <tr key={w._id}>
                                <td style={td}><strong>{w.workflowName}</strong><div style={{ fontSize: 10, color: '#94a3b8' }}>{w.workflowCode}</div></td>
                                <td style={td}>{w.industryTemplateRef?.templateName || '—'}<div style={{ fontSize: 10, color: '#94a3b8' }}>{w.industryTemplateRef?.templateCode}</div></td>
                                <td style={td}>{w.stages?.length || 0}</td>
                                <td style={td}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: w.isActive ? '#dcfce7' : '#fee2e2', color: w.isActive ? '#166534' : '#991b1b' }}>
                                        {w.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={td}>{formatDate(w.updatedAt)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        <button type="button" title="Edit" onClick={() => openEdit(w)} style={{ width: 28, height: 28, border: '1px solid #dbeafe', borderRadius: 5, background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}><Pencil size={13} /></button>
                                        <button type="button" title={w.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggle(w)} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {w.isActive ? <ToggleRight size={14} color="#16a34a" /> : <ToggleLeft size={14} color="#9ca3af" />}
                                        </button>
                                        <button type="button" title="Delete" onClick={() => handleDelete(w)} style={{ width: 28, height: 28, border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}><Trash2 size={13} /></button>
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
