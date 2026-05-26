import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { toast } from 'react-hot-toast';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { PATHS } from '@/routes/paths';
import directorMisApi from '@/services/directorMisApi';
import s from './DirectorMisDashboard.module.scss';

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' });

const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`;

const CHART_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981'];

const DRILLDOWN = {
    receivables: PATHS.ACCOUNTS.OUTSTANDING_REPORT,
    payables: `${PATHS.ACCOUNTS.OUTSTANDING_REPORT}?type=Payable`,
    'trial-balance': '/mis/reports/trial-balance',
    'negative-gp': `${PATHS.MIS.GP_ANALYSIS}?tab=negative`,
    'gst-payable': PATHS.GST.PAYABLE,
    'tds-challans': PATHS.TDS.CHALLANS,
    'bank-recon': PATHS.ACCOUNTS.BANK_RECONCILIATION,
    inventory: PATHS.INVENTORY.ITEMS,
    vouchers: PATHS.ACCOUNTS.VOUCHER_LIST,
    'outstanding-payable': `${PATHS.ACCOUNTS.OUTSTANDING_REPORT}?type=Payable`,
    gp: PATHS.MIS.GP_ANALYSIS,
    sales: PATHS.ACCOUNTS.SALES_REGISTER,
    production: PATHS.PRODUCTION.WORK_ORDERS,
};

function MetricCard({ label, value, sub, onClick, className = '' }) {
    return (
        <div className={s.card} onClick={onClick} role={onClick ? 'button' : undefined}>
            <div className={s.cardLabel}>{label}</div>
            <div className={`${s.cardValue} ${className}`}>{value}</div>
            {sub && <div className={s.cardSub}>{sub}</div>}
        </div>
    );
}

function MiniTable({ rows, columns }) {
    if (!rows?.length) return <p style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>No records</p>;
    return (
        <div className={s.tableWrap}>
            <table>
                <thead>
                    <tr>
                        {columns.map((c) => (
                            <th key={c.key}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            {columns.map((c) => (
                                <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function DirectorMisDashboard() {
    const navigate = useNavigate();
    const { selectedFY } = useFinancialYear();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [filters, setFilters] = useState({
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD'),
        month: moment().format('YYYY-MM'),
        exportFilter: '',
    });

    const go = (key) => {
        const path = DRILLDOWN[key];
        if (path) navigate(path);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await directorMisApi.getDashboard({
                financialYear: selectedFY,
                startDate: filters.startDate,
                endDate: filters.endDate,
                month: filters.month,
                exportFilter: filters.exportFilter || undefined,
            });
            setData(res);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load Director MIS');
        } finally {
            setLoading(false);
        }
    }, [selectedFY, filters.startDate, filters.endDate, filters.month, filters.exportFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const ageingChartData = useMemo(() => {
        if (!data?.recovery?.receivableAgeing) return [];
        return Object.entries(data.recovery.receivableAgeing).map(([name, v]) => ({
            name,
            amount: v.amount,
        }));
    }, [data]);

    if (loading && !data) {
        return (
            <div className={s.directorMis}>
                <div className={s.loading}>
                    <div className={s.spinner} />
                    <span>Loading Director MIS…</span>
                </div>
            </div>
        );
    }

    const acc = data?.accounting || {};
    const sales = data?.sales || {};
    const rec = data?.recovery || {};
    const gp = data?.gp || {};
    const gst = data?.gst || {};
    const tds = data?.tds || {};
    const msme = data?.msme || {};
    const inv = data?.inventory || {};
    const prod = data?.production || {};
    const exp = data?.exportMis || {};
    const charts = data?.charts || {};

    return (
        <div className={s.directorMis}>
            <div className={s.header}>
                <h1>Director MIS Dashboard</h1>
                <p>Consolidated business health — accounting, sales, recovery, GST, TDS, inventory, production &amp; GP</p>
            </div>

            <div className={s.filters}>
                <label>
                    From
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                    />
                </label>
                <label>
                    To
                    <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                    />
                </label>
                <label>
                    Month
                    <input
                        type="month"
                        value={filters.month}
                        onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
                    />
                </label>
                <label>
                    Trade
                    <select
                        value={filters.exportFilter}
                        onChange={(e) => setFilters((f) => ({ ...f, exportFilter: e.target.value }))}
                    >
                        <option value="">All</option>
                        <option value="domestic">Domestic</option>
                        <option value="export">Export</option>
                    </select>
                </label>
                <label>
                    FY
                    <input type="text" value={selectedFY || '—'} readOnly style={{ background: '#f8fafc' }} />
                </label>
                <button type="button" className={s.refreshBtn} onClick={load} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            <div className={s.content}>
                {/* Compliance alerts */}
                {data?.compliance?.length > 0 && (
                    <div className={s.section}>
                        <h2 className={s.sectionTitle}>⚠ Compliance Alerts</h2>
                        <div className={s.alertList}>
                            {data.compliance.map((a, i) => (
                                <div
                                    key={i}
                                    className={`${s.alertItem} ${s[a.severity] || s.medium}`}
                                    onClick={() => go(a.drilldown)}
                                >
                                    <strong>{a.type}</strong>
                                    <span>{a.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Accounting */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>Accounting Summary</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Cash Balance" value={fmt(acc.cashBalance)} onClick={() => go('vouchers')} />
                        <MetricCard label="Bank Balance" value={fmt(acc.bankBalance)} onClick={() => go('bank-recon')} />
                        <MetricCard label="Receivables" value={fmt(acc.totalReceivables)} onClick={() => go('receivables')} />
                        <MetricCard label="Payables" value={fmt(acc.totalPayables)} onClick={() => go('payables')} />
                        <MetricCard label="Net Working Capital" value={fmt(acc.netWorkingCapital)} />
                        <MetricCard
                            label="Trial Balance"
                            value={acc.trialBalanceStatus === 'matched' ? 'Matched' : 'Mismatch'}
                            sub={acc.trialBalanceStatus !== 'matched' ? `Diff ${fmt(acc.trialBalanceDiff)}` : ''}
                            className={acc.trialBalanceStatus === 'matched' ? s.positive : s.negative}
                            onClick={() => go('trial-balance')}
                        />
                        <MetricCard label="Month Income" value={fmt(acc.currentMonthIncome)} className={s.positive} />
                        <MetricCard label="Month Expenses" value={fmt(acc.currentMonthExpenses)} />
                        <MetricCard
                            label="Net Profit (Est.)"
                            value={fmt(acc.netProfitEstimate)}
                            className={(acc.netProfitEstimate || 0) >= 0 ? s.positive : s.negative}
                        />
                    </div>
                </div>

                {/* Sales */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>Sales Summary</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Total Sales" value={fmt(sales.totalSales)} onClick={() => go('sales')} />
                        <MetricCard label="Taxable Sales" value={fmt(sales.taxableSales)} />
                        <MetricCard label="Export Sales" value={fmt(sales.exportSales)} />
                        <MetricCard label="Domestic Sales" value={fmt(sales.domesticSales)} />
                        <MetricCard label="Sales Returns" value={fmt(sales.salesReturn)} sub={`${sales.salesReturnCount || 0} notes`} />
                        <MetricCard label="Avg Monthly Sales" value={fmt(sales.averageMonthlySales)} />
                        <MetricCard label="Pending SOs" value={sales.pendingSalesOrders} sub={fmt(sales.orderToInvoicePendingAmount)} />
                    </div>
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <MiniTable
                            rows={sales.topCustomers}
                            columns={[
                                { key: 'customerName', label: 'Top Customers' },
                                { key: 'sales', label: 'Sales', render: (r) => fmt(r.sales) },
                            ]}
                        />
                        <MiniTable
                            rows={sales.topProducts}
                            columns={[
                                { key: 'itemName', label: 'Top Products' },
                                { key: 'sales', label: 'Sales', render: (r) => fmt(r.sales) },
                            ]}
                        />
                    </div>
                </div>

                {/* Recovery */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>Recovery / Outstanding</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Total Debtors" value={fmt(rec.totalDebtors)} onClick={() => go('receivables')} />
                        <MetricCard label="Total Creditors" value={fmt(rec.totalCreditors)} onClick={() => go('payables')} />
                        <MetricCard label="Follow-ups Today" value={rec.followUpDueToday?.length || 0} />
                        <MetricCard label="High Risk Recovery" value={rec.highRiskRecovery?.length || 0} className={s.warn} />
                    </div>
                    <div className={s.chartRow} style={{ marginTop: 12 }}>
                        <div className={s.chartBox}>
                            <div className={s.cardLabel}>Receivable Ageing</div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={ageingChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v) => fmt(v)} />
                                    <Bar dataKey="amount" fill="#0d9488" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <MiniTable
                            rows={rec.overdueCustomers?.slice(0, 8)}
                            columns={[
                                { key: 'ledgerName', label: 'Overdue Customer' },
                                { key: 'outstanding', label: 'Due', render: (r) => fmt(r.outstanding) },
                                { key: 'overdueDays', label: 'Days' },
                            ]}
                        />
                    </div>
                </div>

                {/* GP */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>GP / Profit Analysis</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Total GP" value={fmt(gp.totals?.gpAmount)} onClick={() => go('gp')} />
                        <MetricCard label="GP %" value={fmtPct(gp.totals?.salesValue > 0 ? (gp.totals.gpAmount / gp.totals.salesValue) * 100 : 0)} />
                        <MetricCard label="Export GP %" value={fmtPct(gp.exportProfitPercent)} />
                        <MetricCard label="Domestic GP %" value={fmtPct(gp.domesticProfitPercent)} />
                        <MetricCard label="Negative GP Invoices" value={gp.negativeGpInvoices?.length || 0} className={s.negative} onClick={() => go('negative-gp')} />
                    </div>
                </div>

                {/* GST + TDS row */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>GST &amp; TDS</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Output GST" value={fmt(gst.outputGst)} />
                        <MetricCard label="Input GST" value={fmt(gst.inputGst)} />
                        <MetricCard label="RCM Payable" value={fmt(gst.rcmPayable)} />
                        <MetricCard label="Net GST Payable" value={fmt(gst.netGstPayable)} onClick={() => go('gst-payable')} />
                        <MetricCard label="2A/2B Mismatch" value={gst.mismatch2a2bCount} sub={fmt(gst.mismatch2a2bValue)} />
                        <MetricCard label="GSTR-3B Status" value={gst.gstr3bStatus || '—'} />
                        {!tds.skipped && (
                            <>
                                <MetricCard label="TDS Deducted" value={fmt(tds.tdsDeducted)} />
                                <MetricCard label="TDS Payable" value={fmt(tds.tdsPayable)} onClick={() => go('tds-challans')} />
                                <MetricCard label="Challan Pending" value={tds.challanPending || 0} className={s.warn} />
                                <MetricCard label="PAN Missing" value={tds.panMissingCases || 0} className={s.negative} />
                            </>
                        )}
                    </div>
                </div>

                {/* MSME + Inventory + Production */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>MSME · Inventory · Production</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="MSME Outstanding" value={fmt(msme.msmeSupplierOutstanding)} onClick={() => go('payables')} />
                        <MetricCard label="MSME Due 7 Days" value={fmt(msme.dueWithin7Days)} className={s.warn} />
                        <MetricCard label="MSME Overdue" value={fmt(msme.overdue)} className={s.negative} />
                        <MetricCard label="RM Stock Value" value={fmt(inv.rawMaterialStockValue)} onClick={() => go('inventory')} />
                        <MetricCard label="FG Stock Value" value={fmt(inv.finishedGoodsStockValue)} />
                        <MetricCard label="Negative Stock" value={inv.negativeStockAlerts?.length || 0} className={s.negative} />
                        <MetricCard label="Low Stock Alerts" value={inv.lowStockAlerts?.length || 0} className={s.warn} />
                        <MetricCard label="Open Work Orders" value={prod.workOrdersOpen} onClick={() => go('production')} />
                        <MetricCard label="WO Completed" value={prod.workOrdersCompleted} />
                        <MetricCard label="Pending Prod Qty" value={prod.pendingProductionQty} />
                        <MetricCard label="Production Delays" value={prod.productionDelayAlerts?.length || 0} className={s.warn} />
                    </div>
                </div>

                {/* Export MIS */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>Export MIS</h2>
                    <div className={s.cardGrid}>
                        <MetricCard label="Export Sales" value={fmt(exp.exportSales)} />
                        <MetricCard label="Export Profit" value={fmt(exp.exportProfit)} className={s.positive} />
                        <MetricCard label="Export GP %" value={fmtPct(exp.exportGpPercent)} />
                        <MetricCard label="Export Proof Pending" value={exp.lutExportPendingProof} className={s.warn} />
                        <MetricCard label="GST Risk (Export)" value={fmt(exp.differentialGstRisk)} />
                    </div>
                </div>

                {/* Charts */}
                <div className={s.section}>
                    <h2 className={s.sectionTitle}>Trends &amp; Charts</h2>
                    <div className={s.chartRow}>
                        <div className={s.chartBox}>
                            <div className={s.cardLabel}>Monthly Sales Trend</div>
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={charts.monthlySalesTrend || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => fmt(v)} />
                                    <Legend />
                                    <Line type="monotone" dataKey="sales" stroke="#0d9488" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="exportSales" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="domesticSales" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className={s.chartBox}>
                            <div className={s.cardLabel}>Monthly GP Trend</div>
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={charts.monthlyGpTrend || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="gpAmount" name="GP ₹" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="gpPercent" name="GP %" stroke="#10b981" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className={s.chartRow} style={{ marginTop: 16 }}>
                        <div className={s.chartBox}>
                            <div className={s.cardLabel}>Product-wise GP (Top 8)</div>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={charts.productWiseGp || []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => fmt(v)} />
                                    <Bar dataKey="gp" fill="#0d9488" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className={s.chartBox}>
                            <div className={s.cardLabel}>Export vs Domestic</div>
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie
                                        data={charts.exportVsDomestic || []}
                                        dataKey="sales"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {(charts.exportVsDomestic || []).map((_, i) => (
                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v) => fmt(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {data?.generatedAt && (
                    <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                        Generated {moment(data.generatedAt).format('DD MMM YYYY, HH:mm')}
                    </p>
                )}
            </div>
        </div>
    );
}
