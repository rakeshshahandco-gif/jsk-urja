import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEwayBillById, updateEwayBill, exportEwayBillJson, syncEwayBillWithMaster } from '@/services/ewayBillApi';
import { getTransporters } from '@/services/transporterApi';

import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { Download, Save, Send, Truck, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' };
const sectionStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };

export default function EwayBillDraftPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ewayBill, setEwayBill] = useState(null);
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [res, transRes] = await Promise.all([
                getEwayBillById(id),
                getTransporters()
            ]);
            setEwayBill(res.data);
            setTransporters(transRes.data || []);
        } catch (e) {
            toast.error('Failed to load E-Way Bill details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const handleUpdate = async (silent = false) => {
        setSaving(true);
        try {
            await updateEwayBill(id, ewayBill);
            if (!silent) toast.success('Draft saved successfully');
        } catch (e) {
            toast.error('Failed to save draft');
        } finally {
            setSaving(false);
        }
    };

    const handleSyncMaster = async () => {
        setLoading(true);
        try {
            const res = await syncEwayBillWithMaster(id);
            setEwayBill(res.data);
            toast.success('Successfully updated from Customer Master');
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to sync with master');
        } finally {
            setLoading(false);
        }
    };

    const handleExportJson = async () => {

        try {
            const res = await exportEwayBillJson(id);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `EWB_${ewayBill.partA.docNo}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            toast.success('JSON Exported! Upload this to the E-Way Bill portal.');
            load(); // Reload to get updated status
        } catch (e) {
            toast.error(e.response?.data?.message || 'JSON Export failed. Check if all required fields are filled.');
        }
    };

    const handleTransporterSelect = (e) => {
        const t = transporters.find(x => x.transporterName === e.target.value);
        if (t) {
            setEwayBill(p => ({
                ...p,
                transporterId: t._id,
                partB: {
                    ...p.partB,
                    transId: t.transporterId,
                    transName: t.transporterName
                }
            }));
        } else {
            setEwayBill(p => ({ ...p, transporterId: null }));
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading Draft...</div>;
    if (!ewayBill) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>Draft not found</div>;

    const setPartA = (key, val) => setEwayBill(p => ({ ...p, partA: { ...p.partA, [key]: val } }));
    const setPartB = (key, val) => setEwayBill(p => ({ ...p, partB: { ...p.partB, [key]: val } }));

    const validationErrors = [];
    if (!ewayBill.partA.fromGstin) validationErrors.push("Our GSTIN is missing");
    if (!ewayBill.partA.toGstin && ewayBill.partA.toGstin !== 'URP') validationErrors.push("Consignee GSTIN is missing");
    if (!ewayBill.partA.fromPincode) validationErrors.push("Dispatch Pincode is missing");
    if (!ewayBill.partA.toPincode) validationErrors.push("Consignee Pincode is missing");
    if (ewayBill.partB.transMode === 'Road' && !ewayBill.partB.vehicleNo && !ewayBill.partB.transId) {
        validationErrors.push("Part B: Either Vehicle No or Transporter ID is required");
    }

    return (
        <div style={{ padding: '20px 30px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                <div>
                    <button onClick={() => navigate(PATHS.EWAY_BILL.LIST)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 5 }}>← E-Way Bill List</button>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>E-Way Bill Draft</h1>
                    <div style={{ fontSize: 13, color: '#64748b' }}>For Invoice: <strong>{ewayBill.partA.docNo}</strong> · Status: <span style={{ color: '#0d9488', fontWeight: 700 }}>{ewayBill.status}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => handleUpdate()} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                        <Save size={18} /> {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button onClick={handleExportJson} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 14, boxShadow: '0 4px 12px rgba(13,148,136,0.3)' }}>
                        <Download size={18} /> EXPORT JSON
                    </button>
                </div>
            </div>

            {validationErrors.length > 0 && (
                <div style={{ ...sectionStyle, background: '#fff7ed', borderLeft: '6px solid #f97316' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9a3412', marginBottom: 10 }}>
                        <AlertTriangle size={20} />
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Validation Issues Found</h4>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#c2410c' }}>
                        {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* PART A SECTION */}
                <div style={sectionStyle}>
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileText size={20} color="#0d9488" />
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Part A: Basic Details</h3>
                        </div>
                        <button 
                            onClick={handleSyncMaster}
                            style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#0d9488', display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Refetch address and GST from Customer Master"
                        >
                            🔄 Sync from Masters
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                        <div><label style={lbl}>Consignee Name</label><input value={ewayBill.partA.toTrdName} onChange={e => setPartA('toTrdName', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>Consignee GSTIN</label><input value={ewayBill.partA.toGstin} onChange={e => setPartA('toGstin', e.target.value)} style={inp} placeholder="GSTIN or URP" /></div>
                        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Delivery Address</label><textarea value={ewayBill.partA.toAddr1} onChange={e => setPartA('toAddr1', e.target.value)} style={{ ...inp, height: 60 }} /></div>
                        <div><label style={lbl}>Place (City)</label><input value={ewayBill.partA.toPlace} onChange={e => setPartA('toPlace', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>Pincode</label><input value={ewayBill.partA.toPincode} onChange={e => setPartA('toPincode', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>State Code</label><input type="number" value={ewayBill.partA.toStateCode} onChange={e => setPartA('toStateCode', Number(e.target.value))} style={inp} /></div>
                    </div>
                </div>

                {/* PART B SECTION */}
                <div style={sectionStyle}>
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Truck size={20} color="#2563eb" />
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Part B: Transport / Courier Details</h3>
                    </div>
                    
                    <div style={{ marginBottom: 15 }}>
                        <label style={lbl}>Select Logistics Provider (Transporter / Courier)</label>
                        <select 
                            value={ewayBill.partB.transName} 
                            onChange={handleTransporterSelect} 
                            style={inp}
                        >
                            <option value="">-- Search & Select from Master --</option>
                            {transporters.map(t => (
                                <option key={t._id} value={t.transporterName}>
                                    {t.type === 'Courier' ? '📦 ' : '🚛 '}{t.transporterName} ({t.transporterId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                        <div><label style={lbl}>Provider ID (GSTIN)</label><input value={ewayBill.partB.transId} onChange={e => setPartB('transId', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>Provider Name</label><input value={ewayBill.partB.transName} onChange={e => setPartB('transName', e.target.value)} style={inp} /></div>
                        
                        <div>
                            <label style={lbl}>Transport Mode</label>
                            <select value={ewayBill.partB.transMode} onChange={e => setPartB('transMode', e.target.value)} style={inp}>
                                <option value="Road">Road (Standard / Courier)</option>
                                <option value="Rail">Rail</option>
                                <option value="Air">Air (Courier / Fast)</option>
                                <option value="Ship">Ship</option>
                            </select>
                        </div>
                        <div><label style={lbl}>Approx Distance (KM)</label><input type="number" value={ewayBill.partB.distance} onChange={e => setPartB('distance', Number(e.target.value))} style={inp} /></div>
                        
                        <div><label style={lbl}>Vehicle / Doc No (LR / Tracking No)</label><input value={ewayBill.partB.vehicleNo || ewayBill.partB.transDocNo} onChange={e => { setPartB('vehicleNo', e.target.value); setPartB('transDocNo', e.target.value); }} style={inp} placeholder="AB00CD1234 or Tracking ID" /></div>
                        <div>
                            <label style={lbl}>Vehicle Type</label>
                            <select value={ewayBill.partB.vehicleType} onChange={e => setPartB('vehicleType', e.target.value)} style={inp}>
                                <option value="Regular">Regular</option>
                                <option value="Odc">ODC (Over Dimensional Cargo)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* FINAL STATUS UPDATE SECTION */}
                <div style={{ ...sectionStyle, gridColumn: 'span 2', background: '#f0fdf4', border: '1px solid #bdf4c9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#166534', marginBottom: 15 }}>
                        <CheckCircle size={20} />
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Mark as Generated / Save Final EWB No</h4>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 15, alignItems: 'flex-end' }}>
                        <div style={{ gridColumn: 'span 1' }}><label style={lbl}>Final EWB Number</label><input value={ewayBill.ewayBillNo} onChange={e => setEwayBill(p => ({ ...p, ewayBillNo: e.target.value }))} style={inp} placeholder="12-digit number" /></div>
                        <div style={{ gridColumn: 'span 1' }}><label style={lbl}>Generation Date</label><input type="date" value={ewayBill.ewayBillDate ? ewayBill.ewayBillDate.split('T')[0] : ''} onChange={e => setEwayBill(p => ({ ...p, ewayBillDate: e.target.value }))} style={inp} /></div>
                        <div style={{ gridColumn: 'span 1' }}><label style={lbl}>Valid Until</label><input type="datetime-local" value={ewayBill.validUntil ? ewayBill.validUntil.slice(0, 16) : ''} onChange={e => setEwayBill(p => ({ ...p, validUntil: e.target.value }))} style={inp} /></div>
                        <button 
                            onClick={async () => {
                                if (!ewayBill.ewayBillNo) return toast.error('Enter EWB Number first');
                                const updated = { ...ewayBill, status: 'EWB Generated' };
                                await updateEwayBill(id, updated);
                                setEwayBill(updated);
                                toast.success('Status updated to Generated!');
                            }}
                            style={{ padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                        >
                            UPDATE STATUS
                        </button>
                    </div>
                </div>
            </div>

            {/* ITEM DETAILS SUMMARY (READ ONLY) */}
            <div style={sectionStyle}>
                <h4 style={{ margin: '0 0 15px', color: '#64748b' }}>Taxable Values Summary (from Invoice)</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '10px 0' }}>Description</th>
                            <th>HSN</th>
                            <th>Qty</th>
                            <th>Taxable</th>
                            <th>CGST</th>
                            <th>SGST</th>
                            <th>IGST</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ewayBill.partA.itemList.map((it, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '12px 0', fontWeight: 600 }}>{it.productName}</td>
                                <td>{it.hsnCode}</td>
                                <td>{it.quantity} {it.qtyUnit}</td>
                                <td>₹{it.taxableAmount.toLocaleString()}</td>
                                <td>{it.cgstRate}%</td>
                                <td>{it.sgstRate}%</td>
                                <td>{it.igstRate}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
