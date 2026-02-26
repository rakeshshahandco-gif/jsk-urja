import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Plus, Trash2, Calculator, ChevronLeft, Settings, FileText, Activity, AlertCircle } from 'lucide-react';
import { getBOM, createBOM, updateBOM } from '@/services/bomApi';
import { getItems } from '@/services/itemApi';
import { PATHS } from '@/routes/paths';
import { useToast } from '@/components/ui/Toast';
import SearchableSelect from '@/components/ui/SearchableSelect';

// ── STYLES ────────────────────────────────────────────────────────────────────
const s = {
    page: { background: '#f1f5f9', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" },
    // Header
    header: { position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
    backBtn: { background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' },
    pageTitle: { fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 },
    pageSubtitle: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 },
    headerBtns: { display: 'flex', gap: 10 },
    cancelBtn: { padding: '9px 20px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer' },
    saveBtn: { padding: '9px 22px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(37,99,235,0.35)' },
    // Layout
    body: { padding: '24px 28px', maxWidth: 1600, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' },
    left: { display: 'flex', flexDirection: 'column', gap: 18 },
    right: { display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 72 },
    // Cards
    card: { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '22px 24px' },
    cardTitle: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 18px 0', display: 'flex', alignItems: 'center', gap: 8 },
    // Grid
    grid: (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 14 }),
    // Fields
    label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 5, letterSpacing: '0.03em' },
    input: { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' },
    inputFocus: { borderColor: '#3b82f6', background: '#fff' },
    select: { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
    hint: { fontSize: 10, color: '#94a3b8', marginTop: 3 },
    // Table
    tableWrap: { overflowX: 'auto', marginTop: 4 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { padding: '10px 12px', background: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
    thCenter: { textAlign: 'center' },
    td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
    tdInput: { width: '100%', padding: '6px 8px', border: '1px solid transparent', borderRadius: 6, fontSize: 12, outline: 'none', background: 'transparent', color: '#1e293b', boxSizing: 'border-box' },
    // Toggles / Actions
    toggle: (on) => ({ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }),
    toggleTrack: (on) => ({ width: 40, height: 22, borderRadius: 11, background: on ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }),
    toggleThumb: (on) => ({ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }),
    toggleLabel: { fontSize: 13, fontWeight: 500, color: '#374151' },
    // Buttons row
    addRowBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'background 0.15s' },
};

const BLANK_COMPONENT = {
    itemId: '', itemCode: '', itemName: '', category: '', uom: '',
    quantity: 0, rate: 0, totalCost: 0, points: 0, pointsLabourCost: 0, remarks: ''
};

// ── FIELD WRAPPER ─────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
    <div>
        <label style={s.label}>{label}</label>
        {children}
    </div>
);

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
const BOMFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(isEdit);
    const [items, setItems] = useState([]);
    const [finishedProducts, setFinishedProducts] = useState([]);

    const [form, setForm] = useState({
        bomNumber: '', finishedProductId: '', version: 'V1',
        revisionDate: new Date().toISOString().split('T')[0],
        status: 'Draft', productionQuantity: 1, bomType: 'Production',
        components: [{ ...BLANK_COMPONENT }],
        totalRawMaterialCost: 0, totalProcessCost: 0, overheadCost: 0,
        labourCost: 0, labourCostPerPoint: 0.25, totalPointsLabourCost: 0,
        finalProductionCostPerUnit: 0,
        processes: { smtAssembly: false, manualAssembly: false, testingRequired: false, qcRequired: false, packingRequired: false },
        isDefault: false, scrapAccount: '', remarks: ''
    });

    // ── FETCH DATA & AUTO REFRESH ─────────────────────────────────────────────
    const fetchItems = () => {
        getItems({ limit: 1000 }).then(res => {
            setItems(res.data);
            setFinishedProducts(res.data.filter(i => i.itemCategory === 'FINISHED_GOOD'));
        }).catch(() => console.error('Silent fail on refresh items'));
    };

    useEffect(() => {
        fetchItems();
        window.addEventListener('focus', fetchItems);
        return () => window.removeEventListener('focus', fetchItems);
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        getBOM(id).then(data => {
            setForm({
                ...data,
                labourCostPerPoint: data.labourCostPerPoint ?? 0.25,
                finishedProductId: data.finishedProductId?._id || data.finishedProductId,
                revisionDate: new Date(data.revisionDate).toISOString().split('T')[0],
                components: data.components.map(c => ({
                    ...BLANK_COMPONENT,   // ensures points/pointsLabourCost/remarks default to 0/''
                    ...c,
                    itemId: c.itemId?._id || c.itemId
                }))
            });
        }).catch(() => {
            addToast('Failed to load BOM', 'error');
            navigate(PATHS.INVENTORY.BOM.ROOT);
        }).finally(() => setLoading(false));
    }, [id, isEdit]);

    const handleCreateNewItem = () => {
        window.open(PATHS.INVENTORY.ITEMS.NEW, '_blank');
    };

    // ── AUTO-FILL POINTS & RATES FROM ITEM MASTER WHEN ITEMS LOAD ──────────────
    useEffect(() => {
        if (!isEdit || items.length === 0) return;
        setForm(prev => {
            const labourRate = parseFloat(prev.labourCostPerPoint) || 0;
            const updated = prev.components.map(comp => {
                if (!comp.itemId) return comp;
                const masterItem = items.find(i => i._id === comp.itemId);
                if (!masterItem) return comp;

                const pts = parseInt(masterItem.points) || comp.points || 0;

                // If rate in BOM is currently 0 or missing, try to auto-fetch the actual rate from item master
                let rate = parseFloat(comp.rate) || 0;
                if (rate === 0) {
                    rate = masterItem.purchaseRate || masterItem.valuationRate || 0;
                }

                const qty = parseFloat(comp.quantity) || 0;

                return {
                    ...comp,
                    points: pts,
                    rate: rate,
                    totalCost: qty * rate,
                    pointsLabourCost: qty * pts * labourRate
                };
            });
            return { ...prev, components: updated };
        });
    }, [items]); // runs once items are fetched

    // ── COMPONENT CHANGE ──────────────────────────────────────────────────────
    const handleComponentChange = (index, field, value, labourRate) => {
        const currentLabourRate = labourRate !== undefined ? labourRate : form.labourCostPerPoint;
        const newComponents = [...form.components];
        const comp = { ...newComponents[index] };

        if (field === 'itemId') {
            const item = items.find(i => i._id === value);
            if (item) {
                comp.itemId = value; comp.itemCode = item.itemCode;
                comp.itemName = item.itemName; comp.category = item.itemCategory;
                comp.uom = item.uom;
                comp.rate = item.purchaseRate || item.valuationRate || 0;
                comp.points = parseInt(item.points) || 0;
                comp.remarks = item.remarks || '';
            }
        } else {
            comp[field] = value;
        }

        const qty = parseFloat(comp.quantity) || 0;
        comp.totalCost = qty * (parseFloat(comp.rate) || 0);
        const pts = parseFloat(comp.points) || 0;
        comp.pointsLabourCost = qty * pts * (parseFloat(currentLabourRate) || 0);

        newComponents[index] = comp;
        setForm(prev => ({ ...prev, components: newComponents }));
    };

    const addComponent = () => setForm(prev => ({ ...prev, components: [...prev.components, { ...BLANK_COMPONENT }] }));

    const addComponentAfter = (index) => {
        const newComponents = [...form.components];
        newComponents.splice(index + 1, 0, { ...BLANK_COMPONENT });
        setForm(prev => ({ ...prev, components: newComponents }));
    };

    const removeComponent = (index) => {
        if (form.components.length === 1) return;
        setForm(prev => ({ ...prev, components: prev.components.filter((_, i) => i !== index) }));
    };

    // ── LABOUR RATE CHANGE ────────────────────────────────────────────────────
    const handleLabourRateChange = (newRate) => {
        const rate = parseFloat(newRate) || 0;
        const updatedComponents = form.components.map(comp => {
            const pts = parseFloat(comp.points) || 0;
            const qty = parseFloat(comp.quantity) || 0;
            return { ...comp, pointsLabourCost: qty * pts * rate };
        });
        setForm(prev => ({ ...prev, labourCostPerPoint: newRate, components: updatedComponents }));
    };

    // ── COST CALCULATION ──────────────────────────────────────────────────────
    useEffect(() => {
        const totalRM = form.components.reduce((sum, c) => sum + (parseFloat(c.totalCost) || 0), 0);
        const totalPointsLabour = form.components.reduce((sum, c) => sum + (parseFloat(c.pointsLabourCost) || 0), 0);
        const totalProcess = parseFloat(form.totalProcessCost) || 0;
        const overhead = parseFloat(form.overheadCost) || 0;
        const labour = parseFloat(form.labourCost) || 0;
        const prodQty = parseFloat(form.productionQuantity) || 1;
        setForm(prev => ({
            ...prev,
            totalRawMaterialCost: totalRM,
            totalPointsLabourCost: totalPointsLabour,
            finalProductionCostPerUnit: (totalRM + totalPointsLabour + totalProcess + overhead + labour) / prodQty
        }));
    }, [form.components, form.totalProcessCost, form.overheadCost, form.labourCost, form.productionQuantity]);

    // ── SUBMIT ────────────────────────────────────────────────────────────────
    const onSubmit = async () => {
        try {
            if (isEdit) { await updateBOM(id, form); addToast('BOM updated successfully', 'success'); }
            else { await createBOM(form); addToast('BOM created successfully', 'success'); }
            navigate(PATHS.INVENTORY.BOM.ROOT);
        } catch (error) {
            addToast(error.response?.data?.message || 'Failed to save BOM', 'error');
        }
    };

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: 15 }}>Loading BOM...</div>;

    const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div style={s.page}>
            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>
            {/* ── STICKY HEADER ── */}
            <div style={s.header}>
                <div style={s.headerLeft}>
                    <button style={s.backBtn} onClick={() => navigate(PATHS.INVENTORY.BOM.ROOT)}>
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <p style={s.pageTitle}>{isEdit ? `Edit BOM: ${form.bomNumber}` : 'Create New Bill of Material'}</p>
                        <p style={s.pageSubtitle}>{isEdit ? `Modified ${new Date(form.updatedAt).toLocaleDateString('en-IN')}` : 'New Production Specification'}</p>
                    </div>
                </div>
                <div style={s.headerBtns}>
                    <button style={s.cancelBtn} onClick={() => navigate(PATHS.INVENTORY.BOM.ROOT)}>Cancel</button>
                    <button style={s.saveBtn} onClick={onSubmit}>
                        <Save size={16} /> Save BOM
                    </button>
                </div>
            </div>

            <div style={s.body}>
                {/* ── LEFT COLUMN ── */}
                <div style={s.left}>

                    {/* BOM HEADER CARD */}
                    <div style={s.card}>
                        <p style={s.cardTitle}><FileText size={14} /> BOM Header</p>
                        <div style={s.grid(4)}>
                            <Field label="BOM Number">
                                <input style={s.input} placeholder="AUTO-GENERATE" value={form.bomNumber}
                                    onChange={e => setForm({ ...form, bomNumber: e.target.value })} disabled={isEdit} />
                            </Field>
                            <div style={{ gridColumn: 'span 2' }}>
                                <Field label="Finished Product *">
                                    <SearchableSelect
                                        options={finishedProducts.map(p => ({ value: p._id, label: `${p.itemCode} — ${p.itemName}` }))}
                                        value={form.finishedProductId}
                                        onChange={val => setForm({ ...form, finishedProductId: val })}
                                        placeholder="— Search Product from Item Master —"
                                        onCreateNew={handleCreateNewItem}
                                    />
                                </Field>
                            </div>
                            <Field label="Version">
                                <input style={{ ...s.input, fontFamily: 'monospace', fontWeight: 700 }} value={form.version}
                                    onChange={e => setForm({ ...form, version: e.target.value })} />
                            </Field>
                            <Field label="Revision Date">
                                <input type="date" style={s.input} value={form.revisionDate}
                                    onChange={e => setForm({ ...form, revisionDate: e.target.value })} />
                            </Field>
                            <Field label="Status">
                                <select style={s.select} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                    <option value="Draft">Draft</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </Field>
                            <Field label="Production Quantity">
                                <input type="number" style={{ ...s.input, fontWeight: 700, color: '#2563eb' }} value={form.productionQuantity}
                                    onChange={e => setForm({ ...form, productionQuantity: e.target.value })} />
                                <p style={s.hint}>BOM is defined for this quantity</p>
                            </Field>
                            <Field label="BOM Type">
                                <select style={s.select} value={form.bomType} onChange={e => setForm({ ...form, bomType: e.target.value })}>
                                    <option value="Production">Production</option>
                                    <option value="Sub-Assembly">Sub-Assembly</option>
                                    <option value="Service BOM">Service BOM</option>
                                </select>
                            </Field>
                        </div>
                    </div>

                    {/* COMPONENTS TABLE CARD */}
                    <div style={s.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <p style={{ ...s.cardTitle, margin: 0 }}><Settings size={14} /> Raw Material / Component Table</p>
                            <button
                                onClick={addComponent}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                <Plus size={14} /> Add Row
                            </button>
                        </div>
                        <div style={s.tableWrap}>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        {['#', 'Item / Code', 'Category', 'Qty', 'UOM', 'Rate (₹)', 'Total Cost', 'Pts', 'Labour Cost', 'Remark', ''].map((h, i) => (
                                            <th key={i} style={{ ...s.th, ...(i === 0 || i === 3 ? s.thCenter : {}) }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.components.map((comp, idx) => (
                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ ...s.td, textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: 11 }}>{idx + 1}</td>
                                            <td style={{ ...s.td, minWidth: 200 }}>
                                                <SearchableSelect
                                                    options={items.map(i => ({ value: i._id, label: `${i.itemCode} — ${i.itemName}` }))}
                                                    value={comp.itemId}
                                                    onChange={val => handleComponentChange(idx, 'itemId', val)}
                                                    placeholder="Search and Select Item..."
                                                    style={{ width: '100%', minWidth: 200 }}
                                                    onCreateNew={handleCreateNewItem}
                                                />
                                                {comp.itemName && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, paddingLeft: 2 }}>{comp.itemName}</div>}
                                            </td>
                                            <td style={s.td}>
                                                <span style={{ fontSize: 10, background: '#f1f5f9', padding: '3px 8px', borderRadius: 20, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{comp.category || '—'}</span>
                                            </td>
                                            <td style={{ ...s.td, width: 80 }}>
                                                <input type="number" style={{ ...s.tdInput, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, width: 70, background: '#fff', fontWeight: 700 }}
                                                    value={comp.quantity} onChange={e => handleComponentChange(idx, 'quantity', e.target.value)} />
                                            </td>
                                            <td style={{ ...s.td, color: '#64748b', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{comp.uom || '—'}</td>
                                            <td style={{ ...s.td, width: 90 }}>
                                                <input type="number" style={{ ...s.tdInput, border: '1px solid #e2e8f0', borderRadius: 6, width: 80, background: '#fff' }}
                                                    value={comp.rate} onChange={e => handleComponentChange(idx, 'rate', e.target.value)} />
                                            </td>
                                            <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                                                ₹{fmt(comp.totalCost)}
                                            </td>
                                            <td style={{ ...s.td, width: 60 }}>
                                                <input type="number" min="0" style={{ ...s.tdInput, border: '1px solid #bfdbfe', borderRadius: 6, width: 52, background: '#eff6ff', color: '#2563eb', fontWeight: 700, textAlign: 'center' }}
                                                    value={comp.points} onChange={e => handleComponentChange(idx, 'points', e.target.value)} />
                                            </td>
                                            <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
                                                ₹{fmt(comp.pointsLabourCost)}
                                            </td>
                                            <td style={{ ...s.td, width: 90 }}>
                                                <input type="text" style={{ ...s.tdInput, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontFamily: 'monospace', fontSize: 11 }}
                                                    value={comp.remarks || ''} onChange={e => handleComponentChange(idx, 'remarks', e.target.value)} placeholder="R25, U1..." />
                                            </td>
                                            <td style={{ ...s.td, width: 60 }}>
                                                <div style={{ display: 'flex', gap: 2 }}>
                                                    <button onClick={() => addComponentAfter(idx)} title="Add row below"
                                                        style={{ ...s.addRowBtn, color: '#94a3b8' }}
                                                        onMouseOver={e => e.currentTarget.style.color = '#16a34a'}
                                                        onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}>
                                                        <Plus size={14} />
                                                    </button>
                                                    <button onClick={() => removeComponent(idx)} title="Remove row"
                                                        style={{ ...s.addRowBtn, color: '#94a3b8' }}
                                                        onMouseOver={e => e.currentTarget.style.color = '#dc2626'}
                                                        onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Inline Add Row */}
                                    <tr onClick={addComponent} style={{ cursor: 'pointer', borderTop: '2px dashed #e2e8f0' }}
                                        onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                        <td colSpan={11} style={{ padding: '10px 12px', textAlign: 'center', color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <Plus size={14} /> Click to add new component row
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SETTINGS FOOTER */}
                    <div style={{ ...s.card, ...s.grid(3) }}>
                        {/* Is Default */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <label style={s.toggle(form.isDefault)} onClick={() => setForm({ ...form, isDefault: !form.isDefault })}>
                                <div style={s.toggleTrack(form.isDefault)}>
                                    <div style={s.toggleThumb(form.isDefault)} />
                                </div>
                                <span style={s.toggleLabel}>Is Default BOM?</span>
                            </label>
                        </div>

                        {/* Labour Rate Per Point */}
                        <Field label="⚡ Labour Rate Per Point (₹)">
                            <input type="number" min="0" step="0.01"
                                style={{ ...s.input, border: '2px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontWeight: 700 }}
                                value={form.labourCostPerPoint} onChange={e => handleLabourRateChange(e.target.value)} placeholder="0.25" />
                            <p style={s.hint}>e.g. ₹0.25 × 3 pts × qty = labour</p>
                        </Field>

                        {/* Remarks */}
                        <Field label="Remarks / Notes">
                            <textarea rows={2}
                                style={{ ...s.input, resize: 'vertical', lineHeight: 1.5 }}
                                value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })}
                                placeholder="Additional details about this BOM version..." />
                        </Field>
                    </div>
                </div>

                {/* ── RIGHT COLUMN ── */}
                <div style={s.right}>
                    {/* COST SUMMARY */}
                    <div style={{ background: 'linear-gradient(145deg, #1e3a5f, #1e293b)', borderRadius: 16, padding: 24, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Calculator size={14} /> Costing Summary
                        </p>

                        {/* Raw Material */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 12 }}>
                            <span style={{ fontSize: 13, opacity: 0.85 }}>Raw Material</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>₹{fmt(form.totalRawMaterialCost)}</span>
                        </div>

                        {/* Component Labour */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(251,191,36,0.15)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                            <span style={{ fontSize: 12, color: '#fcd34d', fontWeight: 600 }}>Component Labour (Points)</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fcd34d', fontSize: 13 }}>₹{fmt(form.totalPointsLabourCost)}</span>
                        </div>

                        {/* Editable costs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                            {[
                                ['Process Cost', 'totalProcessCost'],
                                ['Overhead Cost', 'overheadCost'],
                                ['Other Labour', 'labourCost'],
                            ].map(([label, key]) => (
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
                                    <input type="number"
                                        style={{ width: 80, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 8px', textAlign: 'right', color: '#fff', fontSize: 12, outline: 'none' }}
                                        value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
                                </div>
                            ))}
                        </div>

                        {/* Final Cost */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 16, textAlign: 'center' }}>
                            <p style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px 0' }}>Final Cost Per Unit</p>
                            <p style={{ fontSize: 34, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #93c5fd, #c4b5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                ₹{fmt(form.finalProductionCostPerUnit)}
                            </p>
                        </div>
                    </div>

                    {/* PROCESS FLOW */}
                    <div style={s.card}>
                        <p style={s.cardTitle}><Activity size={14} /> Process Flow</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {Object.entries(form.processes).map(([key, value]) => (
                                <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: value ? '#eff6ff' : 'transparent', transition: 'background 0.15s' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <input type="checkbox" style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: 'pointer' }}
                                        checked={value} onChange={e => setForm({ ...form, processes: { ...form.processes, [key]: e.target.checked } })} />
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* TIP */}
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 14, display: 'flex', gap: 10 }}>
                        <AlertCircle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 11, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                            <strong>Pro Tip:</strong> Ensure individual item rates are updated in the Item Master to get accurate BOM costing automatically.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BOMFormPage;
