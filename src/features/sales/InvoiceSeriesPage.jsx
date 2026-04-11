import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvoiceSeries, createInvoiceSeries, updateInvoiceSeries, deleteInvoiceSeries } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };

export default function InvoiceSeriesPage() {
    const navigate = useNavigate();
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ 
        seriesName: '', 
        financialYear: '', 
        prefix: '', 
        startNumber: 1, 
        padLength: 5, 
        gstApplicable: true, 
        isDefault: false, 
        isEstimate: false, 
        description: '',
        resetSequence: false
    });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try { setSeries(await getInvoiceSeries()); }
        catch { toast.error('Failed to load series'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => { 
        setEditing(null); 
        setForm({ 
            seriesName: '', 
            financialYear: '25-26', 
            prefix: '25-26/', 
            startNumber: 1, 
            padLength: 5, 
            gstApplicable: true, 
            isDefault: false, 
            isEstimate: false,
            description: '',
            resetSequence: false
        }); 
        setShowModal(true); 
    };
    const openEdit = (s) => {
        setEditing(s);
        setForm({
            seriesName: s.seriesName,
            financialYear: s.financialYear,
            prefix: s.prefix,
            startNumber: s.startNumber,
            padLength: s.padLength,
            gstApplicable: s.gstApplicable === false ? false : true,
            isDefault: !!s.isDefault,
            isEstimate: !!s.isEstimate,
            description: s.description || '',
            resetSequence: false
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.seriesName || !form.financialYear || !form.prefix) return toast.error('Name, FY, and prefix are required');
        setSaving(true);
        console.log('DEBUG: Saving Series Form:', JSON.stringify(form, null, 2));
        try {
            if (editing) {
                const res = await updateInvoiceSeries(editing._id, form);
                console.log('DEBUG: Update response:', res);
                toast.success('Updated!');
            }
            else { await createInvoiceSeries(form); toast.success('Series created!'); }
            setShowModal(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this series?')) return;
        try { await deleteInvoiceSeries(id); toast.success('Deleted'); load(); }
        catch (e) { toast.error(e.response?.data?.message || 'Delete failed'); }
    };

    const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>⚙️ Invoice Series</h1>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 13 }}>Configure invoice numbering series (e.g. 25-26/00001)</p>
                </div>
                <button onClick={openNew} style={{ padding: '9px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ New Series</button>
            </div>

            <div style={{ padding: 28 }}>
                {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading...</div> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                        {series.length === 0 && (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
                                <div>No invoice series configured yet.</div>
                                <button onClick={openNew} style={{ marginTop: 12, padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Create First Series</button>
                            </div>
                        )}
                        {series.map(s => (
                            <div key={s._id} style={{ background: '#fff', border: `1px solid ${s.isDefault ? '#0d9488' : '#e5e7eb'}`, borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative' }}>
                                {s.isDefault && <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 11, fontWeight: 700, color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '2px 8px' }}>DEFAULT</span>}
                                {s.isEstimate && <span style={{ position: 'absolute', top: 14, right: s.isDefault ? 85 : 14, fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '2px 8px' }}>ESTIMATE</span>}
                                <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>{s.seriesName}</div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>FY: <strong style={{ color: '#374151' }}>{s.financialYear}</strong></div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Prefix: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, color: '#0d9488', fontWeight: 700 }}>{s.prefix}</code></div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Start: <strong>{s.startNumber}</strong> · Pad: <strong>{s.padLength}</strong> digits</div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Last Used: <strong style={{ color: s.currentNumber > 0 ? '#374151' : '#9ca3af' }}>{s.currentNumber > 0 ? `${s.prefix}${String(s.currentNumber).padStart(s.padLength, '0')}` : 'None yet'}</strong></div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Tax Mode: <strong style={{ color: s.gstApplicable ? '#0d9488' : '#7c3aed' }}>{s.gstApplicable ? 'GST Invoicing' : 'Without GST'}</strong></div>
                                <div style={{ fontSize: 13, color: s.isActive ? '#16a34a' : '#dc2626', fontWeight: 600, marginBottom: 12 }}>{s.isActive ? '● Active' : '○ Inactive'}</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => openEdit(s)} style={{ flex: 1, padding: '7px 0', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', color: '#374151', fontWeight: 600, fontSize: 12 }}>Edit</button>
                                    <button 
                                        onClick={() => navigate(PATHS.SALES.RESEQUENCE_TOOL, { state: { seriesId: s._id, financialYear: s.financialYear } })} 
                                        style={{ flex: 1, padding: '7px 0', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, cursor: 'pointer', color: '#b45309', fontWeight: 700, fontSize: 12 }}
                                    >
                                        Resequence
                                    </button>
                                    {s.currentNumber === 0 && <button onClick={() => handleDelete(s._id)} style={{ padding: '7px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, cursor: 'pointer', color: '#dc2626', fontWeight: 600, fontSize: 12 }}>Delete</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{editing ? 'Edit' : 'New'} Invoice Series</h2>
                        {/* Current position info — shown at top when editing */}
                        {editing && (
                            <div style={{ background: '#f0fdfa', border: '2px solid #0d9488', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>📌 Last Used No.</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#374151', fontFamily: 'monospace' }}>
                                        {editing.currentNumber > 0
                                            ? `${editing.prefix}${String(editing.currentNumber).padStart(editing.padLength, '0')}`
                                            : <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 12 }}>None yet</span>}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>🔜 Next Invoice Will Be</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0d9488', fontFamily: 'monospace' }}>
                                        {`${editing.prefix}${String(Math.max((editing.currentNumber || 0) + 1, editing.startNumber || 1)).padStart(editing.padLength, '0')}`}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'grid', gap: 14 }}>
                            {[['Series Name', 'seriesName', 'text', 'e.g. Main 2025-26'], ['Financial Year', 'financialYear', 'text', 'e.g. 25-26'], ['Prefix', 'prefix', 'text', 'e.g. 25-26/'], ['Start Number (original)', 'startNumber', 'number', '1'], ['Pad Length', 'padLength', 'number', '5']].map(([label, key, type, placeholder]) => (
                                <div key={key}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
                                    <input type={type} value={form[key]} onChange={e => f(key, type === 'number' ? Number(e.target.value) : e.target.value)} placeholder={placeholder} style={inp} />
                                </div>
                            ))}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Description</label>
                                <textarea value={form.description} onChange={e => f('description', e.target.value)} style={{ ...inp, height: 60, resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                    <input type="checkbox" checked={form.gstApplicable} onChange={e => f('gstApplicable', e.target.checked)} style={{ width: 16, height: 16 }} />
                                    <span style={{ fontWeight: 600, color: '#374151' }}>GST Applicable</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                    <input type="checkbox" checked={form.isDefault} onChange={e => f('isDefault', e.target.checked)} style={{ width: 16, height: 16 }} />
                                    <span style={{ fontWeight: 600, color: '#374151' }}>Set as Default</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                    <input type="checkbox" checked={form.isEstimate} onChange={e => f('isEstimate', e.target.checked)} style={{ width: 16, height: 16 }} />
                                    <span style={{ fontWeight: 600, color: '#7c3aed' }}>Is Estimate Series?</span>
                                </label>
                                {editing && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, background: '#fffbeb', padding: '4px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                                        <input type="checkbox" checked={form.resetSequence} onChange={e => f('resetSequence', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#d97706' }} />
                                        <span style={{ fontWeight: 700, color: '#b45309' }}>Reset Seq. to 0 (For New Year)</span>
                                    </label>
                                )}
                            </div>
                        </div>
                        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModal(false)} style={{ padding: '9px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                                {saving ? 'Saving...' : editing ? 'Update Series' : 'Create Series'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
