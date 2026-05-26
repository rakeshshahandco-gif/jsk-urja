import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { toast } from 'react-hot-toast';
import { BrandedLoader, Button } from '@/components/ui';
import { gpAnalysisApi } from '@/services/gpAnalysisApi';

const tabs = [
    ['product', 'Product-wise'],
    ['customer', 'Customer-wise'],
    ['invoice', 'Invoice-wise'],
    ['negative', 'Negative GP'],
    ['export', 'Export vs Domestic'],
    ['high', 'High margin'],
    ['low', 'Low margin'],
    ['exceptions', 'Cost exceptions'],
];

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function SimpleTable({ rows }) {
    if (!rows?.length) return <p style={{ color: '#64748b', padding: 16 }}>No data for selected filters.</p>;
    const keys = Object.keys(rows[0]).filter((k) => !k.startsWith('_'));
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                        {keys.map((k) => (
                            <th key={k} style={{ padding: '8px 10px', borderBottom: '2px solid #e2e8f0' }}>{k}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {keys.map((k) => (
                                <td key={k} style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                    {typeof r[k] === 'number' ? fmt(r[k]) : String(r[k] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function GpAnalysisPage() {
    const [tab, setTab] = useState('product');
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [filters, setFilters] = useState({
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().endOf('month').format('YYYY-MM-DD'),
    });

    useEffect(() => {
        setLoading(true);
        const params = { startDate: filters.startDate, endDate: filters.endDate };
        const run = async () => {
            try {
                if (tab === 'export') {
                    const data = await gpAnalysisApi.getExportDomestic(params);
                    setSummary(data);
                    setRows([]);
                } else {
                    setSummary(null);
                    const loaders = {
                        product: gpAnalysisApi.getProductReport,
                        customer: gpAnalysisApi.getCustomerReport,
                        invoice: gpAnalysisApi.getInvoiceReport,
                        negative: gpAnalysisApi.getNegativeGpReport,
                        high: gpAnalysisApi.getHighMargin,
                        low: gpAnalysisApi.getLowMargin,
                        exceptions: gpAnalysisApi.getCostExceptions,
                    };
                    const data = await loaders[tab](params);
                    setRows(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                toast.error(e.response?.data?.message || 'Failed to load GP report');
                setRows([]);
                setSummary(null);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [tab, filters.startDate, filters.endDate]);

    return (
        <div style={{ padding: 24, background: '#f1f5f9', minHeight: '100vh' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800 }}>GP Analysis</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b' }}>
                Cost priority: Actual FG production → BOM standard → Manual → Valuation. GP uses taxable value (excludes GST).
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
                <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {tabs.map(([k, label]) => (
                    <Button key={k} variant={tab === k ? 'primary' : 'outline'} size="sm" onClick={() => setTab(k)}>
                        {label}
                    </Button>
                ))}
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {loading ? <BrandedLoader /> : tab === 'export' && summary ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {['export', 'domestic'].map((k) => (
                            <div key={k} style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                                <h3 style={{ margin: '0 0 8px', textTransform: 'capitalize' }}>{k}</h3>
                                <p>Sales: {fmt(summary[k]?.salesValue)}</p>
                                <p>Cost: {fmt(summary[k]?.costValue)}</p>
                                <p>GP: {fmt(summary[k]?.gpAmount)} ({fmt(summary[k]?.gpPercent)}%)</p>
                                <p>Invoices: {summary[k]?.invoiceCount ?? 0}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <SimpleTable rows={rows} />
                )}
            </div>
        </div>
    );
}
