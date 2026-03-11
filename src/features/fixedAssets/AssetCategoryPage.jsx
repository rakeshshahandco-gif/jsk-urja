import React, { useEffect, useState, useCallback } from 'react';
import { getAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory } from '@/services/fixedAssetApi';
import toast from 'react-hot-toast';

const inp = { padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const EMPTY = { name: '', parentGroup: '', codePrefix: '', depreciationApplicable: true, depreciationMethod: 'Straight Line Method', depreciationRate: 0, usefulLife: 0 };

export default function AssetCategoryPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await getAssetCategories(); setCategories(d || []); }
        catch (e) { toast.error('Failed to load categories'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (modal.mode === 'create') await createAssetCategory(modal.data);
            else await updateAssetCategory(modal.data._id, modal.data);
            toast.success('Saved!'); setModal(null); load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete category "${name}"?`)) return;
        try { await deleteAssetCategory(id); toast.success('Deleted'); load(); }
        catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    const set = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }));

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📂 Asset Categories</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Classify assets and set depreciation rules</p>
                </div>
                <button onClick={() => setModal({ mode: 'create', data: { ...EMPTY } })}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    + Add Category
                </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {['Name', 'Prefix', 'Method', 'Rate (%)', 'Life (Yrs)', 'Depr. Applicable', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : categories.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No categories found.</td></tr>
                        ) : categories.map(c => (
                            <tr key={c._id}>
                                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                                <td style={td}>{c.codePrefix}</td>
                                <td style={td}>{c.depreciationMethod}</td>
                                <td style={td}>{c.depreciationRate}%</td>
                                <td style={td}>{c.usefulLife}</td>
                                <td style={td}>{c.depreciationApplicable ? '✅ Yes' : '❌ No'}</td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => setModal({ mode: 'edit', data: { ...c } })}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                                        <button onClick={() => handleDelete(c._id, c.name)}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>{modal.mode === 'create' ? 'Add Category' : 'Edit Category'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Category Name *</label>
                                <input value={modal.data.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="e.g., Plant & Machinery" />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Asset Code Prefix *</label>
                                <input value={modal.data.codePrefix} onChange={e => set('codePrefix', e.target.value)} style={inp} placeholder="e.g., PM" maxLength={5} />
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Depr. Method</label>
                                    <select value={modal.data.depreciationMethod} onChange={e => set('depreciationMethod', e.target.value)} style={inp}>
                                        <option>Straight Line Method</option>
                                        <option>Written Down Value</option>
                                        <option>None</option>
                                    </select>
                                </div>
                                <div style={{ width: 100 }}>
                                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Rate (%)</label>
                                    <input type="number" value={modal.data.depreciationRate} onChange={e => set('depreciationRate', e.target.value)} style={inp} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Useful Life (Years)</label>
                                <input type="number" value={modal.data.usefulLife} onChange={e => set('usefulLife', e.target.value)} style={inp} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" id="depr" checked={modal.data.depreciationApplicable} onChange={e => set('depreciationApplicable', e.target.checked)} />
                                <label htmlFor="depr" style={{ fontSize: 13, fontWeight: 500 }}>Depreciation Applicable</label>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
                            <button onClick={() => setModal(null)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>{saving ? 'Saving...' : 'Save Category'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
