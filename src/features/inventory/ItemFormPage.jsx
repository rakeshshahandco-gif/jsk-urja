import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, RefreshCw, Package } from 'lucide-react';
import { getItem, createItem, updateItem, generateItemCode } from '@/services/itemApi';
import { getItemTypes } from '@/services/itemTypeApi';
import { getItemGroups } from '@/services/itemGroupApi';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { useCompany } from '@/contexts/CompanyContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { useFeatureConfiguration } from '@/hooks/useFeatureConfiguration';
import { useItemTemplateFieldSettings } from '@/hooks/useItemTemplateFieldSettings';
import { useIndustryInventoryLabels } from '@/hooks/useIndustryInventoryLabels';
import { FIELD_BY_KEY, ITEM_MASTER_TEMPLATE_FIELDS } from '@/constants/itemMasterTemplateFields';
import { ItemTextileImagesTab } from './ItemTextileImagesTab';

function getFormValue(form, formField) {
    if (!formField) return undefined;
    if (formField.includes('.')) {
        const [a, b] = formField.split('.');
        return form?.[a]?.[b];
    }
    return form?.[formField];
}

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
const TAB_DEFS = [
    { id: 'basic', shortLabel: 'Basic Info' },
    { id: 'textile', shortLabel: 'Textile Details' },
    { id: 'stock', shortLabel: 'Stock' },
    { id: 'purchase', shortLabel: 'Purchase' },
    { id: 'sales', shortLabel: 'Sales' },
    { id: 'production', shortLabel: 'Production' },
    { id: 'technical', shortLabel: 'Technical' },
];

const TEXTILE_DEFAULT = {
    fabricType: '', quality: '', gsm: '', width: '', colour: '',
    designNo: '', pattern: '', season: '', brand: '', shade: '',
    lotNo: '', rollNo: '', than: '', meter: '', barcodeRequired: false,
};

// ── DEFAULT FORM STATE ───────────────────────────────────────────────────────
const DEFAULT = {
    itemCode: '', itemName: '', itemGroupName: '', itemCategory: 'RAW_MATERIAL', itemType: 'OTHER', uom: 'NOS', points: '', description: '',
    openingStock: 0, currentStock: 0, faultyStock: 0, minStockLevel: 0, maxStockLevel: 0, valuationRate: 0, warehouseLocation: '', batchTracking: false, serialTracking: false,
    defaultSupplier: '', purchaseRate: 0, purchaseGst: 18, hsnCode: '', leadTimeDays: 0,
    uqc: '', goodsOrService: 'Goods', cessRate: 0,
    sellingPrice: 0, mrp: 0, warrantyMonths: 0, salesGst: 18, productDescription: '',
    isManufacturable: false, bomLink: '', productionTimeHours: 0, machineRequired: '', qcRequired: false, stdProductionCost: 0,
    useManualBOMCost: false, manualBOMCostPerUnit: 0,
    technical: { wattage: '', inputVoltage: '', outputVoltage: '', outputCurrent: '', dimmingType: '', ipRating: '', surgeProtection: '', efficiency: '' },
    textile: { ...TEXTILE_DEFAULT },
    purchaseAccount: '', salesAccount: '', inventoryAccount: '', cogsAccount: '',
    isActive: true, isServiceItem: false, allowNegativeStock: false,
    remarks: '',
};

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
const ItemFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { selectedCompany } = useCompany();
    const { selectedFYObject } = useFinancialYear();
    const { isEnabled } = useFeatureConfiguration();
    const { fieldCtrl } = useItemTemplateFieldSettings(selectedCompany?._id, isEnabled);
    const invLabels = useIndustryInventoryLabels();
    const show = (key) => fieldCtrl.isVisible(key);
    const fieldLabel = (key, fallback) => (fieldCtrl.isRequired(key) ? `${fallback} *` : fallback);
    const inputProps = (key) => ({
        readOnly: fieldCtrl.isReadOnly(key),
        disabled: fieldCtrl.isReadOnly(key),
    });
    const isTextileTemplate =
        fieldCtrl.templateCode === 'TEXTILE'
        || /textile|handloom/i.test(fieldCtrl.templateName || '');
    const showTextileImagesTab =
        fieldCtrl.isVisible('textileItemImages') && isEnabled('inventory.textileItemImagesRequired');
    const itemNamePlaceholder = invLabels.itemNamePlaceholder;
    const hsnPlaceholder = invLabels.hsnPlaceholder;
    const visibleTabs = useMemo(() => {
        const tabs = TAB_DEFS.filter((t) => fieldCtrl.tabVisible(t.id)).map((t, i) => ({
            ...t,
            label: `${i + 1}. ${t.shortLabel}`,
        }));
        if (showTextileImagesTab) {
            tabs.push({ id: 'textileImages', shortLabel: 'Textile Images', label: `${tabs.length + 1}. Textile Images` });
        }
        return tabs;
    }, [fieldCtrl, showTextileImagesTab]);
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
    const isElectrical = !invLabels.isTextile
        && (selectedTypeData?.isElectrical || form.itemType === 'ELECTRICAL' || form.itemType === 'FINISHED_PRODUCT');

    useEffect(() => {
        setActiveTab('basic');
    }, [selectedCompany?._id]);

    useEffect(() => {
        if (!isEdit) return;
        getItem(id)
            .then(data => {
                setForm({
                    ...DEFAULT,
                    ...data,
                    technical: { ...DEFAULT.technical, ...(data.technical || {}) },
                    textile: { ...DEFAULT.textile, ...(data.textile || {}) },
                });
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

    useEffect(() => {
        if (isEdit || !invLabels.isTextile) return;
        setForm((prev) => (prev.uom === 'NOS' ? { ...prev, uom: 'METER' } : prev));
    }, [invLabels.isTextile, isEdit]);

    useEffect(() => {
        if (isEdit || fieldCtrl.useLegacy) return;
        setForm((prev) => {
            const next = { ...prev, technical: { ...prev.technical }, textile: { ...prev.textile } };
            for (const def of ITEM_MASTER_TEMPLATE_FIELDS) {
                const dv = fieldCtrl.getDefaultValue(def.key);
                if (dv === undefined || dv === null || dv === '') continue;
                if (def.formField?.includes('.')) {
                    const [a, b] = def.formField.split('.');
                    if (b === 'barcodeRequired') {
                        next[a] = { ...next[a], [b]: dv === true || dv === 'true' || dv === '1' };
                    } else if (next[a]?.[b] === undefined || next[a]?.[b] === '' || next[a]?.[b] === 0) {
                        next[a] = { ...next[a], [b]: dv };
                    }
                } else if (def.formField === 'isActive') {
                    next.isActive = dv === true || dv === 'true' || dv === '1';
                } else if (def.formField === 'isManufacturable') {
                    next.isManufacturable = dv === true || dv === 'true' || dv === '1';
                } else if (next[def.formField] === undefined || next[def.formField] === '' || next[def.formField] === 0) {
                    const numFields = ['purchaseGst', 'salesGst', 'purchaseRate', 'sellingPrice', 'openingStock', 'minStockLevel', 'maxStockLevel', 'warrantyMonths'];
                    next[def.formField] = numFields.includes(def.formField) ? Number(dv) || 0 : dv;
                }
            }
            return next;
        });
    }, [fieldCtrl, isEdit]);

    useEffect(() => {
        if (activeTab === 'textileImages' && !showTextileImagesTab) {
            setActiveTab(visibleTabs[0]?.id || 'basic');
            return;
        }
        if (fieldCtrl.tabVisible(activeTab) || activeTab === 'textileImages') return;
        const first = visibleTabs[0];
        if (first) setActiveTab(first.id);
    }, [fieldCtrl, activeTab, visibleTabs, showTextileImagesTab]);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const setTech = (key, val) => setForm(f => ({ ...f, technical: { ...f.technical, [key]: val } }));
    const setTextile = (key, val) => setForm(f => ({ ...f, textile: { ...f.textile, [key]: val } }));
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
        const missing = [];
        for (const def of ITEM_MASTER_TEMPLATE_FIELDS) {
            if (!fieldCtrl.isRequired(def.key)) continue;
            if (!def.formField || def.key === 'textileItemImages') continue;
            const val = getFormValue(form, def.formField);
            if (def.formField === 'isActive' || def.formField === 'isManufacturable' || def.formField === 'textile.barcodeRequired') continue;
            if (val === undefined || val === null || String(val).trim() === '') {
                missing.push(FIELD_BY_KEY[def.key]?.label || def.label);
            }
        }
        if (!fieldCtrl.useLegacy) {
            if (missing.length) {
                addToast(`Required: ${missing.join(', ')}`, 'error');
                setActiveTab('basic');
                return;
            }
        } else {
            if (!form.itemName.trim()) { addToast('Item Name is required', 'error'); setActiveTab('basic'); return; }
            if (!form.itemCode.trim()) { addToast('Item Code is required — click Auto-Generate', 'error'); setActiveTab('basic'); return; }
        }
        setSaving(true);
        try {
            if (isEdit) {
                const { currentStock, faultyStock, ...payload } = form;
                await updateItem(id, payload);
            } else {
                const payload = {
                    ...form,
                    financialYearId: selectedFYObject?._id || undefined,
                    financialYear: selectedFYObject?.name || undefined,
                };
                await createItem(payload);
            }
            addToast(isEdit ? 'Item updated!' : 'Item created!', 'success');
            navigate('/inventory/items', { state: { createdItemCode: form.itemCode.trim().toUpperCase() } });
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
                {visibleTabs.map(tab => (
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
                            {show('itemCode') && (
                            <div>
                                <label style={f.label}>{fieldLabel('itemCode', 'Item Code')}</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input style={{ ...f.input, flex: 1, fontFamily: 'monospace', fontWeight: 700 }} value={form.itemCode} onChange={e => set('itemCode', e.target.value.toUpperCase())} placeholder="I0001" {...inputProps('itemCode')} />
                                    <button type="button" onClick={handleGenerateCode} disabled={generatingCode} title="Auto-generate code"
                                        style={{ height: 30, width: 30, border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                                        <RefreshCw size={12} style={{ animation: generatingCode ? 'spin 1s linear infinite' : 'none' }} />
                                    </button>
                                </div>
                            </div>
                            )}
                            {show('itemName') && (
                            <div style={{ gridColumn: show('itemCode') ? 'span 2' : 'span 3' }}>
                                <Field label={fieldLabel('itemName', 'Item Name')}>
                                    <input style={f.input} value={form.itemName} onChange={e => set('itemName', e.target.value)} placeholder={itemNamePlaceholder} {...inputProps('itemName')} />
                                </Field>
                                {isEdit && originalItemName && form.itemName && originalItemName !== form.itemName && (
                                    <div style={{ fontSize: '10px', color: '#e11d48', marginTop: '4px', background: '#fff1f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>⚠️</span>
                                        <span>Changing this name will update it globally in all past & future records.</span>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                        {/* Description */}
                        {show('description') && (
                        <div>
                            <Field label={fieldLabel('description', 'Description')}>
                                <textarea style={{ ...f.textarea, minHeight: 40 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the item..." {...inputProps('description')} />
                            </Field>
                        </div>
                        )}
                        {/* Row 2: Category + Type + Group + UOM + Points */}
                        <div style={f.row(3)}>
                            {show('category') && (
                            <Field label={fieldLabel('category', 'Item Category')}>
                                <select style={f.sel} value={form.itemCategory} onChange={e => set('itemCategory', e.target.value)} disabled={fieldCtrl.isReadOnly('category')}>
                                    <option value="RAW_MATERIAL">Raw Material</option>
                                    <option value="WIP">WIP / Semi-Finished</option>
                                    <option value="FINISHED_GOOD">Finished Goods</option>
                                    <option value="TRADING">Trading Item</option>
                                    <option value="CONSUMABLE">Consumable</option>
                                </select>
                                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Examples: {invLabels.itemCategoryHelperText}</p>
                            </Field>
                            )}
                            <Field label="Item Type">
                                <select style={f.sel} value={form.itemType} onChange={e => set('itemType', e.target.value)}>
                                    <option value="OTHER">Other</option>
                                    {itemTypes.map(t => (
                                        <option key={t._id} value={t.code}>{t.name}</option>
                                    ))}
                                </select>
                            </Field>
                            {show('itemGroup') && (
                            <Field label={fieldLabel('itemGroup', 'Item Group Name')}>
                                <select style={f.sel} value={form.itemGroupName} onChange={e => set('itemGroupName', e.target.value)} disabled={fieldCtrl.isReadOnly('itemGroup')}>
                                    <option value="">-- No Group --</option>
                                    {itemGroups.map(g => (
                                        <option key={g._id} value={g.name}>{g.name}</option>
                                    ))}
                                </select>
                            </Field>
                            )}
                            {show('uom') && (
                            <Field label={fieldLabel('uom', 'UOM')}>
                                <select style={f.sel} value={form.uom} onChange={e => set('uom', e.target.value)} disabled={fieldCtrl.isReadOnly('uom')}>
                                    <option value="NOS">Nos</option>
                                    <option value="PCS">Pcs</option>
                                    <option value="METER">Meter</option>
                                    <option value="KG">Kg</option>
                                    <option value="BOX">Box</option>
                                    <option value="SET">Set</option>
                                    <option value="ROLL">Roll</option>
                                    <option value="LITRE">Litre</option>
                                </select>
                                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Examples: {invLabels.uomExamples}</p>
                            </Field>
                            )}
                            {show('pointsLeads') && (
                            <Field label={fieldLabel('pointsLeads', 'Points (Leads)')}>
                                <select style={f.sel} value={form.points} onChange={e => set('points', e.target.value)} disabled={fieldCtrl.isReadOnly('pointsLeads')}>
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
                            )}
                        </div>
                        {/* Row 3: HSN/GST Info */}
                        <div style={f.row(4)}>
                            {show('hsnSac') && (
                            <Field label={fieldLabel('hsnSac', 'HSN Code (Legacy)')}>
                                <input style={f.input} value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} placeholder={hsnPlaceholder} {...inputProps('hsnSac')} />
                            </Field>
                            )}
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
                            {show('activeInactive') && (
                            <div>
                                <label style={f.label}>{fieldLabel('activeInactive', 'Active')}</label>
                                <Toggle value={form.isActive} onChange={v => !fieldCtrl.isReadOnly('activeInactive') && set('isActive', v)} label={form.isActive ? 'Active' : 'Inactive'} />
                            </div>
                            )}
                            <div style={{gridColumn: 'span 2'}}>
                                <label style={f.label}>Allow –ve Stock</label>
                                <Toggle value={form.allowNegativeStock} onChange={v => set('allowNegativeStock', v)} label={form.allowNegativeStock ? 'Allowed' : 'Not Allowed'} />
                            </div>
                        </div>
                        {show('description') && (
                        <Field label={fieldLabel('description', 'Description')}>
                            <textarea style={{ ...f.textarea, minHeight: 70 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Enter a general description for this item (e.g., specifications, usage notes, etc.)" {...inputProps('description')} />
                        </Field>
                        )}

                    </div>
                )}

                {/* ── TAB: TEXTILE ── */}
                {activeTab === 'textile' && fieldCtrl.tabVisible('textile') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Textile Specifications</div>
                        <div style={f.row(4)}>
                            {show('fabricType') && <Field label={fieldLabel('fabricType', 'Fabric Type')}><input style={f.input} value={form.textile.fabricType} onChange={e => setTextile('fabricType', e.target.value)} placeholder="Cotton, Silk, Polyester…" {...inputProps('fabricType')} /></Field>}
                            {show('quality') && <Field label={fieldLabel('quality', 'Quality')}><input style={f.input} value={form.textile.quality} onChange={e => setTextile('quality', e.target.value)} placeholder="Premium, Standard…" {...inputProps('quality')} /></Field>}
                            {show('gsm') && <Field label={fieldLabel('gsm', 'GSM')}><input style={f.input} value={form.textile.gsm} onChange={e => setTextile('gsm', e.target.value)} placeholder="120" {...inputProps('gsm')} /></Field>}
                            {show('width') && <Field label={fieldLabel('width', 'Width')}><input style={f.input} value={form.textile.width} onChange={e => setTextile('width', e.target.value)} placeholder="44 inch" {...inputProps('width')} /></Field>}
                        </div>
                        <div style={f.row(4)}>
                            {show('colour') && <Field label={fieldLabel('colour', 'Colour')}><input style={f.input} value={form.textile.colour} onChange={e => setTextile('colour', e.target.value)} placeholder="Navy Blue" {...inputProps('colour')} /></Field>}
                            {show('designNo') && <Field label={fieldLabel('designNo', 'Design No')}><input style={f.input} value={form.textile.designNo} onChange={e => setTextile('designNo', e.target.value)} placeholder="DSN-001" {...inputProps('designNo')} /></Field>}
                            {show('pattern') && <Field label={fieldLabel('pattern', 'Pattern')}><input style={f.input} value={form.textile.pattern} onChange={e => setTextile('pattern', e.target.value)} placeholder="Floral, Striped…" {...inputProps('pattern')} /></Field>}
                            {show('season') && <Field label={fieldLabel('season', 'Season')}><input style={f.input} value={form.textile.season} onChange={e => setTextile('season', e.target.value)} placeholder="Summer, Winter…" {...inputProps('season')} /></Field>}
                        </div>
                        <div style={f.row(4)}>
                            {show('brand') && <Field label={fieldLabel('brand', 'Brand')}><input style={f.input} value={form.textile.brand} onChange={e => setTextile('brand', e.target.value)} placeholder="Brand name" {...inputProps('brand')} /></Field>}
                            {show('shade') && <Field label={fieldLabel('shade', 'Shade')}><input style={f.input} value={form.textile.shade} onChange={e => setTextile('shade', e.target.value)} placeholder="Light, Dark…" {...inputProps('shade')} /></Field>}
                            {show('lotNo') && <Field label={fieldLabel('lotNo', 'Lot No')}><input style={f.input} value={form.textile.lotNo} onChange={e => setTextile('lotNo', e.target.value)} placeholder="LOT-001" {...inputProps('lotNo')} /></Field>}
                            {show('rollNo') && <Field label={fieldLabel('rollNo', 'Roll No')}><input style={f.input} value={form.textile.rollNo} onChange={e => setTextile('rollNo', e.target.value)} placeholder="ROLL-001" {...inputProps('rollNo')} /></Field>}
                        </div>
                        <div style={f.row(4)}>
                            {show('than') && <Field label={fieldLabel('than', 'Than')}><input style={f.input} value={form.textile.than} onChange={e => setTextile('than', e.target.value)} placeholder="Than no." {...inputProps('than')} /></Field>}
                            {show('meter') && <Field label={fieldLabel('meter', 'Meter')}><input style={f.input} value={form.textile.meter} onChange={e => setTextile('meter', e.target.value)} placeholder="100" {...inputProps('meter')} /></Field>}
                            {show('barcodeRequired') && (
                            <div>
                                <label style={f.label}>{fieldLabel('barcodeRequired', 'Barcode Required')}</label>
                                <Toggle value={form.textile.barcodeRequired} onChange={v => !fieldCtrl.isReadOnly('barcodeRequired') && setTextile('barcodeRequired', v)} label={form.textile.barcodeRequired ? 'Yes' : 'No'} />
                            </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB 2: STOCK ── */}
                {activeTab === 'stock' && fieldCtrl.tabVisible('stock') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Stock Information</div>
                        <div style={f.row(5)}>
                            {show('openingStock') && <Field label={fieldLabel('openingStock', 'Opening Stock')}><input style={f.input} type="number" min="0" value={form.openingStock} onChange={e => num('openingStock', e.target.value)} {...inputProps('openingStock')} /></Field>}
                            <Field label="Current Stock"><input style={{ ...f.input, background: isEdit ? '#f8fafc' : f.input.background, color: isEdit ? '#64748b' : f.input.color }} type="number" min="0" value={form.currentStock} onChange={e => num('currentStock', e.target.value)} readOnly={isEdit} title={isEdit ? 'Updated by Purchase, GRN, Sales and Production transactions only' : 'Manually adjust to simulate stock purchase/movement'} /></Field>
                            <Field label="Faulty Stock"><input style={f.input} type="number" min="0" value={form.faultyStock} onChange={e => num('faultyStock', e.target.value)} /></Field>
                            {show('minStock') && <Field label={fieldLabel('minStock', 'Min Stock (Reorder)')}><input style={f.input} type="number" min="0" value={form.minStockLevel} onChange={e => num('minStockLevel', e.target.value)} {...inputProps('minStock')} /></Field>}
                            {show('maxStock') && <Field label={fieldLabel('maxStock', 'Max Stock')}><input style={f.input} type="number" min="0" value={form.maxStockLevel} onChange={e => num('maxStockLevel', e.target.value)} {...inputProps('maxStock')} /></Field>}
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
                                <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{invLabels.serialTrackingHint}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB 3: PURCHASE ── */}
                {activeTab === 'purchase' && fieldCtrl.tabVisible('purchase') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Purchase Information</div>
                        <div style={f.row(3)}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <Field label="Default Supplier"><input style={f.input} value={form.defaultSupplier} onChange={e => set('defaultSupplier', e.target.value)} placeholder="Supplier name" /></Field>
                            </div>
                            <Field label="Lead Time (Days)"><input style={f.input} type="number" min="0" value={form.leadTimeDays} onChange={e => num('leadTimeDays', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(3)}>
                            {show('purchaseRate') && <Field label={fieldLabel('purchaseRate', 'Purchase Rate (₹)')}><input style={f.input} type="number" min="0" step="0.01" value={form.purchaseRate} onChange={e => num('purchaseRate', e.target.value)} {...inputProps('purchaseRate')} /></Field>}
                            {show('gstRate') && (
                            <Field label={fieldLabel('gstRate', 'GST %')}>
                                <select style={f.sel} value={form.purchaseGst} onChange={e => set('purchaseGst', Number(e.target.value))} disabled={fieldCtrl.isReadOnly('gstRate')}>
                                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                                </select>
                            </Field>
                            )}
                            <div>
                                <label style={f.label}>Purchase Account</label>
                                <input style={f.input} value={form.purchaseAccount} onChange={e => set('purchaseAccount', e.target.value)} placeholder="Purchase A/c" />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB 4: SALES ── */}
                {activeTab === 'sales' && fieldCtrl.tabVisible('sales') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>{invLabels.salesSectionTitle}</div>
                        <div style={f.row(4)}>
                            {show('salesRate') && <Field label={fieldLabel('salesRate', 'Selling Price (₹)')}><input style={f.input} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e => num('sellingPrice', e.target.value)} {...inputProps('salesRate')} /></Field>}
                            <Field label="MRP (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.mrp} onChange={e => num('mrp', e.target.value)} /></Field>
                            <Field label="Sales GST %">
                                <select style={f.sel} value={form.salesGst} onChange={e => set('salesGst', Number(e.target.value))}>
                                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                                </select>
                            </Field>
                            {show('warranty') && <Field label={fieldLabel('warranty', 'Warranty (Months)')}><input style={f.input} type="number" min="0" value={form.warrantyMonths} onChange={e => num('warrantyMonths', e.target.value)} {...inputProps('warranty')} /></Field>}
                        </div>
                        <Field label="Product Description (Short marketing line)">
                            <textarea style={{ ...f.textarea, minHeight: 60 }} value={form.productDescription} onChange={e => set('productDescription', e.target.value)} placeholder={invLabels.productDescriptionPlaceholder} />
                        </Field>
                        <div style={f.row(3)}>
                            <Field label="Sales Account"><input style={f.input} value={form.salesAccount} onChange={e => set('salesAccount', e.target.value)} placeholder="Sales A/c" /></Field>
                            <Field label="Inventory Account"><input style={f.input} value={form.inventoryAccount} onChange={e => set('inventoryAccount', e.target.value)} placeholder="Inventory A/c" /></Field>
                            <Field label="COGS Account"><input style={f.input} value={form.cogsAccount} onChange={e => set('cogsAccount', e.target.value)} placeholder="COGS A/c" /></Field>
                        </div>
                    </div>
                )}

                {/* ── TAB 5: PRODUCTION ── */}
                {activeTab === 'production' && fieldCtrl.tabVisible('production') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={f.sectionTitle}>Production Information</div>
                        <div>
                            <label style={f.label}>{fieldLabel('bomApplicable', 'Is Manufacturable?')}</label>
                            <Toggle value={form.isManufacturable} onChange={v => !fieldCtrl.isReadOnly('bomApplicable') && set('isManufacturable', v)} label={form.isManufacturable ? 'Yes — this item is produced in-house' : 'No — purchased / traded'} />
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
                                        <Field label="Machine Required"><input style={f.input} value={form.machineRequired} onChange={e => set('machineRequired', e.target.value)} placeholder={invLabels.machineRequiredPlaceholder} /></Field>
                                    </div>
                                    <Field label="Std Production Cost (₹)"><input style={f.input} type="number" min="0" step="0.01" value={form.stdProductionCost} onChange={e => num('stdProductionCost', e.target.value)} /></Field>
                                </div>
                                <div>
                                    <label style={f.label}>QC Required</label>
                                    <Toggle value={form.qcRequired} onChange={v => set('qcRequired', v)} label={form.qcRequired ? 'QC Required before dispatch' : 'No QC required'} />
                                </div>
                                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 12 }}>
                                    <div style={f.row(2)}>
                                        <div>
                                            <label style={f.label}>Use Manual BOM Cost?</label>
                                            <Toggle value={form.useManualBOMCost} onChange={v => set('useManualBOMCost', v)} label={form.useManualBOMCost ? 'Using Manual Cost' : 'Using BOM Cost'} />
                                        </div>
                                        {form.useManualBOMCost && (
                                            <Field label="Manual BOM Cost Per Unit (₹)">
                                                <input style={f.input} type="number" min="0" step="0.01" value={form.manualBOMCostPerUnit} onChange={e => num('manualBOMCostPerUnit', e.target.value)} placeholder="0.00" />
                                            </Field>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 10, color: '#ef4444', marginTop: 4, fontWeight: 600 }}>
                                        {form.useManualBOMCost ? '⚠️ Manual cost will override BOM cost in GP reports.' : 'ℹ️ System will pull cost from active BOM.'}
                                    </p>
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
                {activeTab === 'technical' && fieldCtrl.tabVisible('technical') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Technical Specs (Electrical) */}
                        <div style={f.sectionTitle}>
                            Technical Specifications
                            {!isElectrical && <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>(Most relevant for Electrical / Finished Product items)</span>}
                        </div>
                        <div style={f.row(4)}>
                            {show('wattage') && <Field label={fieldLabel('wattage', 'Wattage')}><input style={f.input} value={form.technical.wattage} onChange={e => setTech('wattage', e.target.value)} placeholder="12W" {...inputProps('wattage')} /></Field>}
                            {show('voltage') && <Field label={fieldLabel('voltage', 'Input Voltage')}><input style={f.input} value={form.technical.inputVoltage} onChange={e => setTech('inputVoltage', e.target.value)} placeholder="170-265V AC" {...inputProps('voltage')} /></Field>}
                            {show('outputVoltage') && <Field label={fieldLabel('outputVoltage', 'Output Voltage')}><input style={f.input} value={form.technical.outputVoltage} onChange={e => setTech('outputVoltage', e.target.value)} placeholder="24-42V DC" {...inputProps('outputVoltage')} /></Field>}
                            {show('outputCurrent') && <Field label={fieldLabel('outputCurrent', 'Output Current')}><input style={f.input} value={form.technical.outputCurrent} onChange={e => setTech('outputCurrent', e.target.value)} placeholder="300mA" {...inputProps('outputCurrent')} /></Field>}
                        </div>
                        <div style={f.row(4)}>
                            {show('dimmingType') && (
                            <Field label={fieldLabel('dimmingType', 'Dimming Type')}>
                                <select style={f.sel} value={form.technical.dimmingType} onChange={e => setTech('dimmingType', e.target.value)} disabled={fieldCtrl.isReadOnly('dimmingType')}>
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
                            )}
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

                {activeTab === 'textileImages' && showTextileImagesTab && (
                    <ItemTextileImagesTab itemId={id} companyId={selectedCompany?._id} />
                )}
            </div>

            {/* Tab navigation footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {visibleTabs.map((t, i) => {
                        const ci = visibleTabs.findIndex(x => x.id === activeTab);
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
