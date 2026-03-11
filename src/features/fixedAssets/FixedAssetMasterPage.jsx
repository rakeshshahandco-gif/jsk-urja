import React, { useEffect, useState, useCallback } from 'react';
import { getFixedAssets, createFixedAsset, updateFixedAsset, getAssetCategories, getAssetLocations } from '@/services/fixedAssetApi';
import { getSuppliers } from '@/services/purchaseApi';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui';

const inp = { padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

const EMPTY = {
    assetName: '', assetShortName: '', category: '', assetDescription: '', brand: '', modelNo: '', serialNo: '',
    trackingType: 'Individual Asset Tracking', quantity: 1, supplier: '', purchaseInvoiceNo: '', purchaseInvoiceDate: '',
    purchaseDate: new Date().toISOString().split('T')[0], installationDate: '', putToUseDate: '',
    purchaseValue: 0, gstAmount: 0, freightCharges: 0, installationCharges: 0, otherCharges: 0, capitalizedCost: 0,
    depreciationApplicable: true, depreciationMethod: 'Straight Line Method', depreciationRate: 0, usefulLife: 0, residualValue: 0,
    location: '', department: '', assignedTo: '', status: 'In Use', condition: 'Good'
};

export default function FixedAssetMasterPage() {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [saving, setSaving] = useState(false);

    // Dropdown Data
    const [categories, setCategories] = useState([]);
    const [locations, setLocations] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [a, c, l, s] = await Promise.all([
                getFixedAssets(), getAssetCategories(), getAssetLocations(), getSuppliers()
            ]);
            setAssets(a.assets || []);
            setCategories(c || []);
            setLocations(l || []);
            setSuppliers(s.suppliers || []);
        } catch (e) { toast.error('Failed to load assets'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (modal.mode === 'create') await createFixedAsset(modal.data);
            else await updateFixedAsset(modal.data._id, modal.data);
            toast.success('Saved!'); setModal(null); loadData();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const set = (k, v) => setModal(m => {
        const newData = { ...m.data, [k]: v };

        // Auto-fill category defaults if category changes
        if (k === 'category') {
            const cat = categories.find(c => c._id === v);
            if (cat) {
                newData.depreciationMethod = cat.depreciationMethod;
                newData.depreciationRate = cat.depreciationRate;
                newData.usefulLife = cat.usefulLife;
                newData.depreciationApplicable = cat.depreciationApplicable;
            }
        }

        // Auto-calculate capitalized cost
        const sum = Number(newData.purchaseValue || 0) + Number(newData.gstAmount || 0) +
            Number(newData.freightCharges || 0) + Number(newData.installationCharges || 0) +
            Number(newData.otherCharges || 0);
        newData.capitalizedCost = sum;

        return { ...m, data: newData };
    });

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧾 Fixed Asset Register</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Maintain your complete asset inventory</p>
                </div>
                <button onClick={() => setModal({ mode: 'create', data: { ...EMPTY } })}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    + Register Asset
                </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {['Code', 'Asset Name', 'Category', 'Location', 'Cost', 'Book Value', 'Status', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : assets.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No assets found.</td></tr>
                        ) : assets.map(a => (
                            <tr key={a._id}>
                                <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{a.assetCode}</td>
                                <td style={{ ...td, fontWeight: 500 }}>{a.assetName}</td>
                                <td style={td}>{a.category?.name}</td>
                                <td style={td}>{a.location?.name || '—'}</td>
                                <td style={td}>₹{a.capitalizedCost?.toLocaleString()}</td>
                                <td style={td}>₹{a.currentBookValue?.toLocaleString()}</td>
                                <td style={td}>
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, background: '#f1f5f9', fontWeight: 600 }}>{a.status}</span>
                                </td>
                                <td style={td}>
                                    <button onClick={() => setModal({ mode: 'edit', data: { ...a } })}
                                        style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Details</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', padding: 32, boxShadow: '0 30px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{modal.mode === 'create' ? 'Register New Asset' : 'Asset Details'}</h2>
                            <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                            {/* Section 1: Basic Info */}
                            <div>
                                <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: 6, marginBottom: 16 }}>Basic Identity</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>ASSET NAME *</label>
                                            <input value={modal.data.assetName} onChange={e => set('assetName', e.target.value)} style={inp} placeholder="e.g., MacBook Pro, Diesel Generator" />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>CATEGORY *</label>
                                            <select value={modal.data.category?._id || modal.data.category} onChange={e => set('category', e.target.value)} style={inp}>
                                                <option value="">— Select Category —</option>
                                                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>BRAND</label>
                                            <input value={modal.data.brand} onChange={e => set('brand', e.target.value)} style={inp} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>MODEL / SERIAL NO</label>
                                            <input value={modal.data.modelNo} onChange={e => set('modelNo', e.target.value)} style={inp} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>TRACKING TYPE</label>
                                        <select value={modal.data.trackingType} onChange={e => set('trackingType', e.target.value)} style={inp}>
                                            <option>Individual Asset Tracking</option>
                                            <option>Quantity Based Tracking</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Financial Details */}
                            <div>
                                <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: 6, marginBottom: 16 }}>Financial & Purchase</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>PURCHASE VALUE (BASE)</label>
                                        <input type="number" value={modal.data.purchaseValue} onChange={e => set('purchaseValue', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>GST AMOUNT</label>
                                        <input type="number" value={modal.data.gstAmount} onChange={e => set('gstAmount', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>FREIGHT / INSTALLATION</label>
                                        <input type="number" value={Number(modal.data.freightCharges || 0) + Number(modal.data.installationCharges || 0)}
                                            onChange={e => set('installationCharges', e.target.value)} style={inp} />
                                    </div>
                                    <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 7, border: '1px dashed #cbd5e1' }}>
                                        <label style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: 4 }}>TOTAL CAPITALIZED COST</label>
                                        <div style={{ fontSize: 16, fontWeight: 900, color: '#0d9488' }}>₹{modal.data.capitalizedCost?.toLocaleString()}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>PURCHASE DATE</label>
                                        <input type="date" value={modal.data.purchaseDate?.split('T')[0]} onChange={e => set('purchaseDate', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>SUPPLIER</label>
                                        <select value={modal.data.supplier?._id || modal.data.supplier} onChange={e => set('supplier', e.target.value)} style={inp}>
                                            <option value="">— Select Supplier —</option>
                                            {suppliers.map(s => <option key={s._id} value={s._id}>{s.supplierName}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Depreciation */}
                            <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#334155' }}>Depreciation & Lifecycle</h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input type="checkbox" checked={modal.data.depreciationApplicable} onChange={e => set('depreciationApplicable', e.target.checked)} />
                                        <label style={{ fontSize: 12, fontWeight: 600 }}>Applicable</label>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>METHOD</label>
                                        <input value={modal.data.depreciationMethod} disabled={!modal.data.depreciationApplicable} style={{ ...inp, background: '#f1f5f9' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>RATE (%)</label>
                                        <input type="number" value={modal.data.depreciationRate} onChange={e => set('depreciationRate', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>USEFUL LIFE (YRS)</label>
                                        <input type="number" value={modal.data.usefulLife} onChange={e => set('usefulLife', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>RESIDUAL VALUE</label>
                                        <input type="number" value={modal.data.residualValue} onChange={e => set('residualValue', e.target.value)} style={inp} />
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Location & Status */}
                            <div style={{ gridColumn: 'span 2' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>LOCATION / SITE</label>
                                        <select value={modal.data.location?._id || modal.data.location} onChange={e => set('location', e.target.value)} style={inp}>
                                            <option value="">— Select Location —</option>
                                            {locations.map(l => <option key={l._id} value={l._id}>{l.name} - {l.branch}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>DEPARTMENT / FLOOR</label>
                                        <input value={modal.data.department} onChange={e => set('department', e.target.value)} style={inp} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>CURRENT STATUS</label>
                                        <select value={modal.data.status} onChange={e => set('status', e.target.value)} style={inp}>
                                            {['In Use', 'In Store', 'Under Repair', 'Idle', 'Disposed'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 40, borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
                            <button onClick={() => setModal(null)} style={{ padding: '10px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800, boxShadow: '0 4px 12px rgba(13,148,136,0.3)' }}>
                                {saving ? 'Registering...' : modal.mode === 'create' ? 'Register Asset' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
