import React, { useEffect, useState, useCallback } from 'react';
import { getSuppliers, deleteSupplier, createSupplier, updateSupplier } from '@/services/purchaseApi';
import toast from 'react-hot-toast';

const inp = { padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const EMPTY = { supplierName: '', contactPerson: '', phone: '', email: '', address: '', city: '', state: '', gstNumber: '', gstType: '', paymentTerms: '', remarks: '' };

export default function SupplierListPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        getSuppliers({ search, limit: 100 })
            .then(d => setSuppliers(d.suppliers || []))
            .catch(() => toast.error('Failed to load suppliers'))
            .finally(() => setLoading(false));
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => setModal({ mode: 'create', data: { ...EMPTY } });
    const openEdit = (s) => setModal({ mode: 'edit', data: { ...s } });
    const set = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }));

    const handleSave = async () => {
        setSaving(true);
        try {
            if (modal.mode === 'create') {
                await createSupplier(modal.data);
                toast.success('Supplier created!');
            } else {
                await updateSupplier(modal.data._id, modal.data);
                toast.success('Supplier updated!');
            }
            setModal(null); load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete supplier "${name}"?`)) return;
        try { await deleteSupplier(id); toast.success('Deleted'); load(); }
        catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>🏭 Supplier Master</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Manage all your material suppliers</p>
                </div>
                <button onClick={openCreate}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + Add Supplier
                </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 14, maxWidth: 400, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['Code', 'Supplier Name', 'Contact', 'Phone', 'City', 'GST Type', 'Payment Terms', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : suppliers.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No suppliers found. Click "Add Supplier" to get started.</td></tr>
                        ) : suppliers.map((s) => (
                            <tr key={s._id}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{s.supplierCode}</td>
                                <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{s.supplierName}</td>
                                <td style={td}>{s.contactPerson || '—'}</td>
                                <td style={td}>{s.phone || '—'}</td>
                                <td style={td}>{s.city || '—'}</td>
                                <td style={td}>{s.gstType || '—'}</td>
                                <td style={td}>{s.paymentTerms || '—'}</td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => openEdit(s)}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                                        <button onClick={() => handleDelete(s._id, s.supplierName)}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{modal.mode === 'create' ? 'Add Supplier' : 'Edit Supplier'}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                            {[
                                ['supplierName', 'Supplier Name *', 'text'],
                                ['contactPerson', 'Contact Person', 'text'],
                                ['phone', 'Phone', 'text'],
                                ['email', 'Email', 'email'],
                                ['city', 'City', 'text'],
                                ['state', 'State', 'text'],
                                ['gstNumber', 'GST Number', 'text'],
                                ['paymentTerms', 'Payment Terms', 'text'],
                            ].map(([k, label, type]) => (
                                <div key={k}>
                                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>{label}</label>
                                    <input type={type} value={modal.data[k] || ''} onChange={e => set(k, e.target.value)} style={inp} />
                                </div>
                            ))}
                            <div>
                                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>GST Type</label>
                                <select value={modal.data.gstType || ''} onChange={e => set('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value="">— Select —</option>
                                    <option>CGST / SGST</option>
                                    <option>IGST</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Address</label>
                                <input value={modal.data.address || ''} onChange={e => set('address', e.target.value)} style={inp} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Remarks</label>
                            <textarea rows={2} value={modal.data.remarks || ''} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setModal(null)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>{saving ? 'Saving...' : 'Save Supplier'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
