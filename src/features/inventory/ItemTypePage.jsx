import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X, Zap } from 'lucide-react';
import { getItemTypes, createItemType, updateItemType, deleteItemType } from '@/services/itemTypeApi';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { useIndustryInventoryLabels } from '@/hooks/useIndustryInventoryLabels';

const BLANK = { name: '', code: '', description: '', isElectrical: false };

const inp = {
    height: 30, fontSize: 12, padding: '0 8px',
    border: '1px solid #d1d5db', borderRadius: 5,
    background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%'
};
const th = { padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
const td = { padding: '5px 10px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
const iconBtn = (color) => ({ width: 28, height: 28, border: `1px solid ${color}20`, borderRadius: 5, background: `${color}10`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color });

const ItemTypePage = () => {
    const { addToast } = useToast();
    const invLabels = useIndustryInventoryLabels();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ ...BLANK });
    const [editId, setEditId] = useState(null);  // null = add-mode
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getItemTypes();
            setTypes(data);
        } catch (err) {
            console.error('Load Error:', err);
            addToast(err?.response?.data?.message || 'Failed to load item types', 'error');
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => { setForm({ ...BLANK }); setEditId(null); setShowForm(true); };
    const openEdit = (t) => { setForm({ name: t.name, code: t.code, description: t.description || '', isElectrical: t.isElectrical || false }); setEditId(t._id); setShowForm(true); };
    const cancelForm = () => { if (window.confirm('Discard changes?')) { setShowForm(false); setEditId(null); setForm({ ...BLANK }); } };

    // Auto-generate code from name
    const handleNameChange = (val) => {
        setForm(f => ({
            ...f,
            name: val,
            code: editId ? f.code : val.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 20)
        }));
    };

    const handleSave = async () => {
        if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
        if (!form.code.trim()) { addToast('Code is required', 'error'); return; }
        setSaving(true);
        try {
            if (editId) {
                await updateItemType(editId, form);
                addToast('Item type updated!', 'success');
            } else {
                await createItemType(form);
                addToast('Item type created!', 'success');
            }
            cancelForm();
            load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save', 'error');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete item type "${name}"? This cannot be undone.`)) return;
        try {
            await deleteItemType(id);
            addToast('Deleted', 'success');
            load();
        } catch { addToast('Failed to delete item type', 'error'); }
    };

    const handleToggleActive = async (t) => {
        try {
            await updateItemType(t._id, { isActive: !t.isActive });
            addToast(t.isActive ? 'Deactivated' : 'Activated', 'success');
            load();
        } catch { addToast('Failed to update', 'error'); }
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag size={15} style={{ color: '#7c3aed' }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Item Type Master</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>{types.length} types</span>
                </div>
                {!showForm && (
                    <button onClick={openAdd}
                        style={{ height: 30, padding: '0 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} /> Add Type
                    </button>
                )}
            </div>

            {/* Add / Edit Form Panel */}
            {showForm && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                        {editId ? '✏️ Edit Item Type' : '➕ Add New Item Type'}
                    </div>

                    {/* Row 1: Name + Code */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Type Name *</label>
                            <input style={inp} value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder={invLabels.itemTypePlaceholder} autoFocus />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Code *</label>
                            <input style={{ ...inp, fontFamily: 'monospace', fontWeight: 700 }} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder={invLabels.itemTypeCodePlaceholder} />
                        </div>
                    </div>

                    {/* Row 2: Description + Toggle */}
                    <div style={{ display: 'grid', gridTemplateColumns: invLabels.showElectricalToggle ? '1fr auto' : '1fr', gap: 10, alignItems: 'end' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Description (optional)</label>
                            <input style={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description for this item type" />
                        </div>
                        {invLabels.showElectricalToggle && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                                <Zap size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />Electrical?
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30 }}>
                                <button type="button"
                                    style={{ width: 36, height: 20, borderRadius: 10, background: form.isElectrical ? '#7c3aed' : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                                    onClick={() => setForm(f => ({ ...f, isElectrical: !f.isElectrical }))}>
                                    <div style={{ position: 'absolute', top: 3, left: form.isElectrical ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                </button>
                                <span style={{ fontSize: 11, color: form.isElectrical ? '#7c3aed' : '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {form.isElectrical ? 'Yes – shows Tech Specs' : 'No'}
                                </span>
                            </div>
                        </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                        <button onClick={cancelForm} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#a78bfa' : '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Check size={13} /> {saving ? 'Saving…' : (editId ? 'Update' : 'Add Type')}
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', flex: 1 }}>
                {loading ? (
                    <BrandedLoader size={80} />
                ) : types.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 8, color: '#9ca3af' }}>
                        <Tag size={28} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: 13 }}>No item types yet</span>
                        <button onClick={openAdd} style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>+ Add your first type</button>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>#</th>
                                <th style={th}>Code</th>
                                <th style={th}>Type Name</th>
                                <th style={th}>Description</th>
                                {invLabels.showElectricalColumn && <th style={{ ...th, textAlign: 'center' }}>⚡ Electrical</th>}
                                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                                <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {types.map((t, i) => {
                                const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
                                return (
                                    <tr key={t._id} style={{ background: rowBg }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                                        <td style={{ ...td, color: '#9ca3af', fontSize: 10 }}>{i + 1}</td>
                                        <td style={td}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                                        </td>
                                        <td style={{ ...td, fontWeight: 600 }}>{t.name}</td>
                                        <td style={{ ...td, color: '#6b7280', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                                        {invLabels.showElectricalColumn && (
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            {t.isElectrical
                                                ? <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '1px 8px', borderRadius: 4 }}>⚡ Yes</span>
                                                : <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>}
                                        </td>
                                        )}
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <button onClick={() => handleToggleActive(t)}
                                                style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: t.isActive ? '#dcfce7' : '#fee2e2', color: t.isActive ? '#166534' : '#991b1b' }}>
                                                {t.isActive ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                <button onClick={() => openEdit(t)} title="Edit" style={iconBtn('#2563eb')}><Pencil size={11} /></button>
                                                <button onClick={() => handleDelete(t._id, t.name)} title="Delete" style={iconBtn('#dc2626')}><Trash2 size={11} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ItemTypePage;
