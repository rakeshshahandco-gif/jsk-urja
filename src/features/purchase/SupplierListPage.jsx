import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuppliers, deleteSupplier, createSupplier, updateSupplier } from '@/services/purchaseApi';
import toast from 'react-hot-toast';

const inp = { padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const btn = (bg = '#1d4ed8') => ({ padding: '9px 18px', borderRadius: '8px', background: bg, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' });

const EMPTY = { supplierName: '', contactPerson: '', phone: '', email: '', address: '', city: '', state: '', gstNumber: '', gstType: '', paymentTerms: '', remarks: '' };

export default function SupplierListPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', data: {} }
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
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>🏭 Supplier Master</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Manage all your material suppliers</p>
                </div>
                <button onClick={openCreate} style={btn()}>+ Add Supplier</button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '16px', maxWidth: '400px' }}>
                <input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            </div>

            {/* Table */}
            <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#0f172a' }}>
                            {['Code', 'Supplier Name', 'Contact', 'Phone', 'City', 'GST Type', 'Payment Terms', 'Actions'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</td></tr>
                        ) : suppliers.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No suppliers found. Click "Add Supplier" to get started.</td></tr>
                        ) : suppliers.map((s, i) => (
                            <tr key={s._id} style={{ background: i % 2 === 0 ? '#0f172a' : '#1e293b', borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 600 }}>{s.supplierCode}</td>
                                <td style={{ padding: '12px 14px', color: '#f1f5f9', fontWeight: 500 }}>{s.supplierName}</td>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.contactPerson || '—'}</td>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.phone || '—'}</td>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.city || '—'}</td>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.gstType || '—'}</td>
                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{s.paymentTerms || '—'}</td>
                                <td style={{ padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => openEdit(s)} style={{ ...btn('#334155'), padding: '5px 10px', fontSize: '12px' }}>Edit</button>
                                        <button onClick={() => handleDelete(s._id, s.supplierName)} style={{ ...btn('#7f1d1d'), padding: '5px 10px', fontSize: '12px' }}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>{modal.mode === 'create' ? 'Add Supplier' : 'Edit Supplier'}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
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
                                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>{label}</label>
                                    <input type={type} value={modal.data[k] || ''} onChange={e => set(k, e.target.value)} style={inp} />
                                </div>
                            ))}
                            <div>
                                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>GST Type</label>
                                <select value={modal.data.gstType || ''} onChange={e => set('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value="">— Select —</option>
                                    <option>CGST / SGST</option>
                                    <option>IGST</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Address</label>
                                <input value={modal.data.address || ''} onChange={e => set('address', e.target.value)} style={inp} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Remarks</label>
                            <textarea rows={2} value={modal.data.remarks || ''} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setModal(null)} style={btn('#334155')}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={btn()}>{saving ? 'Saving...' : 'Save Supplier'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
