import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, RefreshCw, Package } from 'lucide-react';
import { getItem, createItem, updateItem, generateItemCode } from '@/services/itemApi';
import { getItemTypes } from '@/services/itemTypeApi';
import { getItemGroups } from '@/services/itemGroupApi';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

// ── Shared compact style helpers ─────────────────────────────────────────────
const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3, letterSpacing: '0.04em' },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', height: 30, fontSize: 12, padding: '0 22px 0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center', backgroundSize: '1em', boxSizing: 'border-box' },
    textarea: { width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
    toggle: (on) => ({ width: 34, height: 18, borderRadius: 9, background: on ? '#2563eb' : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }),
    toggleThumb: (on) => ({ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }),
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 },
};

const Field = ({ label, children }) => (
    <div><label style={f.label}>{label}</label>{children}</div>
);

const Toggle = ({ value, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30 }}>
        <button type="button" style={f.toggle(value)} onClick={() => onChange(!value)}>
            <div style={f.toggleThumb(value)} />
        </button>
        <span style={{ fontSize: 12, color: value ? '#2563eb' : '#6b7280', fontWeight: 600 }}>{label || (value ? 'Yes' : 'No')}</span>
    </div>
);

// ── TABS DEFINITION ─────────────────────────────────────────────────────────
const TABS = [
    { id: 'basic', label: '1. Basic Info' },
    { id: 'stock', label: '2. Stock' },
    { id: 'purchase', label: '3. Purchase' },
    { id: 'sales', label: '4. Sales' },
    { id: 'production', label: '5. Production' },
    { id: 'technical', label: '6. Technical' },
];

// ── DEFAULT FORM STATE ───────────────────────────────────────────────────────
const DEFAULT = {
    itemCode: '', itemName: '', itemGroupName: '', itemCategory: 'RAW_MATERIAL', itemType: 'OTHER', uom: 'NOS', points: '', description: '',
    openingStock: 0, currentStock: 0, faultyStock: 0, minStockLevel: 0, maxStockLevel: 0, valuationRate: 0, warehouseLocation: '', batchTracking: false, serialTracking: false,
    defaultSupplier: '', purchaseRate: 0, purchaseGst: 18, hsnCode: '', leadTimeDays: 0,
    uqc: '', goodsOrService: 'Goods', cessRate: 0,
    sellingPrice: 0, mrp: 0, warrantyMonths: 0, salesGst: 18, productDescription: '',
    isManufacturable: false, bomLink: '', productionTimeHours: 0, machineRequired: '', qcRequired: false, stdProductionCost: 0,
    technical: { wattage: '', inputVoltage: '', outputVoltage: '', outputCurrent: '', dimmingType: '', ipRating: '', surgeProtection: '', efficiency: '' },
    purchaseAccount: '', salesAccount: '', inventoryAccount: '', cogsAccount: '',
    isActive: true, isServiceItem: false, allowNegativeStock: false,
    remarks: '',
};

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
const ItemFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const isEdit = Boolean(id);
    const [activeTab, setActiveTab] = useState('basic');
    const [form, setForm] = useState({ ...DEFAULT });
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [originalItemName, setOriginalItemName] = useState('');
    const [itemTypes, setItemTypes] = useState([]);
    const [itemGroups, setItemGroups] = useState([]);

    const selectedTypeData = itemTypes.find(t => t.code === form.itemType);
    const isElectrical = selectedTypeData?.isElectrical || form.itemType === 'ELECTRICAL' || form.itemType === 'FINISHED_PRODUCT';

    useEffect(() => {
        if (!isEdit) return;
        getItem(id)
            .then(data => {
                setForm({ ...DEFAULT, ...data, technical: { ...DEFAULT.technical, ...(data.technical || {}) } });
                setOriginalItemName(data.itemName || '');
            })
            .catch((err) => {
                console.error('Load Item Error:', err);
                addToast(err?.response?.data?.message || 'Failed to load item', 'error');
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        getItemTypes().then(data => {
            setItemTypes(Array.isArray(data) ? data : []);
        }).catch(err => console.error('Failed to fetch item types', err));

        // Fetch ALL groups (no isActive filter) so newly created groups always appear
        getItemGroups().then(data => {
            setItemGroups(Array.isArray(data) ? data : []);
        }).catch(err => console.error('Failed to fetch item groups', err));
    }, []);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const setTech = (key, val) => setForm(f => ({ ...f, technical: { ...f.technical, [key]: val } }));
    const num = (key, val) => set(key, val === '' ? 0 : Number(val));

    const handleGenerateCode = async () => {
        setGeneratingCode(true);
        try {
            const code = await generateItemCode(form.itemType);
            set('itemCode', code);
        } catch { addToast('Could not generate code', 'error'); }
        finally { setGeneratingCode(false); }
    };

    const handleSave = async () => {
        if (!form.itemName.trim()) { addToast('Item Name is required', 'error'); setActiveTab('basic'); return; }
        if (!form.itemCode.trim()) { addToast('Item Code is required — click Auto-Generate', 'error'); setActiveTab('basic'); return; }
        setSaving(true);
        try {
            if (isEdit) await updateItem(id, form);
            else await createItem(form);
            addToast(isEdit ? 'Item updated!' : 'Item created!', 'success');
            navigate('/inventory/items');
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save item', 'error');
        } finally { setSaving(false); }
    };

    if (loading) return (
        <BrandedLoader size={120} />
    );

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate('/inventory/items')} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronLeft size={15} />
                    </button>
                    <Package size={15} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{isEdit ? 'Edit Item' : 'New Item'}</span>
                    {form.itemCode && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '1px 8px', borderRadius: 4, fontWeight: 700 }}>{form.itemCode}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate('/inventory/items'); }} style={{ height: 30, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Save size={13} /> {saving ? 'Saving…' : (isEdit ? 'Update Item' : 'Save Item')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: 3, gap: 2, overflowX: 'auto' }}>
                {TABS.filter(t => t.id !== 'technical' || isElectrical || true).map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', background: activeTab === tab.id ? '#2563eb' : 'transparent', color: activeTab === tab.id ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, flex: 1 }}>

                {/* ── TAB 1: BASIC ── */}
                {activeTab === 'basic' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Basic Information</div>
                        {/* Row 1: Code + Name */}
                        <div style={f.row(3)}>
                            <div>
                                <label style={f.label}>Item Code *</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input style={{ ...f.input, flex: 1, fontFamily: 'monospace', fontWeight: 700 }} value={form.itemCode} onChange={e => set('itemCode', e.target.value.toUpperCase())} placeholder="I0001" />
                                    <button type="button" onClick={handleGenerateCode} disabled={generatingCode} title="Auto-generate code"
                                        style={{ height: 30, width: 30, border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                                        <RefreshCw size={12} style={{ animation: generatingCode ? 'spin 1s linear infinite' : 'none' }} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <Field label="Item Name *">
                                    <input style={f.input} value={form.itemName} onChange={e => set('itemName', e.target.value)} placeholder="12W Phase Cut Dimmable Driver" />
                                </Field>
                                {isEdit && originalItemName && form.itemName && originalItemName !== form.itemName && (
                                    <div style={{ fontSize: '10px', color: '#e11d48', marginTop: '4px', background: '#fff1f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>⚠️</span>
                                        <span>Changing this name will update it globally in all past & future records.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Description */}
                        <div>
                            <Field label="Description">
                                <textarea style={{ ...f.textarea, minHeight: 40 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the item..." />
                            </Field>
                        </div>
                        {/* Row 2: Category + Type + Group + UOM + Points */}
                        <div style={f.row(3)}>
                            <Field label="Item Category *">
                                <select style={f.sel} value={form.itemCategory} onChange={e => set('itemCategory', e.target.value)}>
                                    <option value="RAW_MATERIAL">Raw Material</option>
                                    <option value="WIP">WIP / Semi-Finished</option>
                                    <option value="FINISHED_GOOD">Finished Good</option>
                                    <option value="TRADING">Trading Item</option>
                                    <option value="CONSUMABLE">Consumable</option>
                                </select>
                            </Field>
                            <Field label="Item Type">
                                <select style={f.sel} value={form.itemType} onChange={e => set('itemType', e.target.value)}>
                                    <option value="OTHER">Other</option>
                                    {itemTypes.map(t => (
                                        <option key={t._id} value={t.code}>{t.name}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Item Group Name">
                                <select style={f.sel} value={form.itemGroupName} onChange={e => set('itemGroupName', e.target.value)}>
                                    <option value="">-- No Group --</option>
                                    {itemGroups.map(g => (
                                        <option key={g._id} value={g.name}>{g.name}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="UOM">
                                <select style={f.sel} value={form.uom} onChange={e => set('uom', e.target.value)}>
                                    <option value="NOS">Nos</option>
                                    <option value="PCS">Pcs</option>
                                    <option value="METER">Meter</option>
                                    <option value="KG">Kg</option>
                                    <option value="BOX">Box</option>
                                    <option value="SET">Set</option>
                                    <option value="ROLL">Roll</option>
                                    <option value="LITRE">Litre</option>
                                </select>
                            </Field>
                            <Field label="Points (Leads)">
                                <select style={f.sel} value={form.points} onChange={e => set('points', e.target.value)}>
                                    <option value="">-- None --</option>
                                    <option value="2">2 Point</option>
                                    <option value="3">3 Point</option>
                                    <option value="4">4 Point</option>
                                    <option value="5">5 Point</option>
                                    <option value="6">6 Point</option>
                                    <option value="8">8 Point</option>
                                    <option value="other">Other</option>
                                </select>
                            </Field>
                        </div>
                        {/* Row 3: HSN/GST Info */}
                        <div style={f.row(4)}>
                            <Field label="HSN Code (Legacy)">
                                <input style={f.input} value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} placeholder="8504" />
                            </Field>
                            <Field label="UQC (GSTR-1)">
                                <select style={f.sel} value={form.uqc} onChange={e => set('uqc', e.target.value)}>
                                    <option value="">Auto from UOM</option>
                                    <option value="NOS-NUMBERS">NOS-NUMBERS</option>
                                    <option value="PCS-PIECES">PCS-PIECES</option>
                                    <option value="KGS-KILOGRAMS">KGS-KILOGRAMS</option>
                                    <option value="MTR-METERS">MTR-METERS</option>
                                    <option value="BOX-BOXES">BOX-BOXES</option>
                                    <option value="SET-SETS">SET-SETS</option>
                                    <option value="ROL-ROLLS">ROL-ROLLS</option>
                                </select>
                            </Field>
                            <Field label="Goods / Service">
                                <select style={f.sel} value={form.goodsOrService} onChange={e => {
                                    set('goodsOrService', e.target.value);
                                    set('isServiceItem', e.target.value === 'Service');
                                }}>
                                    <option value="Goods">Goods</option>
                                    <option value="Service">Service</option>
                                </select>
                            </Field>
                            <Field label="Cess Rate %">
                                <input style={f.input} type="number" min="0" value={form.cessRate} onChange={e => num('cessRate', e.target.value)} />
                            </Field>
                        </div>
                        {/* Status controls */}
                        <div style={f.row(4)}>
                            <div>
                                <label style={f.label}>Active</label>
                                <Toggle value={form.isActive} onChange={v => set('isActive', v)} label={form.isActive ? 'Active' : 'Inactive'} />
                            </div>
                            <div style={{gridColumn: 'span 2'}}>
                                <label style={f.label}>Allow –ve Stock</label>
                                <Toggle value={form.allowNegativeStock} onChange={v => set('allowNegativeStock', v)} label={form.allowNegativeStock ? 'Allowed' : 'Not Allowed'} />
                            </div>
                        </div>
                        {/* Row 4: Description */}
                        <Field label="Description">
                            <textarea style={{ ...f.textarea, minHeight: 70 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Enter a general description for this item (e.g., specifications, usage notes, etc.)" />
                        </Field>

                    </div>
                )}

                {/* ── TAB 2: STOCK ── */}
                {activeTab === 'stock' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Stock Information</div>
                        <div style={f.row(5)}>
                            <Field label="Opening Stock"><input style={f.input} type="number" min="0" value={form.openingStock} onChange={e => num('openingStock', e.target.value)} /></Field>
                            <Field label="Current Stock"><input style={f.input} type="number" min="0" value={form.currentStock} onChange={e => num('currentStock', e.target.value)} title="Manually adjust to simulate stock purchase/movement" /></Field>
                            <Field label="Faulty Stock"><input style={f.input} type="number" min="0" value={form.faultyStock} onChange={e => num('faultyStock', e.target.value)} /></Field>
                            <Field label="Min Stock (Reorder)"><input style={f.input} type="number" min="0" value={form.minStockLevel} onChange={e => num('minStockLevel', e.target.value)} /></Field>
                            <Field label="Max Stock"><input style={f.input} type="number" min="0" value={form.maxStockLevel} onChange={e => num('maxStockLevel', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(4)}>
                            <Field label="Warehouse Location"><input style={f.input} value={form.warehouseLocation} onChange={e => set('warehouseLocation', e.target.value)} placeholder="Shelf A-3" /></Field>
                            <Field label="Valuation Rate (₹)">
                                <input style={f.input} type="number" min="0" step="0.01" value={form.valuationRate} onChange={e => num('valuationRate', e.target.value)} placeholder="0.00" />
                            </Field>
                        </div>
                        <div style={f.row(2)}>
                            <div>
                                <label style={f.label}>Batch Tracking</label>
                                <Toggle value={form.batchTracking} onChange={v => set('batchTracking', v)} label={form.batchTracking ? 'Enabled' : 'Disabled'} />
                                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Enable for items tracked by batch/lot</p>
                            </div>
                            <div>
                                <label style={f.label}>Serial Number Tracking</label>
                                <Toggle value={form.serialTracking} onChange={v => set('serialTracking', v)} label={form.serialTracking ? 'Enabled' : 'Disabled'} />
                                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Enable for items with unique serial numbers (e.g. LED Drivers)</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB 3: PURCHASE ── */}
                {activeTab === 'purchase' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Purchase Information</div>
                        <div style={f.row(3)}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <Field label="Default Supplier"><input style={f.input} value={form.defaultSupplier} onChange={e => set('defaultSupplier', e.target.value)} placeholder="Supplier name" /></Field>
                            </div>
                            <Field label="Lead Time (Days)"><input style={f.input} type="number" min="0" value={form.leadTimeDays} onChange={e => num('leadTimeDays', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(3)}>
                            <Field label="Purchase Rate (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.purchaseRate} onChange={e => num('purchaseRate', e.target.value)} /></Field>
                            <Field label="GST %">
                                <select style={f.sel} value={form.purchaseGst} onChange={e => set('purchaseGst', Number(e.target.value))}>
                                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                                </select>
                            </Field>
                            <div>
                                <label style={f.label}>Purchase Account</label>
                                <input style={f.input} value={form.purchaseAccount} onChange={e => set('purchaseAccount', e.target.value)} placeholder="Purchase A/c" />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB 4: SALES ── */}
                {activeTab === 'sales' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Sales Information (Finished Goods)</div>
                        <div style={f.row(4)}>
                            <Field label="Selling Price (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e => num('sellingPrice', e.target.value)} /></Field>
                            <Field label="MRP (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.mrp} onChange={e => num('mrp', e.target.value)} /></Field>
                            <Field label="Sales GST %">
                                <select style={f.sel} value={form.salesGst} onChange={e => set('salesGst', Number(e.target.value))}>
                                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                                </select>
                            </Field>
                            <Field label="Warranty (Months)"><input style={f.input} type="number" min="0" value={form.warrantyMonths} onChange={e => num('warrantyMonths', e.target.value)} /></Field>
                        </div>
                        <Field label="Product Description (Short marketing line)">
                            <textarea style={{ ...f.textarea, minHeight: 60 }} value={form.productDescription} onChange={e => set('productDescription', e.target.value)} placeholder="e.g. High efficiency dimmable LED driver with phase cut dimming" />
                        </Field>
                        <div style={f.row(3)}>
                            <Field label="Sales Account"><input style={f.input} value={form.salesAccount} onChange={e => set('salesAccount', e.target.value)} placeholder="Sales A/c" /></Field>
                            <Field label="Inventory Account"><input style={f.input} value={form.inventoryAccount} onChange={e => set('inventoryAccount', e.target.value)} placeholder="Inventory A/c" /></Field>
                            <Field label="COGS Account"><input style={f.input} value={form.cogsAccount} onChange={e => set('cogsAccount', e.target.value)} placeholder="COGS A/c" /></Field>
                        </div>
                    </div>
                )}

                {/* ── TAB 5: PRODUCTION ── */}
                {activeTab === 'production' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Production Information</div>
                        <div>
                            <label style={f.label}>Is Manufacturable?</label>
                            <Toggle value={form.isManufacturable} onChange={v => set('isManufacturable', v)} label={form.isManufacturable ? 'Yes — this item is produced in-house' : 'No — purchased / traded'} />
                        </div>
                        {form.isManufacturable && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                <div style={f.row(3)}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <Field label="Default BOM Link / Reference"><input style={f.input} value={form.bomLink} onChange={e => set('bomLink', e.target.value)} placeholder="BOM-001" /></Field>
                                    </div>
                                    <Field label="Production Time (Hours)"><input style={f.input} type="number" min="0" step="0.5" value={form.productionTimeHours} onChange={e => num('productionTimeHours', e.target.value)} /></Field>
                                </div>
                                <div style={f.row(3)}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <Field label="Machine Required"><input style={f.input} value={form.machineRequired} onChange={e => set('machineRequired', e.target.value)} placeholder="e.g. SMT Line, Wave Solder" /></Field>
                                    </div>
                                    <Field label="Std Production Cost (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.stdProductionCost} onChange={e => num('stdProductionCost', e.target.value)} /></Field>
                                </div>
                                <div>
                                    <label style={f.label}>QC Required</label>
                                    <Toggle value={form.qcRequired} onChange={v => set('qcRequired', v)} label={form.qcRequired ? 'QC Required before dispatch' : 'No QC required'} />
                                </div>
                            </div>
                        )}
                        {!form.isManufacturable && (
                            <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8, border: '1px dashed #86efac', color: '#166534', fontSize: 12 }}>
                                Toggle &quot;Is Manufacturable&quot; to enter production details (BOM, machine, QC, cost).
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB 6: TECHNICAL ── */}
                {activeTab === 'technical' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Technical Specs (Electrical) */}
                        <div style={f.sectionTitle}>
                            Technical Specifications
                            {!isElectrical && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>(Most relevant for Electrical / Finished Product items)</span>}
                        </div>
                        <div style={f.row(4)}>
                            <Field label="Wattage"><input style={f.input} value={form.technical.wattage} onChange={e => setTech('wattage', e.target.value)} placeholder="12W" /></Field>
                            <Field label="Input Voltage"><input style={f.input} value={form.technical.inputVoltage} onChange={e => setTech('inputVoltage', e.target.value)} placeholder="170-265V AC" /></Field>
                            <Field label="Output Voltage"><input style={f.input} value={form.technical.outputVoltage} onChange={e => setTech('outputVoltage', e.target.value)} placeholder="24-42V DC" /></Field>
                            <Field label="Output Current"><input style={f.input} value={form.technical.outputCurrent} onChange={e => setTech('outputCurrent', e.target.value)} placeholder="300mA" /></Field>
                        </div>
                        <div style={f.row(4)}>
                            <Field label="Dimming Type">
                                <select style={f.sel} value={form.technical.dimmingType} onChange={e => setTech('dimmingType', e.target.value)}>
                                    <option value="">None / N/A</option>
                                    <option value="PHASE_CUT">Phase Cut</option>
                                    <option value="DALI">DALI</option>
                                    <option value="0-10V">0-10V</option>
                                    <option value="ZIGBEE">Zigbee</option>
                                    <option value="BLE">BLE</option>
                                    <option value="TRIAC">TRIAC</option>
                                    <option value="PWM">PWM</option>
                                </select>
                            </Field>
                            <Field label="IP Rating"><input style={f.input} value={form.technical.ipRating} onChange={e => setTech('ipRating', e.target.value)} placeholder="IP20" /></Field>
                            <Field label="Surge Protection"><input style={f.input} value={form.technical.surgeProtection} onChange={e => setTech('surgeProtection', e.target.value)} placeholder="2KV" /></Field>
                            <Field label="Efficiency %"><input style={f.input} value={form.technical.efficiency} onChange={e => setTech('efficiency', e.target.value)} placeholder="88%" /></Field>
                        </div>

                        {/* Accounting (grouped here to keep tabs to 6) */}
                        <div style={{ ...f.sectionTitle, marginTop: 8 }}>Accounting Links</div>
                        <div style={f.row(4)}>
                            <Field label="Purchase Account"><input style={f.input} value={form.purchaseAccount} onChange={e => set('purchaseAccount', e.target.value)} placeholder="Purchase A/c" /></Field>
                            <Field label="Sales Account"><input style={f.input} value={form.salesAccount} onChange={e => set('salesAccount', e.target.value)} placeholder="Sales A/c" /></Field>
                            <Field label="Inventory Account"><input style={f.input} value={form.inventoryAccount} onChange={e => set('inventoryAccount', e.target.value)} placeholder="Inventory A/c" /></Field>
                            <Field label="COGS Account"><input style={f.input} value={form.cogsAccount} onChange={e => set('cogsAccount', e.target.value)} placeholder="COGS A/c" /></Field>
                        </div>
                    </div>
                )}
            </div>

            {/* Tab navigation footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {TABS.map((t, i) => {
                        const ci = TABS.findIndex(x => x.id === activeTab);
                        const isPrev = i < ci, isNext = i > ci;
                        if (isPrev && i === ci - 1) return <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ height: 28, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151' }}>← {t.label}</button>;
                        if (isNext && i === ci + 1) return <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ height: 28, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151' }}>{t.label} →</button>;
                        return null;
                    })}
                </div>
                <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 16px', border: 'none', borderRadius: 6, background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Save size={13} /> {saving ? 'Saving…' : (isEdit ? 'Update Item' : 'Save Item')}
                </button>
            </div>
        </div>
    );
};

export default ItemFormPage;
