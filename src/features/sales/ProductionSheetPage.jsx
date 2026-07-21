import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { getProductionSheetById, updateProductionSheet } from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

/** Canonical print grid — every row's colspan total must equal 6. */
const C1 = 1;
const C2 = 2;
const C3 = 3;
const C4 = 4;
const C6 = 6;

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '9px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const STATUS_OPTS = ['Draft', 'Pending', 'In Production', 'Testing', 'In Testing', 'Ready for Packing', 'Ready', 'Dispatched', 'Completed'];
const STATUS_COLORS = {
    Draft: '#64748b',
    Pending: '#d97706',
    'In Production': '#7c3aed',
    Testing: '#2563eb',
    'In Testing': '#2563eb',
    'Ready for Packing': '#0891b2',
    Ready: '#16a34a',
    Dispatched: '#059669',
    Completed: '#0f766e',
};

export default function ProductionSheetPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ps, setPS] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [form, setForm] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getProductionSheetById(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([psData, compData]) => {
            setPS(psData);
            const loadTestRows = Array.isArray(psData.loadTestRows) && psData.loadTestRows.length
                ? psData.loadTestRows
                : [psData.loadTest || { nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', ex3: '' }];
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
                    signature: psData.testing?.signature || '',
                },
                packing: {
                    dateTime: psData.packing?.dateTime || '',
                    handoverDateTime: psData.packing?.handoverDateTime || '',
                    deliveryDateTime: psData.packing?.deliveryDateTime || '',
                    deliveryThrough: psData.packing?.deliveryThrough || '',
                    personName: psData.packing?.personName || '',
                    comments: psData.packing?.comments || '',
                    loadReceived: psData.packing?.loadReceived || 'NO',
                    signature: psData.packing?.signature || '',
                },
                loadTest: psData.loadTest || { nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', ex3: '' },
                loadTestRows,
            });
            setCompany(compData?.data || {});
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        document.body.classList.add('ps-printing-ready');
        return () => {
            document.body.classList.remove('ps-printing-ready');
            document.body.classList.remove('ps-printing');
        };
    }, []);

    useEffect(() => {
        const onBefore = () => document.body.classList.add('ps-printing');
        const onAfter = () => document.body.classList.remove('ps-printing');
        window.addEventListener('beforeprint', onBefore);
        window.addEventListener('afterprint', onAfter);
        return () => {
            window.removeEventListener('beforeprint', onBefore);
            window.removeEventListener('afterprint', onAfter);
        };
    }, []);

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

    const handleRefreshFromSO = async () => {
        toast('Refresh from Sales Order is not enabled on this deployment yet.');
    };

    const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
    const fmtDT = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—';
    const qtyLabel = (item) => `${item.qty ?? 0} ${item.uom || 'Nos'}`;
    const extraChangeOf = (item) => item.extraChange || item.hours || '';
    /** Print/display only — prefer saved snapshot voltCurrent, then notes (SO additionalNotes snapshot). Do not invent values. */
    const voltCurrentOf = (item) => {
        const v = item?.voltCurrent || item?.voltageCurrent || item?.notes || item?.additionalNotes || '';
        return String(v).trim();
    };
    const loadTestPrintRows = (() => {
        const saved = Array.isArray(ps?.loadTestRows) && ps.loadTestRows.length
            ? ps.loadTestRows
            : (ps?.loadTest && (ps.loadTest.nlv || ps.loadTest.lv || ps.loadTest.li || ps.loadTest.trans || ps.loadTest.ex1 || ps.loadTest.ex2 || ps.loadTest.ex3)
                ? [ps.loadTest]
                : []);
        const minRows = Math.max(saved.length, Math.min(Math.max((ps?.items || []).length, 3), 6), 3);
        const rows = [...saved];
        while (rows.length < minRows) rows.push({ nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', ex3: '' });
        return rows;
    })();

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
            {/* Production Order print — body portal + single 6-column main table (no unused right parent column). */}
            {typeof document !== 'undefined' && createPortal(
                <div className="ps-print-portal production-order-print" data-ps-print-portal="1">
                    <table className="production-order-main-table">
                        <colgroup>
                            <col style={{ width: '6%' }} />
                            <col style={{ width: '24%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '16%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '18%' }} />
                        </colgroup>
                        <tbody>
                            <tr>
                                <td colSpan={C6} className="ps-sec-hd">ORDER DETAILS</td>
                            </tr>
                            <tr>
                                <td colSpan={C6} className="ps-sec-hd ps-sec-sub">Production Order / Sheet</td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">DATE &amp; TIME:-</span> <span className="ps-val">{fmtDT(ps.createdAt)}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">SO NO:-</span> <span className="ps-val">{ps.soNumber}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">CUSTOMER NAME:-</span> <span className="ps-val">{ps.customerName || '—'}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">CLIENT CODE:-</span> <span className="ps-val">{ps.customerCode || '—'}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">DELIVERY DATE:-</span> <span className="ps-val">{fmt(ps.deliveryDate)}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">ADDRESS:-</span> <span className="ps-val">{ps.customerAddress || '—'}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">ORDERED BY:-</span> <span className="ps-val">{ps.orderedBy || '—'}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">PRODUCTION IN-CHARGE:-</span> <span className="ps-val">{ps.productionInCharge || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">STICKER:-</span> <span className="ps-val">{ps.stickerType || ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">SIGN:-</span> <span className="ps-val">{ps.signMark || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">CABINET:-</span> <span className="ps-val">{ps.cabinetType || ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">WIRES:-</span> <span className="ps-val">{ps.wires || ps.acDc || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">REPEAT ORDER:-</span> <span className="ps-val">{ps.repeatOrder || ''}</span></td>
                                <td colSpan={C3}>
                                    <span className="ps-lbl">ORDER CATEGORY:-</span>
                                    <span className="ps-val" style={{
                                        color: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#dc2626' : 'inherit',
                                        fontWeight: 'bold',
                                    }}>
                                        {ps.orderCategory || ps.soId?.orderCategory || 'Order'}
                                    </span>
                                </td>
                            </tr>
                            {((ps.orderCategory || ps.soId?.orderCategory) === 'Replacement') && (ps.warrantyDetails || ps.soId?.warrantyDetails) && (
                                <tr>
                                    <td colSpan={C6} style={{ background: '#f8fafc' }}>
                                        <span className="ps-lbl" style={{ color: '#dc2626' }}>Warranty Details:</span>
                                        <span className="ps-val" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                            {ps.warrantyDetails || ps.soId?.warrantyDetails}
                                        </span>
                                    </td>
                                </tr>
                            )}

                            <tr className="ps-th-row">
                                <td colSpan={C1} className="ps-td-center">SR NO</td>
                                <td colSpan={C1} className="ps-td-center">MODEL NO</td>
                                <td colSpan={C1} className="ps-td-center">VOLT/CURRENT</td>
                                <td colSpan={C1} className="ps-td-center">QUANTITY</td>
                                <td colSpan={C1} className="ps-td-center">EXTRA CHANGE</td>
                                <td colSpan={C1} className="ps-td-center">DUMMY LOAD</td>
                            </tr>
                            {(ps.items || []).map((item, i) => (
                                <tr key={i}>
                                    <td colSpan={C1} className="ps-td-center">{item.srNo || (i + 1)}</td>
                                    <td colSpan={C1} className="ps-td-left">{item.modelNo || item.itemCode || '—'}</td>
                                    <td colSpan={C1} className="ps-td-left">{voltCurrentOf(item) || '—'}</td>
                                    <td colSpan={C1} className="ps-td-center">{qtyLabel(item)}</td>
                                    <td colSpan={C1} className="ps-td-center">{extraChangeOf(item) || ''}</td>
                                    <td colSpan={C1} className="ps-td-center">{item.dummyLoad || ''}</td>
                                </tr>
                            ))}

                            <tr>
                                <td colSpan={C6} className="ps-sec-hd">PRODUCTION DETAILS</td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">DATE &amp; TIME:</span> <span className="ps-val">{ps.testing?.dateTime ? fmtDT(ps.testing.dateTime) : ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">TESTED BY:</span> <span className="ps-val">{ps.testing?.testedBy || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">SET:</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">SET 1:</span> <span className="ps-val">{ps.testing?.set1 || ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">SET 3:</span> <span className="ps-val">{ps.testing?.set3 || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">SET 2:</span> <span className="ps-val">{ps.testing?.set2 || ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">SET 4:</span> <span className="ps-val">{ps.testing?.set4 || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C4}><span className="ps-lbl">COMMENTS:</span> <span className="ps-val">{ps.testing?.comments || ''}</span></td>
                                <td colSpan={C2}><span className="ps-lbl">SIGN:</span> <span className="ps-val">{ps.testing?.signature || ''}</span></td>
                            </tr>

                            <tr>
                                <td colSpan={C6} className="ps-sec-hd">PACKING DETAILS</td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">DATE &amp; TIME:</span> <span className="ps-val">{ps.packing?.dateTime ? fmtDT(ps.packing.dateTime) : ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">HANDOVER DATE &amp; TIME:</span> <span className="ps-val">{ps.packing?.handoverDateTime ? fmtDT(ps.packing.handoverDateTime) : ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">DELIVERY DATE &amp; TIME:</span> <span className="ps-val">{ps.packing?.deliveryDateTime ? fmtDT(ps.packing.deliveryDateTime) : ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">DELIVERY THROUGH:</span> <span className="ps-val">{ps.packing?.deliveryThrough || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C6}><span className="ps-lbl">NAME OF PERSON:</span> <span className="ps-val">{ps.packing?.personName || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C4}><span className="ps-lbl">COMMENTS:</span> <span className="ps-val">{ps.packing?.comments || ''}</span></td>
                                <td colSpan={C2}><span className="ps-lbl">SIGN:</span> <span className="ps-val">{ps.packing?.signature || ''}</span></td>
                            </tr>
                            <tr>
                                <td colSpan={C3}><span className="ps-lbl">LOAD RECEIVED:</span> <span className="ps-val">{ps.packing?.loadReceived || ''}</span></td>
                                <td colSpan={C3}><span className="ps-lbl">YES / NO</span></td>
                            </tr>

                            <tr>
                                <td colSpan={C6} className="ps-nested-cell">
                                    <table className="ps-loadtest-table">
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
                                                <th>NLV</th>
                                                <th>LV</th>
                                                <th>LI</th>
                                                <th>Trans</th>
                                                <th>Ex1</th>
                                                <th>Ex2</th>
                                                <th>Ex3</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loadTestPrintRows.map((row, i) => (
                                                <tr key={i} className="ps-td-center ps-loadtest-row">
                                                    <td>{row.nlv || ''}</td>
                                                    <td>{row.lv || ''}</td>
                                                    <td>{row.li || ''}</td>
                                                    <td>{row.trans || ''}</td>
                                                    <td>{row.ex1 || ''}</td>
                                                    <td>{row.ex2 || ''}</td>
                                                    <td>{row.ex3 || ''}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>,
                document.body,
            )}

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
                            SO Ref: <strong style={{ color: '#374151' }}>{ps.soNumber}</strong>
                            {' · '}Customer: <strong style={{ color: '#374151' }}>{ps.customerName || '—'}</strong>
                            {' · '}Code: <strong style={{ color: '#374151' }}>{ps.customerCode || '—'}</strong>
                        </div>
                        {ps.salesOrderUpdatedAfterPull && (
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, color: '#92400e', fontSize: 13, fontWeight: 600 }}>
                                Sales Order has been updated after this Production Order was created.
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {editing ? (
                            <>
                                <button onClick={() => { setEditing(false); load(); }} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Discard</button>
                                <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                                    {saving ? 'Saving...' : '✓ Save Changes'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleRefreshFromSO} disabled={refreshing} style={{ padding: '9px 14px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                    {refreshing ? 'Refreshing…' : '↻ Refresh from Sales Order'}
                                </button>
                                <button onClick={() => { document.body.classList.add('ps-printing'); window.print(); }} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
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
                        <F l="Customer Name"><input value={ps.customerName || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Client Code"><input value={ps.customerCode || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Sales Order No"><input value={ps.soNumber || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <div style={{ gridColumn: 'span 3' }}>
                            <F l="Address"><input value={ps.customerAddress || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        </div>
                        <F l="Ordered By"><input value={ps.orderedBy || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Production In-Charge">
                            <input value={editing ? (form.productionInCharge || '') : (ps.productionInCharge || '')}
                                onChange={e => setF('productionInCharge', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, background: '#f8f9fa' }} />
                        </F>
                        <F l="Delivery Date"><input value={fmt(ps.deliveryDate)} readOnly style={{ ...inp, background: '#f8f9fa' }} /></F>
                        <F l="Repeat Order">
                            {editing ? (
                                <select value={form.repeatOrder || ''} onChange={e => setF('repeatOrder', e.target.value)} style={inp}>
                                    <option value="">—</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            ) : <input value={ps.repeatOrder || '—'} readOnly style={{ ...inp, background: '#f8f9fa' }} />}
                        </F>
                        <F l="Sticker">
                            <input value={editing ? form.stickerType : ps.stickerType || ''}
                                onChange={e => setF('stickerType', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, background: '#f8f9fa' }} />
                        </F>
                        <F l="Sign">
                            <input value={editing ? (form.signMark || '') : (ps.signMark || '')}
                                onChange={e => setF('signMark', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, background: '#f8f9fa' }} />
                        </F>
                        <F l="Cabinet">
                            <input value={editing ? (form.cabinetType || '') : (ps.cabinetType || '')}
                                onChange={e => setF('cabinetType', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, background: '#f8f9fa' }} />
                        </F>
                        <F l="Wires">
                            <input value={editing ? (form.wires || form.acDc || '') : (ps.wires || ps.acDc || '')}
                                onChange={e => setF('wires', e.target.value)}
                                readOnly={!editing}
                                style={editing ? inp : { ...inp, background: '#f8f9fa' }} />
                        </F>
                        <F l="Order Category">
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 700,
                                background: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#fef2f2' : '#f1f5f9',
                                color: (ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#dc2626' : '#475569',
                                border: `1px solid ${(ps.orderCategory || ps.soId?.orderCategory) === 'Replacement' ? '#fca5a5' : '#e2e8f0'}`,
                            }}>
                                {ps.orderCategory || ps.soId?.orderCategory || 'Order'}
                            </span>
                        </F>
                        <F l="Status">
                            {editing ? (
                                <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                                    {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                                </select>
                            ) : <span>{ps.status}</span>}
                        </F>
                        {((ps.orderCategory || ps.soId?.orderCategory) === 'Replacement') && (ps.warrantyDetails || ps.soId?.warrantyDetails) && (
                            <div style={{ gridColumn: 'span 3', background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: 8, marginTop: 4 }}>
                                <label style={{ ...lbl, color: '#dc2626' }}>Warranty Details</label>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>{ps.warrantyDetails || ps.soId?.warrantyDetails}</div>
                            </div>
                        )}
                    </G>
                </Section>

                {/* Items Table */}
                <Section title="Order Items" icon="🔧">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['SR NO', 'MODEL NO', 'VOLT/CURRENT', 'QUANTITY', 'EXTRA CHANGE', 'DUMMY LOAD'].map(h => <th key={h} style={th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {(editing ? form.items : ps.items || []).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={td}>{item.srNo || (i + 1)}</td>
                                        <td style={td}>{item.modelNo || item.itemCode || '—'}</td>
                                        <td style={td}>
                                            {editing ? (
                                                <input value={item.voltCurrent || ''} onChange={e => {
                                                    const its = [...form.items]; its[i] = { ...its[i], voltCurrent: e.target.value }; setF('items', its);
                                                }} style={inp} />
                                            ) : (voltCurrentOf(item) || '—')}
                                        </td>
                                        <td style={td}>{qtyLabel(item)}</td>
                                        <td style={td}>
                                            {editing ? (
                                                <input value={item.extraChange || ''} onChange={e => {
                                                    const its = [...form.items]; its[i] = { ...its[i], extraChange: e.target.value }; setF('items', its);
                                                }} style={inp} />
                                            ) : (extraChangeOf(item) || '—')}
                                        </td>
                                        <td style={td}>
                                            {editing ? (
                                                <input value={item.dummyLoad || ''} onChange={e => {
                                                    const its = [...form.items]; its[i] = { ...its[i], dummyLoad: e.target.value }; setF('items', its);
                                                }} style={inp} />
                                            ) : (item.dummyLoad || '—')}
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
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['NLV', 'LV', 'LI', 'Trans', 'Ex1', 'Ex2', 'Ex3'].map(h => <th key={h} style={th}>{h}</th>)}
                                    {editing && <th style={th} />}
                                </tr>
                            </thead>
                            <tbody>
                                {(form.loadTestRows || []).map((row, i) => (
                                    <tr key={i}>
                                        {['nlv', 'lv', 'li', 'trans', 'ex1', 'ex2', 'ex3'].map(k => (
                                            <td key={k} style={td}>
                                                {editing ? (
                                                    <input
                                                        value={row?.[k] || ''}
                                                        onChange={e => {
                                                            const rows = [...(form.loadTestRows || [])];
                                                            rows[i] = { ...rows[i], [k]: e.target.value };
                                                            setF('loadTestRows', rows);
                                                            if (i === 0) setF(`loadTest.${k}`, e.target.value);
                                                        }}
                                                        style={inp}
                                                    />
                                                ) : (
                                                    <span style={{ fontWeight: 600 }}>{row?.[k] || '—'}</span>
                                                )}
                                            </td>
                                        ))}
                                        {editing && (
                                            <td style={td}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const rows = (form.loadTestRows || []).filter((_, idx) => idx !== i);
                                                        setF('loadTestRows', rows.length ? rows : [{ nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', ex3: '' }]);
                                                    }}
                                                    style={{ border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {editing && (
                        <button
                            type="button"
                            onClick={() => setF('loadTestRows', [...(form.loadTestRows || []), { nlv: '', lv: '', li: '', trans: '', ex1: '', ex2: '', ex3: '' }])}
                            style={{ marginTop: 10, padding: '7px 12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
                        >
                            + Add test row
                        </button>
                    )}
                </Section>
            </div>

            <style>{`
                .ps-print-portal.production-order-print {
                    display: none;
                }
                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    /* Hide SPA chrome; only body-level Production Order print portal remains */
                    body.ps-printing > #root,
                    body.ps-printing > *:not(.ps-print-portal):not(script):not(style) {
                        display: none !important;
                    }
                    body.ps-printing > .ps-print-portal.production-order-print,
                    .ps-print-portal.production-order-print {
                        display: block !important;
                        position: static !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                        background: #fff !important;
                        color: #000 !important;
                    }
                    .production-order-print,
                    .production-order-main-table {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        box-sizing: border-box !important;
                    }
                    .production-order-main-table {
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        border: 1.5px solid #000 !important;
                    }
                    .production-order-main-table tr,
                    .production-order-main-table td,
                    .production-order-main-table th {
                        box-sizing: border-box !important;
                    }
                    .production-order-main-table > tbody > tr > td {
                        border: 1px solid #000 !important;
                        padding: 5px 7px !important;
                        font-size: 9.5pt !important;
                        vertical-align: middle !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    .production-order-main-table .ps-sec-hd {
                        text-align: center !important;
                        font-weight: 900 !important;
                        font-size: 11pt !important;
                        background: #fff !important;
                        padding: 4px 6px !important;
                    }
                    .production-order-main-table .ps-sec-sub {
                        font-size: 10pt !important;
                    }
                    .production-order-main-table .ps-th-row > td,
                    .production-order-main-table .ps-th-row > th {
                        background: #f1f5f9 !important;
                        font-weight: 900 !important;
                        text-align: center !important;
                    }
                    .production-order-main-table .ps-td-center { text-align: center !important; }
                    .production-order-main-table .ps-td-left { text-align: left !important; }
                    .production-order-main-table .ps-lbl {
                        font-weight: bold !important;
                        text-transform: uppercase !important;
                        margin-right: 6px !important;
                    }
                    .production-order-main-table .ps-val { font-weight: normal !important; }
                    .production-order-main-table .ps-nested-cell {
                        padding: 0 !important;
                    }
                    .production-order-main-table .ps-loadtest-table {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        border: none !important;
                    }
                    .production-order-main-table .ps-loadtest-table th,
                    .production-order-main-table .ps-loadtest-table td {
                        border: 1px solid #000 !important;
                        padding: 5px 4px !important;
                        font-size: 9.5pt !important;
                        box-sizing: border-box !important;
                    }
                    .production-order-main-table .ps-loadtest-row td {
                        height: 22px !important;
                        min-height: 22px !important;
                    }
                }
            `}</style>
        </div>
    );
}
