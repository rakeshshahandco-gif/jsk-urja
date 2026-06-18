import React, { useCallback, useEffect, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import {
    getVendorRateReport,
    getWorkerRateReport,
    getProcessCostSummary,
    getTextileJobWorkMeta,
} from '@/services/textileJobWorkRateApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const tabs = [
    { id: 'vendor', label: 'Vendor Rate List' },
    { id: 'worker', label: 'Worker Rate List' },
    { id: 'cost', label: 'Process Cost Summary' },
];

export default function TextileJobWorkReportsPage() {
    const { selectedCompany } = useCompany();
    const [tab, setTab] = useState('vendor');
    const [meta, setMeta] = useState(null);
    const [vendorRows, setVendorRows] = useState([]);
    const [workerRows, setWorkerRows] = useState([]);
    const [costData, setCostData] = useState(null);
    const [loading, setLoading] = useState(true);

    const isTextile = isTextileIndustryCompany(selectedCompany);
    const rateLabel = (v) => meta?.rateTypes?.find((t) => t.value === v)?.label || v;

    const load = useCallback(async () => {
        if (!selectedCompany?._id || !isTextile) return;
        setLoading(true);
        try {
            const [v, w, c] = await Promise.all([
                getVendorRateReport({ companyId: selectedCompany._id }),
                getWorkerRateReport({ companyId: selectedCompany._id }),
                getProcessCostSummary({ companyId: selectedCompany._id }),
            ]);
            setVendorRows(v);
            setWorkerRows(w);
            setCostData(c);
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id, isTextile]);

    useEffect(() => {
        getTextileJobWorkMeta().then(setMeta).catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    if (!isTextile) {
        return <div style={{ padding: 24 }}><p>Textile reports only — switch to Handloom company.</p></div>;
    }

    if (loading) return <BrandedLoader message="Loading reports…" />;

    const renderRateTable = (rows) => (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
                <tr style={{ background: '#f8fafc' }}>
                    {['Process', 'Name', 'Rate Type', 'Rate (₹)', 'Effective'].map((h) => (
                        <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r._id}>
                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.processName}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.vendorWorker}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{rateLabel(r.rateType)}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>₹{r.defaultRate}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.effectiveDate ? new Date(r.effectiveDate).toLocaleDateString() : '—'}</td>
                    </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 20, color: '#94a3b8' }}>No rates</td></tr>}
            </tbody>
        </table>
    );

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Textile — Process Cost Reports</h1>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>{selectedCompany?.companyName}</p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {tabs.map((t) => (
                    <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{ padding: '6px 12px', borderRadius: 6, border: tab === t.id ? '2px solid #7c3aed' : '1px solid #d1d5db', background: tab === t.id ? '#faf5ff' : '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                {tab === 'vendor' && renderRateTable(vendorRows)}
                {tab === 'worker' && renderRateTable(workerRows)}
                {tab === 'cost' && (
                    <>
                        <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 700 }}>Grand total labour cost: ₹{costData?.grandTotal ?? 0}</div>
                        {(costData?.byProcess || []).length > 0 && (
                            <table style={{ width: '100%', marginBottom: 16, fontSize: 13 }}>
                                <thead><tr style={{ background: '#f8fafc' }}><th style={{ padding: 8, textAlign: 'left' }}>Process</th><th style={{ padding: 8 }}>Entries</th><th style={{ padding: 8, textAlign: 'right' }}>Total (₹)</th></tr></thead>
                                <tbody>
                                    {costData.byProcess.map((p) => (
                                        <tr key={p.processName}><td style={{ padding: 8 }}>{p.processName}</td><td style={{ padding: 8 }}>{p.entries}</td><td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>₹{p.totalCost}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Lot', 'Source', 'Process', 'Vendor/Worker', 'Qty', 'Rate', 'Cost (₹)'].map((h) => (
                                        <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(costData?.rows || []).map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.lotNo}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.source}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.processName}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.vendorWorker}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{r.quantity}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>₹{r.rateApplied}</td>
                                        <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>₹{r.labourCost}</td>
                                    </tr>
                                ))}
                                {(costData?.rows || []).length === 0 && <tr><td colSpan={7} style={{ padding: 20, color: '#94a3b8' }}>No process costs recorded yet</td></tr>}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        </div>
    );
}
