import React, { useCallback, useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import {
    listTransformations,
    cancelTransformation,
    getTextileConversionMeta,
    getTextileConversionEligibility,
    getTransformationChainReport,
} from '@/services/textileConversionApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const inp = { height: 32, fontSize: 13, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', boxSizing: 'border-box' };

export default function TextileTransformationHistoryPage() {
    const { selectedCompany } = useCompany();
    const [meta, setMeta] = useState(null);
    const [entries, setEntries] = useState([]);
    const [chain, setChain] = useState([]);
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(null);
    const [process, setProcess] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');

    const isTextile = isTextileIndustryCompany(selectedCompany);

    const load = useCallback(async () => {
        if (!selectedCompany?._id || !isTextile) return;
        setLoading(true);
        try {
            const [elig, list, chainData] = await Promise.all([
                getTextileConversionEligibility(selectedCompany._id),
                listTransformations({
                    companyId: selectedCompany._id,
                    process: process || undefined,
                    search: search || undefined,
                    status: status || undefined,
                }),
                getTransformationChainReport(selectedCompany._id),
            ]);
            setEligible(elig);
            setEntries(list);
            setChain(chainData);
        } catch (e) {
            setEligible({ eligible: false, message: e.response?.data?.message || 'Not available' });
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile, process, search, status]);

    useEffect(() => {
        getTextileConversionMeta().then(setMeta).catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCancel = async (id, refNo) => {
        if (!window.confirm(`Cancel transformation ${refNo}? Stock will be reversed.`)) return;
        try {
            await cancelTransformation(id, selectedCompany._id);
            toast.success('Transformation cancelled — stock reversed');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Cancel failed');
        }
    };

    if (!isTextile) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Transformation History</h1>
                <p style={{ color: '#64748b' }}>Available only for Textile / Handloom companies.</p>
            </div>
        );
    }

    if (loading && !entries.length) return <BrandedLoader message="Loading transformation history…" />;

    if (eligible && eligible.eligible === false) {
        return (
            <div style={{ padding: 24 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Transformation History</h1>
                <p style={{ color: '#b91c1c' }}>{eligible.message || 'Textile template required'}</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Textile — Transformation History</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        Full traceability: lot, roll, barcode, vendor, worker, process
                    </p>
                </div>
                <Link to={PATHS.PRODUCTION.TEXTILE_TRANSFORMATION_ENTRY} style={{ fontSize: 13, color: '#2563eb' }}>
                    ← New entry
                </Link>
            </div>

            {chain.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>MRP CHAIN (Conversion Masters)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {chain.map((c, i) => (
                            <div key={i} style={{ fontSize: 12, padding: '6px 10px', background: '#f1f5f9', borderRadius: 6 }}>
                                {c.input?.itemCode} ({c.inputUom}) → {c.output?.itemCode} ({c.outputUom})
                                <span style={{ color: '#64748b' }}> · {c.formula}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Search ref, lot, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <select style={{ ...inp, width: 140 }} value={process} onChange={(e) => setProcess(e.target.value)}>
                        <option value="">All processes</option>
                        {(meta?.processes || []).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select style={{ ...inp, width: 120 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">All status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Ref', 'Date', 'Process', 'Input', 'Output', 'Loss', 'Lot / Roll', 'Vendor / Worker', 'Status', ''].map((h) => (
                                <th key={h} style={{ padding: '8px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e) => (
                            <tr key={e._id} style={{ opacity: e.status === 'CANCELLED' ? 0.55 : 1 }}>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{e.referenceNo}</td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>{e.process}</td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.inputQty} {e.inputUom}<br />
                                    <span style={{ color: '#94a3b8' }}>{e.inputItemId?.itemCode}</span>
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.outputQty} {e.outputUom}<br />
                                    <span style={{ color: '#94a3b8' }}>{e.outputItemId?.itemCode}</span>
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.lossQty > 0 ? `${e.lossQty} (${e.lossPercent}%)` : '—'}
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.traceability?.lotNo || '—'}<br />
                                    <span style={{ color: '#94a3b8' }}>{e.traceability?.rollNo}</span>
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.traceability?.vendor || '—'}<br />
                                    <span style={{ color: '#94a3b8' }}>{e.traceability?.worker}</span>
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <span style={{ color: e.status === 'ACTIVE' ? '#166534' : '#b91c1c' }}>{e.status}</span>
                                </td>
                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    {e.status === 'ACTIVE' && (
                                        <button type="button" title="Cancel & reverse stock" onClick={() => handleCancel(e._id, e.referenceNo)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }}>
                                            <XCircle size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {entries.length === 0 && (
                            <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No transformation history</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
