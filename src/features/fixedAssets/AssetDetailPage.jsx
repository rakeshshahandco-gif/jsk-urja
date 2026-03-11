import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFixedAssetById, createAssetTransfer, createAssetMaintenance, createAssetDisposal, getAssetLocations } from '@/services/fixedAssetApi';
import toast from 'react-hot-toast';

const tabS = { padding: '10px 20px', borderBottom: '2px solid transparent', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' };
const activeTabS = { ...tabS, borderBottomColor: '#0d9488', color: '#0d9488' };
const inp = { padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };

export default function AssetDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [asset, setAsset] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');
    const [locations, setLocations] = useState([]);

    // Modal states for actions
    const [action, setAction] = useState(null); // 'transfer', 'maintenance', 'disposal'
    const [form, setForm] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [a, l] = await Promise.all([getFixedAssetById(id), getAssetLocations()]);
            setAsset(a);
            setLocations(l || []);
        } catch (e) { toast.error('Asset not found'); navigate('/accounts/fixed-assets'); }
        finally { setLoading(false); }
    }, [id, navigate]);

    useEffect(() => { load(); }, [load]);

    const handleAction = async () => {
        try {
            if (action === 'transfer') await createAssetTransfer({ asset: id, ...form });
            else if (action === 'maintenance') await createAssetMaintenance({ asset: id, ...form });
            else if (action === 'disposal') await createAssetDisposal({ asset: id, ...form });
            toast.success('Record saved!'); setAction(null); load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading asset details...</div>;
    if (!asset) return null;

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <button onClick={() => navigate('/accounts/fixed-assets')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← Back to Register</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{asset.assetName}</h1>
                        <span style={{ padding: '4px 12px', background: asset.status === 'In Use' ? '#dcfce7' : '#f1f5f9', color: asset.status === 'In Use' ? '#166534' : '#475569', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{asset.status}</span>
                    </div>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>{asset.assetCode} • {asset.category?.name}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {asset.status !== 'Disposed' && (
                        <>
                            <button onClick={() => setAction('transfer')} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Transfer</button>
                            <button onClick={() => setAction('maintenance')} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Maintenance</button>
                            <button onClick={() => setAction('disposal')} style={{ padding: '8px 16px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Dispose Asset</button>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
                <div onClick={() => setTab('overview')} style={tab === 'overview' ? activeTabS : tabS}>Overview</div>
                <div onClick={() => setTab('history')} style={tab === 'history' ? activeTabS : tabS}>Life Cycle History</div>
            </div>

            {tab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Financial Card */}
                        <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e5e7eb' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Financial Position</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>PURCHASE COST</label>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>₹{asset.capitalizedCost?.toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>TOTAL DEPRECIATION</label>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>₹{asset.accumulatedDepreciation?.toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>BOOK VALUE</label>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0d9488' }}>₹{asset.currentBookValue?.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>

                        {/* Details Card */}
                        <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e5e7eb' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Asset Details</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                {['brand', 'modelNo', 'serialNo', 'putToUseDate', 'warrantyExpiryDate'].map(k => (
                                    <div key={k}>
                                        <label style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>{k.replace(/([A-Z])/g, ' $1')}</label>
                                        <div style={{ fontSize: 14 }}>{asset[k] || '—'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Location Card */}
                        <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e5e7eb' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Current Stewardship</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>LOCATION</label>
                                    <div style={{ fontSize: 15, fontWeight: 600 }}>{asset.location?.name || 'Unassigned'}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{asset.location?.branch}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>DEPARTMENT</label>
                                    <div style={{ fontSize: 15, fontWeight: 600 }}>{asset.department || '—'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Modals (Simplified for brevity) */}
            {action && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400 }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>Record {action}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {action === 'transfer' && (
                                <>
                                    <select style={inp} onChange={e => setForm({ ...form, toLocation: e.target.value })}>
                                        <option value="">Target Location</option>
                                        {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                                    </select>
                                    <input placeholder="Reason" style={inp} onChange={e => setForm({ ...form, reason: e.target.value })} />
                                </>
                            )}
                            {action === 'maintenance' && (
                                <>
                                    <input type="date" style={inp} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
                                    <textarea placeholder="Problem Description" style={inp} onChange={e => setForm({ ...form, description: e.target.value })} />
                                    <input type="number" placeholder="Estimated Cost" style={inp} onChange={e => setForm({ ...form, cost: e.target.value })} />
                                </>
                            )}
                            {action === 'disposal' && (
                                <>
                                    <select style={inp} onChange={e => setForm({ ...form, disposalType: e.target.value })}>
                                        <option>Sale</option>
                                        <option>Scrap</option>
                                        <option>Loss / Theft</option>
                                    </select>
                                    <input type="number" placeholder="Sale Value" style={inp} onChange={e => setForm({ ...form, saleValue: e.target.value })} />
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                            <button onClick={() => setAction(null)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleAction} style={{ padding: '8px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
