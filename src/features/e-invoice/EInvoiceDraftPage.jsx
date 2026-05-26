import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getEInvoiceById,
    updateEInvoiceDraft,
    exportEInvoiceJson,
    refreshEInvoiceFromInvoice,
    generateEInvoiceIrn,
    recordEInvoiceIrnManual,
    validateEInvoice,
} from '@/services/eInvoiceApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { Download, Save, RefreshCw, QrCode, AlertTriangle, CheckCircle, FileText } from 'lucide-react';

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff' };
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' };
const sectionStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };

export default function EInvoiceDraftPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [manualIrn, setManualIrn] = useState({ irn: '', irnAckNo: '', irnAckDate: '', signedQrCode: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [res, valRes] = await Promise.all([
                getEInvoiceById(id),
                validateEInvoice(id).catch(() => ({ data: { errors: [] } })),
            ]);
            const d = res.data;
            setDraft(d);
            setManualIrn({
                irn: d.irn || '',
                irnAckNo: d.irnAckNo || '',
                irnAckDate: d.irnAckDate ? d.irnAckDate.split('T')[0] : '',
                signedQrCode: d.signedQrCode || '',
            });
            setValidationErrors(valRes.data?.errors || []);
        } catch {
            toast.error('Failed to load E-Invoice draft');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const payload = draft?.payload || {};
    const seller = payload.SellerDtls || {};
    const buyer = payload.BuyerDtls || {};
    const doc = payload.DocDtls || {};
    const items = payload.ItemList || [];

    const handleExportJson = async () => {
        try {
            const res = await exportEInvoiceJson(id);
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
            const a = document.createElement('a');
            a.setAttribute('href', dataStr);
            a.setAttribute('download', `EINV_${doc.No || draft.invoiceNumber}.json`);
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast.success('JSON exported — upload to e-Invoice IRP portal');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Export failed — fix validation errors first');
        }
    };

    const handleRefresh = async () => {
        setLoading(true);
        try {
            const res = await refreshEInvoiceFromInvoice(id);
            setDraft(res.data);
            toast.success('Refreshed from sales invoice');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Refresh failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateIrn = async () => {
        setSaving(true);
        try {
            const res = await generateEInvoiceIrn(id);
            const { draft: updated, result } = res.data;
            if (result?.irn) {
                toast.success('IRN generated via API');
                setDraft(updated);
            } else {
                toast('API not configured — export JSON and upload manually, then record IRN below', { icon: 'ℹ️' });
            }
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'IRN generation failed');
        } finally {
            setSaving(false);
        }
    };

    const handleRecordManual = async () => {
        if (!manualIrn.irn?.trim()) return toast.error('Enter IRN first');
        setSaving(true);
        try {
            const res = await recordEInvoiceIrnManual(id, manualIrn);
            setDraft(res.data);
            toast.success('IRN saved on invoice');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to record IRN');
        } finally {
            setSaving(false);
        }
    };

    const setBuyer = (key, val) => {
        setDraft(p => ({
            ...p,
            payload: {
                ...p.payload,
                BuyerDtls: { ...p.payload.BuyerDtls, [key]: val },
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateEInvoiceDraft(id, { payload: draft.payload, remarks: draft.remarks });
            toast.success('Draft saved');
            load();
        } catch {
            toast.error('Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !draft) return <div style={{ padding: 40, textAlign: 'center' }}>Loading draft...</div>;
    if (!draft) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>Draft not found</div>;

    return (
        <div style={{ padding: '20px 30px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <button type="button" onClick={() => navigate(PATHS.E_INVOICE.LIST)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 5 }}>← E-Invoice List</button>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>E-Invoice Draft</h1>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                        Invoice <strong>{draft.invoiceNumber || doc.No}</strong> · Status: <span style={{ color: '#2563eb', fontWeight: 700 }}>{draft.status}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={handleRefresh} disabled={draft.status === 'IRN Generated'} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        <RefreshCw size={16} /> Refresh from Invoice
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        <Save size={16} /> Save
                    </button>
                    <button type="button" onClick={handleExportJson} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                        <Download size={18} /> EXPORT JSON
                    </button>
                    <button type="button" onClick={handleGenerateIrn} disabled={saving || draft.status === 'IRN Generated'} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                        <QrCode size={18} /> GENERATE IRN
                    </button>
                </div>
            </div>

            {validationErrors.length > 0 && (
                <div style={{ ...sectionStyle, background: '#fff7ed', borderLeft: '6px solid #f97316' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9a3412', marginBottom: 10 }}>
                        <AlertTriangle size={20} />
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Validation issues</h4>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#c2410c' }}>
                        {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        <FileText size={20} color="#2563eb" />
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Seller (from Company Profile)</h3>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                        <div><strong>{seller.LglNm}</strong></div>
                        <div>GSTIN: {seller.Gstin || '—'}</div>
                        <div>{seller.Addr1}</div>
                        <div>{seller.Loc} · PIN {seller.Pin}</div>
                    </div>
                </div>

                <div style={sectionStyle}>
                    <h3 style={{ margin: '0 0 15px', fontSize: 15, fontWeight: 800 }}>Buyer (editable before export)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Legal / Trade Name</label><input value={buyer.LglNm || ''} onChange={e => setBuyer('LglNm', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>GSTIN</label><input value={buyer.Gstin || ''} onChange={e => setBuyer('Gstin', e.target.value)} style={inp} placeholder="GSTIN or URP" /></div>
                        <div><label style={lbl}>Place of Supply</label><input value={buyer.Pos || ''} onChange={e => setBuyer('Pos', e.target.value)} style={inp} /></div>
                        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Address</label><input value={buyer.Addr1 || ''} onChange={e => setBuyer('Addr1', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>City</label><input value={buyer.Loc || ''} onChange={e => setBuyer('Loc', e.target.value)} style={inp} /></div>
                        <div><label style={lbl}>Pincode</label><input type="number" value={buyer.Pin || ''} onChange={e => setBuyer('Pin', Number(e.target.value))} style={inp} /></div>
                    </div>
                </div>

                <div style={{ ...sectionStyle, gridColumn: 'span 2', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#166534', marginBottom: 15 }}>
                        <CheckCircle size={20} />
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Record IRN after portal upload</h4>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                        <div><label style={lbl}>IRN</label><input value={manualIrn.irn} onChange={e => setManualIrn(p => ({ ...p, irn: e.target.value }))} style={inp} placeholder="64-char IRN" /></div>
                        <div><label style={lbl}>Ack No</label><input value={manualIrn.irnAckNo} onChange={e => setManualIrn(p => ({ ...p, irnAckNo: e.target.value }))} style={inp} /></div>
                        <div><label style={lbl}>Ack Date</label><input type="date" value={manualIrn.irnAckDate} onChange={e => setManualIrn(p => ({ ...p, irnAckDate: e.target.value }))} style={inp} /></div>
                        <button type="button" onClick={handleRecordManual} disabled={saving} style={{ padding: '10px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                            SAVE IRN
                        </button>
                    </div>
                    {draft.irn && (
                        <p style={{ marginTop: 12, fontSize: 12, color: '#15803d', fontFamily: 'monospace', wordBreak: 'break-all' }}>Current: {draft.irn}</p>
                    )}
                </div>
            </div>

            <div style={sectionStyle}>
                <h4 style={{ margin: '0 0 15px', color: '#64748b' }}>Line items (from invoice)</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={{ padding: '10px 0' }}>#</th>
                            <th>Description</th>
                            <th>HSN</th>
                            <th>Qty</th>
                            <th>Taxable</th>
                            <th>GST%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '10px 0' }}>{it.SlNo}</td>
                                <td style={{ fontWeight: 600 }}>{it.PrdDesc}</td>
                                <td>{it.HsnCd || '—'}</td>
                                <td>{it.Qty} {it.Unit}</td>
                                <td>₹{(it.AssAmt || 0).toLocaleString()}</td>
                                <td>{it.GstRt}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {payload.ValDtls && (
                    <div style={{ marginTop: 16, display: 'flex', gap: 24, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        <span>Taxable: ₹{(payload.ValDtls.AssVal || 0).toLocaleString()}</span>
                        <span>Total: ₹{(payload.ValDtls.TotInvVal || 0).toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
