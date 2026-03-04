import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProductionSheetById, updateProductionSheet } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '9px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const STATUS_OPTS = ['Pending', 'In Testing', 'Ready', 'Dispatched'];
const STATUS_COLORS = { Pending: '#d97706', 'In Testing': '#2563eb', Ready: '#16a34a', Dispatched: '#059669' };

export default function ProductionSheetPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ps, setPS] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        getProductionSheetById(id).then(data => { setPS(data); setForm(data); }).catch(() => toast.error('Failed to load production sheet')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const setF = (path, val) => setForm(p => {
        const parts = path.split('.');
        if (parts.length === 1) return { ...p, [path]: val };
        const clone = { ...p };
        clone[parts[0]] = { ...(clone[parts[0]] || {}), [parts[1]]: val };
        return clone;
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateProductionSheet(id, form);
            toast.success('Production sheet updated!');
            setEditing(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
        finally { setSaving(false); }
    };

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!ps) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Production Sheet not found.</div>;

    const sc = STATUS_COLORS[ps.status] || '#9ca3af';
    const Section = ({ title, children, icon = '📋' }) => (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{icon} {title}</h3>
            {children}
        </div>
    );
    const G = ({ cols, children }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols || 3}, 1fr)`, gap: 12 }}>{children}</div>;
    const F = ({ l, children }) => <div><label style={lbl}>{l}</label>{children}</div>;

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.SALES.ORDER_DETAIL(ps.soId?._id || ps.soId))} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                    ← Back to Sales Order
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🏭 {ps.psNumber}</h1>
                            <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: sc, background: `${sc}20`, border: `1px solid ${sc}40` }}>{ps.status}</span>
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                            SO Ref: <strong style={{ color: '#374151' }}>{ps.soNumber}</strong> · {ps.customerName} · Delivery: {fmt(ps.deliveryDate)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {editing ? (
                            <>
                                <button onClick={() => { setEditing(false); setForm(ps); }} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Discard</button>
                                <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                                    {saving ? 'Saving...' : '✓ Save Changes'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => window.print()} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
                                <button onClick={() => setEditing(true)} style={{ padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>✏️ Edit</button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {/* Order Info */}
                <Section title="Order Information" icon="📦">
                    <G cols={4}>
                        {[['Customer', ps.customerName], ['Delivery Date', fmt(ps.deliveryDate)], ['Order Category', ps.orderCategory || '—'], ['Unit Type', ps.acDc || '—']].map(([k, v]) => (
                            <div key={k}><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ color: '#1e293b', fontWeight: 600, fontSize: 13, marginTop: 2 }}>{v}</div></div>
                        ))}
                    </G>
                    {editing && (
                        <G cols={3} style={{ marginTop: 12 }}>
                            <F l="Status">
                                <select value={form.status || ps.status} onChange={e => setF('status', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                                </select>
                            </F>
                            <F l="Sticker Type"><input value={form.stickerType || ''} onChange={e => setF('stickerType', e.target.value)} style={inp} /></F>
                            <F l="Cabinet Type"><input value={form.cabinetType || ''} onChange={e => setF('cabinetType', e.target.value)} style={inp} /></F>
                            <F l="Wires"><input value={form.wires || ''} onChange={e => setF('wires', e.target.value)} style={inp} /></F>
                            <F l="AC/DC">
                                <select value={form.acDc || ''} onChange={e => setF('acDc', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value="">Select</option><option>AC</option><option>DC</option><option>Both</option>
                                </select>
                            </F>
                        </G>
                    )}
                </Section>

                {/* Items */}
                <Section title="Items / Products" icon="🔧">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Sr', 'Model No', 'Volt / Current', 'Qty', 'Extra Notes', 'Dummy Load'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {(editing ? form.items : ps.items || []).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => !editing && (e.currentTarget.style.background = '#f8f9fa')}
                                        onMouseLeave={e => !editing && (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ ...td, color: '#9ca3af' }}>{item.srNo || i + 1}</td>
                                        {editing ? <>
                                            <td style={td}><input value={item.modelNo || ''} onChange={e => { const its = [...form.items]; its[i] = { ...its[i], modelNo: e.target.value }; setF('items', its); }} style={inp} /></td>
                                            <td style={td}><input value={item.voltCurrent || ''} onChange={e => { const its = [...form.items]; its[i] = { ...its[i], voltCurrent: e.target.value }; setF('items', its); }} style={inp} /></td>
                                            <td style={td}><input type="number" value={item.qty || ''} onChange={e => { const its = [...form.items]; its[i] = { ...its[i], qty: Number(e.target.value) }; setF('items', its); }} style={{ ...inp, width: 70 }} /></td>
                                            <td style={td}><input value={item.extraChange || ''} onChange={e => { const its = [...form.items]; its[i] = { ...its[i], extraChange: e.target.value }; setF('items', its); }} style={inp} /></td>
                                            <td style={td}><input value={item.dummyLoad || ''} onChange={e => { const its = [...form.items]; its[i] = { ...its[i], dummyLoad: e.target.value }; setF('items', its); }} style={inp} /></td>
                                        </> : <>
                                            <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{item.modelNo || '—'}</td>
                                            <td style={td}>{item.voltCurrent || '—'}</td>
                                            <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.qty}</td>
                                            <td style={{ ...td, color: '#6b7280' }}>{item.extraChange || '—'}</td>
                                            <td style={{ ...td, color: '#6b7280' }}>{item.dummyLoad || '—'}</td>
                                        </>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                {/* Testing Details */}
                <Section title="Testing Details" icon="🧪">
                    {editing ? (
                        <G cols={3}>
                            {[['Date/Time', 'testing.dateTime', 'datetime-local'], ['Tested By', 'testing.testedBy', 'text'], ['Set 1', 'testing.set1', 'text'], ['Set 2', 'testing.set2', 'text'], ['Set 3', 'testing.set3', 'text'], ['Set 4', 'testing.set4', 'text']].map(([label, key, type]) => (
                                <F key={key} l={label}><input type={type} value={(form.testing || {})[key.split('.')[1]] || ''} onChange={e => setF(key, e.target.value)} style={inp} /></F>
                            ))}
                            <div style={{ gridColumn: 'span 3' }}>
                                <F l="Comments"><textarea value={(form.testing || {}).comments || ''} onChange={e => setF('testing.comments', e.target.value)} style={{ ...inp, height: 60, resize: 'vertical' }} /></F>
                            </div>
                        </G>
                    ) : (
                        <G cols={3}>
                            {[['Tested By', ps.testing?.testedBy || '—'], ['Date', ps.testing?.dateTime ? fmt(ps.testing.dateTime) : '—'], ['Set 1', ps.testing?.set1 || '—'], ['Set 2', ps.testing?.set2 || '—'], ['Set 3', ps.testing?.set3 || '—'], ['Comments', ps.testing?.comments || '—']].map(([k, v]) => (
                                <div key={k}><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ color: '#1e293b', fontSize: 13, marginTop: 2 }}>{v}</div></div>
                            ))}
                        </G>
                    )}
                </Section>

                {/* Packing / Dispatch Details */}
                <Section title="Packing & Dispatch" icon="📦">
                    {editing ? (
                        <G cols={3}>
                            {[['Delivery Through', 'packing.deliveryThrough', 'text'], ['Person Name', 'packing.personName', 'text'], ['Handover Date', 'packing.handoverDateTime', 'datetime-local'], ['Delivery Date', 'packing.deliveryDateTime', 'datetime-local']].map(([label, key, type]) => (
                                <F key={key} l={label}><input type={type} value={(form.packing || {})[key.split('.')[1]] || ''} onChange={e => setF(key, e.target.value)} style={inp} /></F>
                            ))}
                            <div style={{ gridColumn: 'span 3' }}>
                                <F l="Comments"><textarea value={(form.packing || {}).comments || ''} onChange={e => setF('packing.comments', e.target.value)} style={{ ...inp, height: 60, resize: 'vertical' }} /></F>
                            </div>
                        </G>
                    ) : (
                        <G cols={3}>
                            {[['Delivery Through', ps.packing?.deliveryThrough || '—'], ['Person Name', ps.packing?.personName || '—'], ['Handover Date', ps.packing?.handoverDateTime ? fmt(ps.packing.handoverDateTime) : '—'], ['Delivery Date', ps.packing?.deliveryDateTime ? fmt(ps.packing.deliveryDateTime) : '—'], ['Comments', ps.packing?.comments || '—']].map(([k, v]) => (
                                <div key={k}><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ color: '#1e293b', fontSize: 13, marginTop: 2 }}>{v}</div></div>
                            ))}
                        </G>
                    )}
                </Section>
            </div>

            <style>{`@media print { button { display: none !important; } }`}</style>
        </div>
    );
}
