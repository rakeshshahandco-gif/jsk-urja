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

import { BrandedLoader } from '@/components/ui/BrandedLoading';

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

    const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
    const fmtDT = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—';

    if (loading) return <BrandedLoader size={120} />;
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
        <div className="production-sheet-page-root" style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* LOCKED PRODUCTION SHEET PRINT FORMAT — A4 portrait layout. Do not change unless explicitly requested by JSK admin/user. */}
            <div className="print-only production-sheet-print ps-print-page" style={{ display: 'none', width: '194mm', minWidth: '194mm', maxWidth: '194mm', margin: '0 auto', background: '#fff', color: '#000', padding: 0, boxSizing: 'border-box' }}>
                <div className="ps-print-sheet">
                <div className="ps-section-header">ORDER DETAILS</div>
                <div className="ps-section-header ps-section-sub">Production Sheet</div>

                <table className="ps-print-table">
                    <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                    <tbody>
                        <tr>
                            <td><span className="ps-lbl">DATE &amp; TIME:-</span> <span className="ps-val">{fmtDT(ps.createdAt)}</span></td>
                            <td><span className="ps-lbl">NO:-</span> <span className="ps-val">{ps.soNumber}</span></td>
                        </tr>
                        <tr>
                            <td><span className="ps-lbl">CLIENT CODE:-</span> <span className="ps-val">{ps.customerCode || '—'}</span></td>
                            <td><span className="ps-lbl">DELIVERY DATE:-</span> <span className="ps-val">{fmt(ps.deliveryDate)}</span></td>
                        </tr>
                        <tr>
                            <td><span className="ps-lbl">STICKER:-</span> <span className="ps-val">{ps.stickerType || ''}</span></td>
                            <td><span className="ps-lbl">SIGN:-</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2}>
                                <span className="ps-lbl">ORDER CATEGORY:-</span>
                                <span className="ps-val" style={{
                                    color: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#dc2626' : 'inherit',
                                    fontWeight: 'bold'
                                }}>
                                    {ps.orderCategory || ps.soId?.orderCategory || 'Order'}
                                </span>
                            </td>
                        </tr>
                        {((ps.orderCategory || ps.soId?.orderCategory) === 'Replacement') && (ps.warrantyDetails || ps.soId?.warrantyDetails) && (
                            <tr>
                                <td colSpan={2} style={{ background: '#f8fafc' }}>
                                    <span className="ps-lbl" style={{ color: '#dc2626' }}>Warranty Details:</span>
                                    <span className="ps-val" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                        {ps.warrantyDetails || ps.soId?.warrantyDetails}
                                    </span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <table className="ps-print-table ps-items-table">
                    <colgroup>
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '38%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '13%' }} />
                    </colgroup>
                    <thead>
                        <tr className="ps-th-row">
                            <th>SR NO</th>
                            <th>ITEM CODE</th>
                            <th>VOLT/CURRENT</th>
                            <th>QUANTITY</th>
                            <th>HOURS</th>
                            <th>DUMMY LOAD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(ps.items || []).map((item, i) => (
                            <tr key={i}>
                                <td className="ps-td-center">{i + 1}</td>
                                <td className="ps-td-left">{item.itemCode || '—'}</td>
                                <td className="ps-td-left">
                                    {item.voltCurrent || '—'}
                                    {item.additionalNotes && <div className="ps-item-note">{item.additionalNotes}</div>}
                                </td>
                                <td className="ps-td-center">{item.qty} Nos</td>
                                <td className="ps-td-center">{item.hours || '—'}</td>
                                <td className="ps-td-center">{item.dummyLoad || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="ps-section-header">PRODUCTION DETAILS</div>
                <table className="ps-print-table">
                    <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                    <tbody>
                        <tr>
                            <td><span className="ps-lbl">DATE &amp; TIME:</span> <span className="ps-val">{ps.testing?.dateTime ? fmtDT(ps.testing.dateTime) : ''}</span></td>
                            <td><span className="ps-lbl">TESTED BY:</span> <span className="ps-val">{ps.testing?.testedBy || ''}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2}><span className="ps-lbl">SET:</span></td>
                        </tr>
                        <tr>
                            <td><span className="ps-lbl">SET 1:</span> <span className="ps-val">{ps.testing?.set1 || ''}</span></td>
                            <td><span className="ps-lbl">SET 3:</span> <span className="ps-val">{ps.testing?.set3 || ''}</span></td>
                        </tr>
                        <tr>
                            <td><span className="ps-lbl">SET 2:</span> <span className="ps-val">{ps.testing?.set2 || ''}</span></td>
                            <td><span className="ps-lbl">SET 4:</span> <span className="ps-val">{ps.testing?.set4 || ''}</span></td>
                        </tr>
                    </tbody>
                </table>
                <table className="ps-print-table">
                    <colgroup><col style={{ width: '70%' }} /><col style={{ width: '30%' }} /></colgroup>
                    <tbody>
                        <tr>
                            <td><span className="ps-lbl">COMMENTS:</span> <span className="ps-val">{ps.testing?.comments || ''}</span></td>
                            <td><span className="ps-lbl">SIGN:-</span></td>
                        </tr>
                    </tbody>
                </table>

                <div className="ps-section-header">PACKING DETAILS</div>
                <table className="ps-print-table">
                    <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                    <tbody>
                        <tr><td colSpan={2}><span className="ps-lbl">DATE &amp; TIME:</span> <span className="ps-val">{ps.packing?.dateTime ? fmtDT(ps.packing.dateTime) : ''}</span></td></tr>
                        <tr>
                            <td><span className="ps-lbl">HANDOVER D/T:</span> <span className="ps-val">{ps.packing?.handoverDateTime ? fmtDT(ps.packing.handoverDateTime) : ''}</span></td>
                            <td><span className="ps-lbl">DELIVERY D/T:</span> <span className="ps-val">{ps.packing?.deliveryDateTime ? fmtDT(ps.packing.deliveryDateTime) : ''}</span></td>
                        </tr>
                        <tr><td colSpan={2}><span className="ps-lbl">DELIVERY TROUGH:</span> <span className="ps-val">{ps.packing?.deliveryThrough || ''}</span></td></tr>
                        <tr><td colSpan={2}><span className="ps-lbl">NAME OF PERSON:</span> <span className="ps-val">{ps.packing?.personName || ''}</span></td></tr>
                    </tbody>
                </table>
                <table className="ps-print-table">
                    <colgroup><col style={{ width: '70%' }} /><col style={{ width: '30%' }} /></colgroup>
                    <tbody>
                        <tr>
                            <td><span className="ps-lbl">COMMENTS:</span> <span className="ps-val">{ps.packing?.comments || ''}</span></td>
                            <td><span className="ps-lbl">SIGN:-</span></td>
                        </tr>
                    </tbody>
                </table>
                <table className="ps-print-table">
                    <colgroup><col style={{ width: '40%' }} /><col style={{ width: '30%' }} /><col style={{ width: '30%' }} /></colgroup>
                    <tbody>
                        <tr>
                            <td><span className="ps-lbl">LOAD RECEIVED:</span></td>
                            <td><span className="ps-lbl">YES/NO</span></td>
                            <td><span className="ps-val">{ps.packing?.loadReceived || ''}</span></td>
                        </tr>
                    </tbody>
                </table>

                <table className="ps-print-table ps-loadtest-table">
                    <colgroup>
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                        <col style={{ width: '14.28%' }} />
                    </colgroup>
                    <thead>
                        <tr className="ps-th-row">
                            <th>NLV</th><th>LV</th><th>LI</th><th>TRANS</th><th>EX1</th><th>EX2</th><th>EX3</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: Math.max((ps.items || []).length, 1) }, (_, i) => (
                            <tr key={i} className="ps-td-center">
                                <td>{i === 0 ? (ps.loadTest?.nlv || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.lv || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.li || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.trans || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.ex1 || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.ex2 || '') : ''}</td>
                                <td>{i === 0 ? (ps.loadTest?.ex3 || '') : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
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
                        <F l="Order Category">
                            <span style={{ 
                                padding: '4px 10px', 
                                borderRadius: 6, 
                                fontSize: 13, 
                                fontWeight: 700, 
                                background: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#fef2f2' : '#f1f5f9', 
                                color: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#dc2626' : '#475569',
                                border: `1px solid ${(ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#fca5a5' : '#e2e8f0'}`
                            }}>
                                {ps.orderCategory || ps.soId?.orderCategory || 'Order'}
                            </span>
                        </F>
                        {((ps.orderCategory || ps.soId?.orderCategory) === 'Replacement') && (ps.warrantyDetails || ps.soId?.warrantyDetails) && (
                            <div style={{ gridColumn: 'span 3', background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: 8, marginTop: 4 }}>
                                <label style={{ ...lbl, color: '#dc2626' }}>Warranty Details</label>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>{ps.warrantyDetails || ps.soId?.warrantyDetails}</div>
                            </div>
                        )}
                        <F l="Delivery Date"><input value={fmt(ps.deliveryDate)} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Sticker Type">
                            <input value={editing ? form.stickerType : ps.stickerType || ''}
                                onChange={e => setF('stickerType', e.target.value)}
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
                                    {['Sr', 'Item Code', 'Volt / Current', 'Qty', 'Hours', 'Dummy Load'].map(h => <th key={h} style={th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {(editing ? form.items : ps.items || []).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={td}>{i + 1}</td>
                                        <td style={td}>{item.itemCode || '—'}</td>
                                        <td style={td}>
                                            <div>{item.voltCurrent}</div>
                                            {item.additionalNotes && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', borderTop: '1px solid #f3f4f6', paddingTop: '4px' }}>{item.additionalNotes}</div>}
                                        </td>
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
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body {
                        width: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .production-sheet-page-root,
                    .production-sheet-page-root > * {
                        max-width: none !important;
                        min-width: 0 !important;
                    }
                    .production-sheet-page-root .no-print,
                    .production-sheet-page-root .no-print * {
                        display: none !important;
                    }
                    .production-sheet-print.ps-print-page {
                        display: block !important;
                        position: static !important;
                        width: 194mm !important;
                        min-width: 194mm !important;
                        max-width: 194mm !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                        transform: none !important;
                        zoom: 1 !important;
                    }
                    .production-sheet-print .ps-print-sheet {
                        width: 100% !important;
                        border: 1.5px solid #000;
                        box-sizing: border-box;
                    }
                    .production-sheet-print .ps-section-header {
                        text-align: center;
                        font-weight: 900;
                        background: #fff;
                        border: 1.5px solid #000;
                        border-bottom: none;
                        padding: 4px;
                        font-size: 12pt;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .production-sheet-print .ps-section-sub {
                        font-size: 10pt;
                    }
                    .production-sheet-print .ps-print-table {
                        width: 100% !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        border: 1.5px solid #000;
                        border-top: none;
                        margin: 0;
                        box-sizing: border-box;
                    }
                    .production-sheet-print .ps-print-table td,
                    .production-sheet-print .ps-print-table th {
                        border: 1px solid #000;
                        padding: 5px 8px;
                        font-size: 10pt;
                        vertical-align: middle;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    .production-sheet-print .ps-th-row {
                        background: #f1f5f9;
                        font-weight: 900;
                        text-align: center;
                    }
                    .production-sheet-print .ps-td-center { text-align: center !important; }
                    .production-sheet-print .ps-td-left { text-align: left !important; }
                    .production-sheet-print .ps-lbl {
                        font-weight: bold;
                        text-transform: uppercase;
                        margin-right: 6px;
                        white-space: nowrap;
                    }
                    .production-sheet-print .ps-val { font-weight: normal; }
                    .production-sheet-print .ps-item-note {
                        font-size: 9pt;
                        color: #555;
                        border-top: 0.5px solid #ccc;
                        margin-top: 2px;
                        padding-top: 2px;
                        text-align: left;
                    }
                }
            `}</style>
        </div>
    );
}
