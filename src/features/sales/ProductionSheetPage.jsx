import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProductionSheetById, updateProductionSheet } from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
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
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getProductionSheetById(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([psData, compData]) => {
            setPS(psData);
            setForm({
                ...psData,
                testing: {
                    dateTime: psData.testing?.dateTime || '',
                    testedBy: psData.testing?.testedBy || '',
                    set1: psData.testing?.set1 || '',
                    set2: psData.testing?.set2 || '',
                    set3: psData.testing?.set3 || '',
                    set4: psData.testing?.set4 || '',
                    comments: psData.testing?.comments || '',
                },
                packing: {
                    dateTime: psData.packing?.dateTime || '',
                    handoverDateTime: psData.packing?.handoverDateTime || '',
                    deliveryDateTime: psData.packing?.deliveryDateTime || '',
                    deliveryThrough: psData.packing?.deliveryThrough || '',
                    personName: psData.packing?.personName || '',
                    comments: psData.packing?.comments || '',
                    loadReceived: psData.packing?.loadReceived || 'NO',
                },
                loadTest: psData.loadTest || { nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', i3: '' }
            });
            setCompany(compData?.data || {});
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const setF = (path, val) => setForm(p => {
        const parts = path.split('.');
        const clone = { ...p };
        let curr = clone;
        for (let i = 0; i < parts.length - 1; i++) {
            curr[parts[i]] = { ...(curr[parts[i]] || {}) };
            curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = val;
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
    const fmtDT = (d) => d ? new Date(d).toLocaleString('en-IN') : '—';

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!ps) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Production Sheet not found.</div>;

    const sc = STATUS_COLORS[ps.status] || '#9ca3af';

    const Section = ({ title, children, icon = '📋' }) => (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>{icon} {title}</h3>
            {children}
        </div>
    );
    const G = ({ cols, children, style }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols || 3}, 1fr)`, gap: 12, ...style }}>{children}</div>;
    const F = ({ l, children }) => <div><label style={lbl}>{l}</label>{children}</div>;

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Print Only Layout matching 'ORDER DETAILS' Image */}
            <div className="print-only" style={{ display: 'none', background: '#fff', color: '#000', padding: '0', boxSizing: 'border-box' }}>
                <style>{`
                    .o-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; table-layout: fixed; }
                    .o-table td, .o-table th { border: 1px solid #000; padding: 4px 8px; font-size: 9pt; vertical-align: middle; }
                    .o-header { text-align: center; font-weight: 900; background: #fff; border: 1.5px solid #000; border-bottom: none; padding: 4px; font-size: 11pt; }
                    .o-label { font-weight: bold; width: 120px; text-transform: uppercase; }
                    .o-value { flex: 1; }
                    .o-row { display: flex; border-bottom: 1px solid #000; }
                    .o-cell { flex: 1; display: flex; border-right: 1px solid #000; padding: 4px 8px; font-size: 9pt; height: 22px; align-items: center; }
                    .o-cell:last-child { border-right: none; }
                `}</style>

                <div className="o-header">ORDER DETAILS</div>
                <div className="o-header" style={{ borderTop: 'none', fontSize: '10pt' }}>Order</div>

                <div className="o-table">
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">DATE & TIME:-</span> <span className="o-value">{fmtDT(ps.createdAt)}</span></div>
                        <div className="o-cell"><span className="o-label">NO:-</span> <span className="o-value">{ps.soNumber}</span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">CLIENT CODE:-</span> <span className="o-value">{ps.customerCode || '—'}</span></div>
                        <div className="o-cell"><span className="o-label">DELIVERY DATE:-</span> <span className="o-value">{fmt(ps.deliveryDate)}</span></div>
                    </div>
                    <div className="o-row" style={{ height: '30px' }}>
                        <div className="o-cell" style={{ flex: 1 }}><span className="o-label">STICKER:-</span> <span className="o-value">{ps.stickerType || '—'}</span></div>
                        <div className="o-cell" style={{ flex: 1 }}><span className="o-label">SIGN:-</span> <span className="o-value"></span></div>
                    </div>
                    <div className="o-row" style={{ height: '30px' }}>
                        <div className="o-cell" style={{ flex: 1 }}><span className="o-label">CABINET:-</span> <span className="o-value">{ps.cabinetType || '—'}</span></div>
                    </div>
                    <div className="o-row" style={{ height: '30px' }}>
                        <div className="o-cell"><span className="o-label">WIRES:-</span> <span className="o-value">{ps.wires || '—'}</span></div>
                        <div className="o-cell"><span className="o-label">Order category:</span> <span className="o-value">{ps.orderCategory || 'Order'}</span></div>
                    </div>
                </div>

                <table className="o-table" style={{ borderTop: 'none' }}>
                    <thead>
                        <tr style={{ fontWeight: 900 }}>
                            <th style={{ width: '40px' }}>SR NO</th>
                            <th style={{ width: '80px' }}>HSN</th>
                            <th style={{ width: '150px' }}>VOLT/CURRENT</th>
                            <th style={{ width: '80px' }}>QUANTITY</th>
                            <th style={{ width: '80px' }}>HOURS</th>
                            <th style={{ width: '80px' }}>DUMMY LOAD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(ps.items || []).map((item, i) => (
                            <tr key={i} style={{ height: '25px' }}>
                                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                <td style={{ textAlign: 'center' }}>{item.hsnCode || '—'}</td>
                                <td>{item.voltCurrent || '—'}</td>
                                <td style={{ textAlign: 'center' }}>{item.qty} Nos</td>
                                <td>{item.hours || '—'}</td>
                                <td>{item.dummyLoad || '—'}</td>
                            </tr>
                        ))}
                        {Array.from({ length: Math.max(0, 3 - (ps.items?.length || 0)) }).map((_, i) => (
                            <tr key={`e-${i}`} style={{ height: '25px' }}><td /><td /><td /><td /><td /><td /></tr>
                        ))}
                    </tbody>
                </table>

                <div className="o-header" style={{ borderTop: 'none' }}>PRODUCTION DETAILS</div>
                <div className="o-table" style={{ borderTop: 'none' }}>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">DATE & TIME:</span> <span>{ps.testing?.dateTime ? fmtDT(ps.testing.dateTime) : ''}</span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">TESTED BY:</span> <span>{ps.testing?.testedBy || ''}</span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">SET:</span> <span></span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">1</span> <span style={{ flex: 1 }}>{ps.testing?.set1 || ''}</span></div>
                        <div className="o-cell"><span className="o-label">3</span> <span style={{ flex: 1 }}>{ps.testing?.set3 || ''}</span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">2</span> <span style={{ flex: 1 }}>{ps.testing?.set2 || ''}</span></div>
                        <div className="o-cell"><span className="o-label">4</span> <span style={{ flex: 1 }}>{ps.testing?.set4 || ''}</span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">COMMENTS:</span> <span style={{ flex: 1 }}>{ps.testing?.comments || ''}</span></div>
                        <div className="o-cell"><span className="o-label">SIGN:-</span> <span></span></div>
                    </div>
                </div>

                <div className="o-header" style={{ borderTop: 'none' }}>PACKING DETAILS</div>
                <div className="o-table" style={{ borderTop: 'none' }}>
                    <div className="o-row"><div className="o-cell"><span className="o-label">DATE & TIME:</span> <span>{ps.packing?.dateTime ? fmtDT(ps.packing.dateTime) : ''}</span></div></div>
                    <div className="o-row"><div className="o-cell"><span className="o-label">HANDOVER DATE & TIME:</span> <span>{ps.packing?.handoverDateTime ? fmtDT(ps.packing.handoverDateTime) : ''}</span></div></div>
                    <div className="o-row"><div className="o-cell"><span className="o-label">DELIVERY DATE & TIME:</span> <span>{ps.packing?.deliveryDateTime ? fmtDT(ps.packing.deliveryDateTime) : ''}</span></div></div>
                    <div className="o-row"><div className="o-cell"><span className="o-label">DELIVERY TROUGH:</span> <span>{ps.packing?.deliveryThrough || ''}</span></div></div>
                    <div className="o-row"><div className="o-cell"><span className="o-label">NAME OF PERSON:</span> <span>{ps.packing?.personName || ''}</span></div></div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">COMMENTS:</span> <span style={{ flex: 1 }}>{ps.packing?.comments || ''}</span></div>
                        <div className="o-cell"><span className="o-label">SIGN:-</span> <span></span></div>
                    </div>
                    <div className="o-row">
                        <div className="o-cell"><span className="o-label">LOAD RECIEVED:</span> <span></span></div>
                        <div className="o-cell"><span className="o-label">YES/NO</span> <span style={{ flex: 1 }}>{ps.packing?.loadReceived || ''}</span></div>
                    </div>
                </div>

                <table className="o-table" style={{ borderTop: 'none', marginTop: '10px' }}>
                    <thead>
                        <tr style={{ fontWeight: 'bold', textAlign: 'center' }}>
                            <th>NLV:</th><th>LV:</th><th>LI</th><th>Trans</th><th>Ex1</th><th>Ex2</th><th>Ex3</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ height: '30px' }}>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.nlv || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.lv || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.li || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.trans || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.ex1 || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.ex2 || ''}</td>
                            <td style={{ textAlign: 'center' }}>{ps.loadTest?.ex3 || ''}</td>
                        </tr>
                        <tr style={{ height: '30px' }}><td /><td /><td /><td /><td /><td /><td /></tr>
                        <tr style={{ height: '30px' }}><td /><td /><td /><td /><td /><td /><td /></tr>
                    </tbody>
                </table>
            </div>

            {/* Header (No Print) */}
            <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
                            SO Ref: <strong style={{ color: '#374151' }}>{ps.soNumber}</strong> · Client Code: <strong style={{ color: '#374151' }}>{ps.customerCode || ps.customerName}</strong>
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

            <div className="no-print" style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {/* Order Information Section */}
                <Section title="Order Details" icon="📦">
                    <G cols={3}>
                        <F l="Client Code"><input value={ps.customerCode || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Delivery Date"><input value={fmt(ps.deliveryDate)} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Sticker Type">
                            <input value={editing ? form.stickerType : ps.stickerType || ''}
                                onChange={e => setF('stickerType', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, border: 'none', padding: '7px 0' }} />
                        </F>
                        <F l="Cabinet Type">
                            <input value={editing ? form.cabinetType : ps.cabinetType || ''}
                                onChange={e => setF('cabinetType', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, border: 'none', padding: '7px 0' }} />
                        </F>
                        <F l="Wires">
                            <input value={editing ? form.wires : ps.wires || ''}
                                onChange={e => setF('wires', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, border: 'none', padding: '7px 0' }} />
                        </F>
                        <F l="Status">
                            {editing ? (
                                <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                                    {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                                </select>
                            ) : <span>{ps.status}</span>}
                        </F>
                    </G>
                </Section>

                {/* Items Table */}
                <Section title="Order Items" icon="🔧">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Sr', 'HSN', 'Volt / Current', 'Qty', 'Hours', 'Dummy Load'].map(h => <th key={h} style={th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {(editing ? form.items : ps.items || []).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={td}>{i + 1}</td>
                                        <td style={td}>{item.hsnCode || '—'}</td>
                                        <td style={td}>{item.voltCurrent}</td>
                                        <td style={td}>{item.qty} Nos</td>
                                        <td style={td}>
                                            {editing ? <input value={item.hours || ''} onChange={e => {
                                                const its = [...form.items]; its[i].hours = e.target.value; setF('items', its);
                                            }} style={inp} /> : item.hours}
                                        </td>
                                        <td style={td}>
                                            {editing ? <input value={item.dummyLoad || ''} onChange={e => {
                                                const its = [...form.items]; its[i].dummyLoad = e.target.value; setF('items', its);
                                            }} style={inp} /> : item.dummyLoad}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <G cols={2}>
                    {/* Production Details */}
                    <Section title="Production Details" icon="🏭">
                        <G cols={2}>
                            <F l="Tested By">
                                {editing ? <input value={form.testing.testedBy} onChange={e => setF('testing.testedBy', e.target.value)} style={inp} /> : <span>{ps.testing?.testedBy}</span>}
                            </F>
                            <F l="Date & Time">
                                {editing ? <input type="datetime-local" value={form.testing.dateTime} onChange={e => setF('testing.dateTime', e.target.value)} style={inp} /> : <span>{fmtDT(ps.testing?.dateTime)}</span>}
                            </F>
                            <F l="Set 1">{editing ? <input value={form.testing.set1} onChange={e => setF('testing.set1', e.target.value)} style={inp} /> : <span>{ps.testing?.set1}</span>}</F>
                            <F l="Set 2">{editing ? <input value={form.testing.set2} onChange={e => setF('testing.set2', e.target.value)} style={inp} /> : <span>{ps.testing?.set2}</span>}</F>
                            <F l="Set 3">{editing ? <input value={form.testing.set3} onChange={e => setF('testing.set3', e.target.value)} style={inp} /> : <span>{ps.testing?.set3}</span>}</F>
                            <F l="Set 4">{editing ? <input value={form.testing.set4} onChange={e => setF('testing.set4', e.target.value)} style={inp} /> : <span>{ps.testing?.set4}</span>}</F>
                            <div style={{ gridColumn: 'span 2' }}>
                                <F l="Comments">{editing ? <textarea value={form.testing.comments} onChange={e => setF('testing.comments', e.target.value)} style={{ ...inp, height: 60 }} /> : <span>{ps.testing?.comments}</span>}</F>
                            </div>
                        </G>
                    </Section>

                    {/* Packing Details */}
                    <Section title="Packing Details" icon="📦">
                        <G cols={2}>
                            <F l="Handover D/T">
                                {editing ? <input type="datetime-local" value={form.packing.handoverDateTime} onChange={e => setF('packing.handoverDateTime', e.target.value)} style={inp} /> : <span>{fmtDT(ps.packing?.handoverDateTime)}</span>}
                            </F>
                            <F l="Delivery D/T">
                                {editing ? <input type="datetime-local" value={form.packing.deliveryDateTime} onChange={e => setF('packing.deliveryDateTime', e.target.value)} style={inp} /> : <span>{fmtDT(ps.packing?.deliveryDateTime)}</span>}
                            </F>
                            <F l="Delivery Through">
                                {editing ? <input value={form.packing.deliveryThrough} onChange={e => setF('packing.deliveryThrough', e.target.value)} style={inp} /> : <span>{ps.packing?.deliveryThrough}</span>}
                            </F>
                            <F l="Person Name">
                                {editing ? <input value={form.packing.personName} onChange={e => setF('packing.personName', e.target.value)} style={inp} /> : <span>{ps.packing?.personName}</span>}
                            </F>
                            <F l="Load Received">
                                {editing ? (
                                    <select value={form.packing.loadReceived} onChange={e => setF('packing.loadReceived', e.target.value)} style={inp}>
                                        <option>YES</option><option>NO</option>
                                    </select>
                                ) : <span>{ps.packing?.loadReceived}</span>}
                            </F>
                            <div style={{ gridColumn: 'span 2' }}>
                                <F l="Comments">{editing ? <textarea value={form.packing.comments} onChange={e => setF('packing.comments', e.target.value)} style={{ ...inp, height: 60 }} /> : <span>{ps.packing?.comments}</span>}</F>
                            </div>
                        </G>
                    </Section>
                </G>

                {/* Load Test Section (No Print) */}
                <Section title="Load Test Details" icon="📊">
                    <G cols={7}>
                        {['nlv', 'lv', 'li', 'trans', 'ex1', 'ex2', 'ex3'].map(k => (
                            <F key={k} l={k.toUpperCase()}>
                                {editing ? (
                                    <input value={form.loadTest?.[k] || ''} onChange={e => setF(`loadTest.${k}`, e.target.value)} style={inp} />
                                ) : (
                                    <span style={{ fontWeight: 600 }}>{ps.loadTest?.[k] || '—'}</span>
                                )}
                            </F>
                        ))}
                    </G>
                </Section>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; padding: 10mm; }
                    body { background: #fff !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    );
}
