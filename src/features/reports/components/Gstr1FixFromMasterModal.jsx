import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card = {
    background: '#fff', borderRadius: 12, maxWidth: 920, width: '100%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.15)', padding: 24, maxHeight: '90vh', overflow: 'auto',
};
const col = { flex: 1, border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, background: '#f8fafc' };
const row = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 6, color: '#334155' };

function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN'); } catch { return '—'; }
}

/**
 * Comparison → validation → approval modal for Fix from Customer Master.
 */
export default function Gstr1FixFromMasterModal({
    open,
    invoiceId,
    onClose,
    onApplied,
}) {
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [preview, setPreview] = useState(null);
    const [reason, setReason] = useState('');
    const [confirmBlank, setConfirmBlank] = useState(false);

    useEffect(() => {
        if (!open || !invoiceId) {
            setPreview(null);
            setReason('');
            setConfirmBlank(false);
            return;
        }
        setLoading(true);
        api.get(`/gst-reports/fix-from-master/${invoiceId}/preview`)
            .then((res) => setPreview(res.data?.data || res.data))
            .catch((e) => {
                toast.error(e.response?.data?.message || 'Failed to load comparison');
                onClose?.();
            })
            .finally(() => setLoading(false));
    }, [open, invoiceId, onClose]);

    if (!open) return null;

    const left = preview?.invoiceSnapshot;
    const right = preview?.customerMaster;
    const eff = preview?.effectiveDateCheck;
    const impact = preview?.impact;

    const handleApply = async () => {
        if (!reason.trim()) return toast.error('Reason is required');
        if (eff?.requiresConfirmation && !confirmBlank) {
            return toast.error('Confirm GST was valid on invoice date');
        }
        if (preview?.blocked) return toast.error(preview.blockReason || 'Blocked');
        setApplying(true);
        try {
            const res = await api.post(`/gst-reports/fix-from-master/${invoiceId}/apply`, {
                reason: reason.trim(),
                confirmBlankEffectiveDate: confirmBlank,
            });
            toast.success(res.data?.message || 'Applied');
            onApplied?.(res.data);
            onClose?.();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Apply failed');
        } finally {
            setApplying(false);
        }
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Fix from Customer Master</h2>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                            Customer Master is current data. Invoice is historical. No silent overwrite.
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {loading && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading comparison…</div>}

                {!loading && preview && (
                    <>
                        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                            <div style={col}>
                                <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', marginBottom: 10 }}>CURRENT INVOICE SNAPSHOT</div>
                                <div style={row}><span>Customer</span><strong>{left?.customerName || '—'}</strong></div>
                                <div style={row}><span>Invoice No</span><strong>{left?.invoiceNumber || '—'}</strong></div>
                                <div style={row}><span>Invoice Date</span><strong>{fmtDate(left?.invoiceDate)}</strong></div>
                                <div style={row}><span>GSTIN</span><strong>{left?.customerGstin || '—'}</strong></div>
                                <div style={row}><span>Registration Type</span><strong>{left?.customerRegistrationType || '—'}</strong></div>
                                <div style={row}><span>GST State</span><strong>{left?.billingState || '—'}</strong></div>
                                <div style={row}><span>State Code</span><strong>{left?.billingStateCode || '—'}</strong></div>
                                <div style={row}><span>Place of Supply</span><strong>{left?.placeOfSupply || '—'}</strong></div>
                                <div style={row}><span>GST Type</span><strong>{left?.gstType || '—'}</strong></div>
                                <div style={row}><span>GSTR-1 Class</span><strong>{left?.classification || '—'}</strong></div>
                            </div>
                            <div style={{ ...col, background: '#f0fdfa', borderColor: '#99f6e4' }}>
                                <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', marginBottom: 10 }}>CURRENT CUSTOMER MASTER</div>
                                <div style={row}><span>GSTIN</span><strong>{right?.customerGstin || '—'}</strong></div>
                                <div style={row}><span>Registration Type</span><strong>{right?.customerRegistrationType || '—'}</strong></div>
                                <div style={row}><span>GST State</span><strong>{right?.billingState || '—'}</strong></div>
                                <div style={row}><span>State Code</span><strong>{right?.billingStateCode || '—'}</strong></div>
                                <div style={row}><span>Place of Supply</span><strong>{right?.placeOfSupply || '—'}</strong></div>
                                <div style={row}><span>Effective Date</span><strong>{fmtDate(right?.gstRegistrationEffectiveDate)}</strong></div>
                                <div style={row}><span>GST Status</span><strong>{right?.gstStatus || '—'}</strong></div>
                                <div style={row}><span>Customer Activity</span><strong>{right?.customerActivityType || '—'}</strong></div>
                                <div style={row}><span>Proposed Class</span><strong>{right?.classification || '—'}</strong></div>
                                <div style={row}><span>Proposed GST Type</span><strong>{right?.gstType || '—'}</strong></div>
                            </div>
                        </div>

                        <div style={{
                            background: preview.blocked ? '#fef2f2' : (eff?.requiresConfirmation ? '#fffbeb' : '#f0fdf4'),
                            border: `1px solid ${preview.blocked ? '#fecaca' : (eff?.requiresConfirmation ? '#fde68a' : '#bbf7d0')}`,
                            borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13,
                        }}>
                            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={16} /> Was this GST registration valid on the invoice date?
                            </div>
                            <div>{eff?.message}</div>
                            {preview.gstr1Filed && (
                                <div style={{ marginTop: 6, fontWeight: 600 }}>GSTR-1 period {preview.returnPeriod} is marked Filed → amendment record will be created (invoice not overwritten).</div>
                            )}
                            <div style={{ marginTop: 6 }}><strong>Tax impact:</strong> {impact?.taxImpact} — {impact?.message}</div>
                            <div><strong>Accounting:</strong> {impact?.accountingImpact}</div>
                            <div><strong>GSTR-1 sheets:</strong> {impact?.gstr1SheetImpact}</div>
                        </div>

                        {eff?.requiresConfirmation && !preview.blocked && (
                            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 12 }}>
                                <input type="checkbox" checked={confirmBlank} onChange={(e) => setConfirmBlank(e.target.checked)} />
                                <span>I confirm GST registration was valid on the invoice date (effective date blank).</span>
                            </label>
                        )}

                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Reason (required)</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason for GSTR-1 invoice GST correction"
                            style={{ width: '100%', minHeight: 70, border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 13, boxSizing: 'border-box' }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Back</button>
                            <button
                                type="button"
                                disabled={applying || preview.blocked}
                                onClick={handleApply}
                                style={{
                                    padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                                    background: preview.blocked ? '#e2e8f0' : '#0d9488',
                                    color: preview.blocked ? '#94a3b8' : '#fff',
                                }}
                            >
                                {applying ? 'Applying…' : (preview.gstr1Filed ? 'Create Amendment Record' : 'Apply Metadata to Invoice Snapshot')}
                            </button>
                        </div>
                        {impact?.taxImpact === 'GstTypeChange' && (
                            <div style={{ marginTop: 10, fontSize: 12, color: '#b45309' }}>
                                Master GST type differs from the invoice. This action applies GSTIN / POS / registration metadata only and keeps the invoice tax split unchanged. Full CGST↔IGST recalculation is not done here.
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
