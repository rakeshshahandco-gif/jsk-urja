import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, ScanLine } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { PATHS } from '@/routes/paths';
import { getProcessTraceByBarcode } from '@/services/textileProcessOutputApi';

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const f = { input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' } };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 };

const EVENT_LABELS = {
    RETURN: 'Return recorded',
    ISSUE_TO_NEXT_PROCESS: 'Issued to next process',
    FINISHED_GOODS: 'Transferred to finished goods',
};

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : '—';
}

function ChallanDetailBlock({ doc }) {
    const cfg = getTextileJobWorkProcessConfig(doc.processType || 'Dyeing');
    const detailPath = cfg.paths.detail(doc._id);

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>{doc.processType || 'Job Work'} Challan</div>
                    <h2 style={{ margin: '4px 0', fontSize: 18, fontWeight: 800 }}>{doc.challanNo}</h2>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                        {doc.dyerName} · {doc.status} · Issue {fmtDate(doc.issueDate)}
                        {doc.expectedReturnDate ? ` · Expected return ${fmtDate(doc.expectedReturnDate)}` : ''}
                    </p>
                </div>
                <button type="button" onClick={() => window.open(detailPath, '_blank')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    <ExternalLink size={14} /> Open full challan
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                    ['Issued Meter', `${doc.totalIssuedMeter ?? 0} m`],
                    ['Expected PCS', doc.totalExpectedPcs ?? '—'],
                    ['Returned Meter', `${doc.totalReturnedMeter ?? 0} m`],
                    ['Pending Meter', `${doc.totalPendingMeter ?? 0} m`],
                    ['Labour', doc.totalLabourAmount ? `Rs ${doc.totalLabourAmount}` : '—'],
                    ['Barcode', doc.barcodeValue || '—'],
                ].map(([label, val]) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 6, padding: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{val}</div>
                    </div>
                ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Issue Lines</div>
            <div style={{ overflow: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Lot', 'Than', 'Colour', 'Issued m', 'Issued PCS', 'M/PCS', 'Exp PCS', 'Returned m', 'Returned PCS', 'Pending m', 'Labour'].map((h) => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(doc.lines || []).map((ln) => (
                            <tr key={ln._id}>
                                <td style={td}>{ln.lotNo || '—'}</td>
                                <td style={td}>{ln.thanNo || '—'}</td>
                                <td style={td}>{ln.colourName || ln.designPattern || '—'}</td>
                                <td style={td}>{ln.issuedMeter ?? '—'}</td>
                                <td style={td}>{ln.issuedQty ? `${ln.issuedQty} ${ln.issuedUom || ''}` : '—'}</td>
                                <td style={td}>{ln.meterPerPcs || '—'}</td>
                                <td style={td}>{ln.expectedPcs ?? '—'}</td>
                                <td style={td}>{ln.returnedMeter ?? 0}</td>
                                <td style={td}>{ln.returnedQty ? `${ln.returnedQty} ${ln.returnedUom || ''}` : '—'}</td>
                                <td style={td}>{ln.pendingMeter ?? '—'}</td>
                                <td style={td}>{ln.labourAmount ? `Rs ${ln.labourAmount}` : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {(doc.returns || []).length > 0 && (
                <>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Returns</div>
                    {(doc.returns || []).map((ret) => (
                        <div key={ret._id || ret.returnNo} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'auto' }}>
                            <div style={{ padding: '8px 12px', background: '#f0fdf4', fontSize: 12, fontWeight: 700 }}>
                                {ret.returnNo} · {fmtDate(ret.returnDate)} · Total qty {ret.totalReturnedQty ?? '—'}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Colour', 'Returned Qty', 'UOM', 'Loss m', 'Output Item'].map((h) => (
                                            <th key={h} style={th}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(ret.lines || []).map((rl, idx) => (
                                        <tr key={idx}>
                                            <td style={td}>{rl.colourName || '—'}</td>
                                            <td style={td}>{rl.returnedQty ?? '—'}</td>
                                            <td style={td}>{rl.returnUom || '—'}</td>
                                            <td style={td}>{rl.lossMeter ?? '—'}</td>
                                            <td style={td}>{rl.outputItemName || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

export default function TextileProcessTracePage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [barcode, setBarcode] = useState('');
    const [bundle, setBundle] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState('');

    const traces = bundle?.traces || [];
    const challans = bundle?.challans || [];
    const outputStock = bundle?.outputStock || [];

    const handleScan = async (e) => {
        e?.preventDefault();
        const key = barcode.trim();
        if (!key) return toast.error('Enter challan no, barcode or trace id');
        setLoading(true);
        try {
            const data = await getProcessTraceByBarcode(key, selectedCompany._id);
            const payload = Array.isArray(data) ? { traces: data, challans: [], outputStock: [] } : data;
            setBundle(payload);
            setSearched(key);
            if (!payload.traces?.length && !payload.challans?.length) {
                toast.error('No challan or trace found');
            } else {
                toast.success(`Found ${payload.challans?.length || 0} challan(s), ${payload.traces?.length || 0} trace step(s)`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
            setBundle(null);
        } finally {
            setLoading(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1100 }}>
            <button
                type="button"
                onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}
            >
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Process Trace</h1>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
                Scan challan QR or enter challan no — shows full challan details, returns, process output stock and history chain
            </p>

            <form onSubmit={handleScan} style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                    <input
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Challan no, barcode value, or trace id…"
                        style={f.input}
                        autoFocus
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                    <ScanLine size={16} /> {loading ? 'Searching…' : 'Lookup Trace'}
                </button>
            </form>

            {searched && !loading && !traces.length && !challans.length && (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 8 }}>
                    No challan or trace for <strong>{searched}</strong>. Try the challan number from print (e.g. DC-..., EC-...).
                </div>
            )}

            {challans.length > 0 && (
                <>
                    <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Challan Details ({challans.length})</h2>
                    {challans.map((doc) => (
                        <ChallanDetailBlock key={doc._id} doc={doc} />
                    ))}
                </>
            )}

            {outputStock.length > 0 && (
                <div style={card}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Process Output Stock</h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Process', 'Return', 'Item', 'Colour', 'Balance', 'Status', 'Vendor'].map((h) => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {outputStock.map((r) => (
                                <tr key={r._id}>
                                    <td style={td}>{r.processType}</td>
                                    <td style={td}>{r.sourceReturnNo}</td>
                                    <td style={td}>{r.itemName}</td>
                                    <td style={td}>{r.colour || '—'}</td>
                                    <td style={td}><strong>{r.qtyBalance}</strong> {r.qtyUom} / <strong>{r.meterBalance}</strong> m</td>
                                    <td style={td}>{r.status}</td>
                                    <td style={td}>{r.previousVendor || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {traces.length > 0 && (
                <>
                    <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Process History Chain ({traces.length} steps)</h2>
                    <div style={{ position: 'relative', paddingLeft: 24, marginBottom: 20 }}>
                        {traces.map((t, idx) => (
                            <div key={`${t.traceId}-${t.sequenceNo}-${idx}`} style={{ position: 'relative', marginBottom: 16 }}>
                                <div style={{ position: 'absolute', left: -24, top: 6, width: 12, height: 12, borderRadius: '50%', background: idx === traces.length - 1 ? '#7c3aed' : '#cbd5e1', border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0' }} />
                                {idx < traces.length - 1 && (
                                    <div style={{ position: 'absolute', left: -19, top: 18, width: 2, height: 'calc(100% + 4px)', background: '#e2e8f0' }} />
                                )}
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 800, fontSize: 14 }}>{t.processType}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f5f3ff', color: '#7c3aed' }}>
                                            {EVENT_LABELS[t.eventType] || t.eventType}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>Step {t.sequenceNo}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, fontSize: 13 }}>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Challan</span><br /><strong>{t.challanNo || '—'}</strong></div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Return</span><br />{t.returnNo || '—'}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Vendor</span><br />{t.vendorName || '—'}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Item</span><br />{t.itemName || '—'}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Colour</span><br />{t.colour || '—'}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Qty</span><br />{t.qtyReturned} {t.qtyUom}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Lot / Than</span><br />{t.lotNo || '—'} / {t.thanNo || '—'}</div>
                                        <div><span style={{ color: '#64748b', fontSize: 11 }}>Date</span><br />{fmtDate(t.returnDate || t.issueDate)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
