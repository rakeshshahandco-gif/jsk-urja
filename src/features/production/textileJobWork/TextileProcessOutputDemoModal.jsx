import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import {
    executeTextileDemoTransfer,
    previewTextileDemoTransfer,
    resetTextileDemo,
    seedTextileDemo,
} from '@/services/textileProcessOutputApi';

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const modal = {
    background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
    maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
};
const hdr = { padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const body = { padding: 18 };
const btnPrimary = { padding: '10px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '10px 16px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const demoBadge = { display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '3px 8px', borderRadius: 999, background: '#fef3c7', color: '#b45309', marginBottom: 10 };

function PreviewBlock({ title, before, after }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>BEFORE</div>
                    <div>Process Output: <strong>{before.processOutputStock.qtyPcs} PCS</strong> / {before.processOutputStock.meter} m</div>
                    <div>Finished Goods: <strong>{before.finishedGoods.qtyPcs} PCS</strong> / {before.finishedGoods.meter} m</div>
                </div>
                <ArrowRight size={18} color="#94a3b8" />
                <div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>AFTER</div>
                    <div>Process Output: <strong>{after.processOutputStock.qtyPcs} PCS</strong> / {after.processOutputStock.meter} m</div>
                    <div>Finished Goods: <strong>{after.finishedGoods.qtyPcs} PCS</strong> / {after.finishedGoods.meter} m</div>
                </div>
            </div>
        </div>
    );
}

export default function TextileProcessOutputDemoModal({ open, onClose, companyId, demoStatus, onComplete }) {
    const [step, setStep] = useState('form');
    const [mode, setMode] = useState('full');
    const [qtyPcs, setQtyPcs] = useState('10');
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const stock = demoStatus?.stock;

    useEffect(() => {
        if (open) {
            setStep('form');
            setMode('full');
            setQtyPcs('10');
            setPreview(null);
            setResult(null);
        }
    }, [open]);

    if (!open) return null;

    const ensureSeed = async () => {
        if (stock) return stock;
        setLoading(true);
        try {
            await seedTextileDemo(companyId);
            toast.success('Demo data created (TDC-DEMO-00001)');
            onComplete?.();
            return true;
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handlePreview = async () => {
        if (!stock) {
            const ok = await ensureSeed();
            if (!ok) return;
            onComplete?.();
            toast('Demo row created — click the button again to open transfer', { icon: 'ℹ️' });
            return;
        }
        setLoading(true);
        try {
            const payload = {
                companyId,
                mode,
                ...(mode === 'partial' ? { qtyPcs: Number(qtyPcs) } : {}),
            };
            const data = await previewTextileDemoTransfer(payload);
            setPreview(data);
            setStep('preview');
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const payload = {
                companyId,
                mode,
                ...(mode === 'partial' ? { qtyPcs: Number(qtyPcs) } : {}),
            };
            const data = await executeTextileDemoTransfer(payload);
            setResult(data);
            setStep('success');
            onComplete?.();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        setLoading(true);
        try {
            await resetTextileDemo(companyId);
            toast.success('Demo reset — 20 PCS / 50 m restored');
            onComplete?.();
            setStep('form');
            setPreview(null);
            setResult(null);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={modal} onClick={(e) => e.stopPropagation()}>
                <div style={hdr}>
                    <div>
                        <span style={demoBadge}>DEMO MODE</span>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>Transfer To Finished Goods</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Localhost testing only — no real stock changed</div>
                    </div>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                <div style={body}>
                    {step === 'form' && (
                        <>
                            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>PROCESS OUTPUT STOCK</div>
                                {stock ? (
                                    <>
                                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{stock.itemName}</div>
                                        <div style={{ fontSize: 13, color: '#64748b' }}>Colour: {stock.colour} · {stock.sourceChallanNo}</div>
                                        <div style={{ fontSize: 14, marginTop: 8 }}>
                                            Available: <strong>{stock.qtyBalance} PCS</strong> · <strong>{stock.meterBalance} m</strong>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 13, marginTop: 8, color: '#64748b' }}>
                                        Demo row not created yet. Click Continue to seed <strong>TDC-DEMO-00001</strong> (20 PCS / 50 m, KATHA SILK, BLUE).
                                    </div>
                                )}
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>NEXT ACTION</div>
                            <label style={{ display: 'flex', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                                <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
                                <span><strong>Transfer Full Qty</strong> — move all available PCS to demo Finished Goods</span>
                            </label>
                            <label style={{ display: 'flex', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                                <input type="radio" checked={mode === 'partial'} onChange={() => setMode('partial')} />
                                <span><strong>Transfer Partial Qty</strong></span>
                            </label>
                            {mode === 'partial' && (
                                <label style={{ display: 'block', marginBottom: 16 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>PCS TO TRANSFER</span>
                                    <input type="number" min="1" max={stock?.qtyBalance || 20} value={qtyPcs} onChange={(e) => setQtyPcs(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                                </label>
                            )}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" disabled={loading} onClick={handlePreview} style={btnPrimary}>
                                    {loading ? 'Please wait…' : stock ? 'Preview Transfer' : 'Create Demo & Continue'}
                                </button>
                                <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
                            </div>
                        </>
                    )}

                    {step === 'preview' && preview && (
                        <>
                            <PreviewBlock title="Transfer preview" before={preview.before} after={preview.after} />
                            <div style={{ fontSize: 13, marginBottom: 14 }}>
                                Transferring <strong>{preview.transferPcs} PCS</strong> ({preview.transferMeter} m) of {preview.itemName} ({preview.colour})
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" disabled={loading} onClick={handleConfirm} style={btnPrimary}>{loading ? 'Transferring…' : 'Confirm Transfer'}</button>
                                <button type="button" onClick={() => setStep('form')} style={btnGhost}>Back</button>
                            </div>
                        </>
                    )}

                    {step === 'success' && result && (
                        <>
                            <div style={{ textAlign: 'center', padding: '12px 0 18px' }}>
                                <CheckCircle2 size={40} color="#059669" style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>Transfer Successful</div>
                            </div>
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.7 }}>
                                <div>Item: <strong>{result.itemName}</strong></div>
                                <div>Colour: <strong>{result.colour}</strong></div>
                                <div>Transferred: <strong>{result.transferred.qtyPcs} PCS</strong> ({result.transferred.meter} m)</div>
                                <div>Remaining in Process Output: <strong>{result.remaining.qtyPcs} PCS</strong> ({result.remaining.meter} m)</div>
                                <div>Demo Finished Goods total: <strong>{result.finishedGoods.qtyPcs} PCS</strong> ({result.finishedGoods.meter} m)</div>
                            </div>
                            {result.audit && (
                                <div style={{ marginTop: 14, fontSize: 12, color: '#64748b' }}>
                                    Audit: {new Date(result.audit.date).toLocaleString()} · {result.audit.userName} · {result.audit.sourceProcess}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                                <button type="button" onClick={onClose} style={btnPrimary}>Close</button>
                                <button type="button" disabled={loading} onClick={handleReset} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <RotateCcw size={14} /> Reset Demo
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
