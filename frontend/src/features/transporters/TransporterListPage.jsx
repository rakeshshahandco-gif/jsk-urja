import React, { useEffect, useState, useCallback } from 'react';
import { getTransporters, createTransporter, updateTransporter, deleteTransporter } from '@/services/transporterApi';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Edit2, Check, X, Truck } from 'lucide-react';

const th = { padding: '12px 15px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #f1f5f9', fontSize: 11, textTransform: 'uppercase', background: '#fff' };
const td = { padding: '12px 15px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b' };
const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', background: '#fff' };
const sel = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', background: '#f9fafb' };


import { BrandedLoader } from '@/components/ui';

export default function TransporterListPage() {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ transporterName: '', transporterId: '', type: 'Transporter', phone: '', email: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTransporters();
            setList(res.data || []);
        } catch (e) {
            toast.error('Failed to load transporters');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!form.transporterName || !form.transporterId) return toast.error('Name and ID are required');
        try {
            if (editingId) {
                await updateTransporter(editingId, form);
                toast.success('Updated successfully');
            } else {
                await createTransporter(form);
                toast.success('Transporter added');
            }
            setForm({ transporterName: '', transporterId: '', type: 'Transporter', phone: '', email: '' });
            setIsAdding(false);
            setEditingId(null);

            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this transporter?')) return;
        try {
            await deleteTransporter(id);
            toast.success('Deleted');
            load();
        } catch (e) {
            toast.error('Failed to delete');
        }
    };

    return (
        <div style={{ padding: '24px 30px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Transporter Master</h1>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Save frequently used transporters and their IDs</div>
                </div>
                <button 
                    onClick={() => { setIsAdding(true); setEditingId(null); setForm({ transporterName: '', transporterId: '', type: 'Transporter', phone: '', email: '' }); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                >
                    <Plus size={18} /> Add Logistics Provider
                </button>
            </div>

            {(isAdding || editingId) && (
                <div style={{ background: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, border: '2px solid #0d9488', boxShadow: '0 4px 12px rgba(13,148,136,0.1)' }}>
                    <h4 style={{ margin: '0 0 15px', fontSize: 14 }}>{editingId ? 'Edit Provider' : 'Add New Provider (Transporter/Courier)'}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.5fr 1fr', gap: 12 }}>
                        <input value={form.transporterName} onChange={e => setForm(p => ({ ...p, transporterName: e.target.value }))} style={inp} placeholder="Name (e.g., Delhivery) *" />
                        <input value={form.transporterId} onChange={e => setForm(p => ({ ...p, transporterId: e.target.value }))} style={inp} placeholder="GSTIN / ID *" />
                        <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={sel}>
                            <option value="Transporter">Transporter</option>
                            <option value="Courier">Courier</option>
                        </select>
                        <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} style={inp} placeholder="Phone" />

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handleSave} style={{ flex: 1, background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Check size={18} /></button>
                            <button onClick={() => { setIsAdding(false); setEditingId(null); }} style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {loading ? <BrandedLoader size={120} /> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>Provider Name</th>
                                <th style={th}>Type</th>
                                <th style={th}>GSTIN / ID</th>
                                <th style={th}>Contact</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 ? <tr><td colSpan="5" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No providers added yet</td></tr> : list.map(t => (
                                <tr key={t._id}>
                                    <td style={td}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: t.type === 'Courier' ? '#eff6ff' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Truck size={16} color={t.type === 'Courier' ? '#2563eb' : '#0d9488'} />
                                            </div>
                                            <span style={{ fontWeight: 700 }}>{t.transporterName}</span>
                                        </div>
                                    </td>
                                    <td style={td}>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: t.type === 'Courier' ? '#e0f2fe' : '#f1f5f9', color: t.type === 'Courier' ? '#0369a1' : '#475569' }}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.transporterId}</span></td>

                                    <td style={td}>
                                        <div style={{ fontSize: 12 }}>{t.phone || '—'}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.email || ''}</div>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button onClick={() => { setEditingId(t._id); setForm(t); setIsAdding(false); }} style={{ padding: 6, background: '#eff6ff', border: 'none', color: '#2563eb', borderRadius: 6, cursor: 'pointer' }}><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(t._id)} style={{ padding: 6, background: '#fef2f2', border: 'none', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
