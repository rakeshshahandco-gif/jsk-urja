import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { getItemGroups, createItemGroup, updateItemGroup, deleteItemGroup } from '@/services/itemGroupApi';
import { useToast } from '@/components/ui/Toast';

const BLANK = { name: '', code: '', description: '' };

const inp = {
    height: 30, fontSize: 12, padding: '0 8px',
    border: '1px solid #d1d5db', borderRadius: 5,
    background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%'
};
const th = { padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
const td = { padding: '5px 10px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
const iconBtn = (color) => ({ width: 28, height: 28, border: `1px solid ${color}20`, borderRadius: 5, background: `${color}10`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color });

const ItemGroupPage = () => {
    const { addToast } = useToast();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ ...BLANK });
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getItemGroups();
            setGroups(data);
        } catch (err) {
            console.error('Load Error:', err);
            addToast(err?.response?.data?.message || 'Failed to load item groups', 'error');
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => { setForm({ ...BLANK }); setEditId(null); setShowForm(true); };
    const openEdit = (g) => { setForm({ name: g.name, code: g.code, description: g.description || '' }); setEditId(g._id); setShowForm(true); };
    const cancelForm = () => { if (window.confirm('Discard changes?')) { setShowForm(false); setEditId(null); setForm({ ...BLANK }); } };

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
                await updateItemGroup(editId, form);
                addToast('Item group updated!', 'success');
            } else {
                await createItemGroup(form);
                addToast('Item group created!', 'success');
            }
            cancelForm();
            load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save', 'error');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete item group "${name}"? This cannot be undone.`)) return;
        try {
            await deleteItemGroup(id);
            addToast('Deleted', 'success');
            load();
        } catch { addToast('Failed to delete item group', 'error'); }
    };

    const handleToggleActive = async (g) => {
        try {
            await updateItemGroup(g._id, { isActive: !g.isActive });
            addToast(g.isActive ? 'Deactivated' : 'Activated', 'success');
            load();
        } catch { addToast('Failed to update', 'error'); }
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={15} style={{ color: '#059669' }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Item Group Master</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>{groups.length} groups</span>
                </div>
                {!showForm && (
                    <button onClick={openAdd}
                        style={{ height: 30, padding: '0 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} /> Add Group
                    </button>
                )}
            </div>

            {/* Add / Edit Form Panel */}
            {showForm && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                        {editId ? '✏️ Edit Item Group' : '➕ Add New Item Group'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Group Name *</label>
                            <input style={inp} value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Drivers, LED Chips, Controllers…" autoFocus />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Code *</label>
                            <input style={{ ...inp, fontFamily: 'monospace', fontWeight: 700 }} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DRIVERS" />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>Description (optional)</label>
                        <input style={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description for this item group" />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                        <button onClick={cancelForm} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#6ee7b7' : '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Check size={13} /> {saving ? 'Saving…' : (editId ? 'Update' : 'Add Group')}
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', flex: 1 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, color: '#6b7280', fontSize: 12 }}>
                        <div style={{ width: 14, height: 14, border: '2px solid #e5e7eb', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        Loading…
                    </div>
                ) : groups.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 8, color: '#9ca3af' }}>
                        <Layers size={28} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: 13 }}>No item groups yet</span>
                        <button onClick={openAdd} style={{ fontSize: 11, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>+ Add your first group</button>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>#</th>
                                <th style={th}>Code</th>
                                <th style={th}>Group Name</th>
                                <th style={th}>Description</th>
                                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                                <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((g, i) => {
                                const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
                                return (
                                    <tr key={g._id} style={{ background: rowBg }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                        onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                                        <td style={{ ...td, color: '#9ca3af', fontSize: 10 }}>{i + 1}</td>
                                        <td style={td}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#059669', background: '#f0fdf4', padding: '1px 6px', borderRadius: 4 }}>{g.code}</span>
                                        </td>
                                        <td style={{ ...td, fontWeight: 600 }}>{g.name}</td>
                                        <td style={{ ...td, color: '#6b7280', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || '—'}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <button onClick={() => handleToggleActive(g)}
                                                style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: g.isActive ? '#dcfce7' : '#fee2e2', color: g.isActive ? '#166534' : '#991b1b' }}>
                                                {g.isActive ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                <button onClick={() => openEdit(g)} title="Edit" style={iconBtn('#2563eb')}><Pencil size={11} /></button>
                                                <button onClick={() => handleDelete(g._id, g.name)} title="Delete" style={iconBtn('#dc2626')}><Trash2 size={11} /></button>
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

export default ItemGroupPage;
