import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ReceiptText, LayoutDashboard, BookOpen, ListChecks, FileText, BarChart2 } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { apiClient as axiosInstance } from '@/lib/apiClient';
import { PATHS } from '@/routes/paths';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const NAV_TABS = [
    { key: 'dashboard', label: 'Dashboard', path: PATHS.TCS.DASHBOARD, icon: LayoutDashboard },
    { key: 'master', label: 'Section Rates', path: PATHS.TCS.MASTER, icon: BookOpen },
    { key: 'deductions', label: 'Deduction Register', path: PATHS.TCS.DEDUCTIONS, icon: ListChecks },
    { key: 'challans', label: 'Challan / Payment', path: PATHS.TCS.CHALLANS, icon: ReceiptText },
    { key: 'reports', label: 'Reports', path: PATHS.TCS.REPORTS, icon: BarChart2 },
];

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
const DashboardTab = ({ fy }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get('/tcs/dashboard', { params: { financialYear: fy } })
            .then(r => setData(r.data?.data))
            .catch(() => toast.error('Load failed'))
            .finally(() => setLoading(false));
    }, [fy]);
    if (loading) return <BrandedLoader />;
    const cards = [
        { label: 'Total TCS Collected', value: `₹${fmt(data?.totalDeducted)}`, color: 'bg-blue-50 text-blue-700' },
        { label: 'Total Paid (Remitted)', value: `₹${fmt(data?.totalPaid)}`, color: 'bg-green-50 text-green-700' },
        { label: 'Pending Payment', value: `₹${fmt(data?.pendingPayment)}`, color: 'bg-yellow-50 text-yellow-700' },
        { label: 'Deductions (This Month)', value: data?.deductionsThisMonth ?? 0, color: 'bg-purple-50 text-purple-700' },
    ];
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {cards.map(c => (
                <div key={c.label} className={`rounded-xl p-4 ${c.color}`}>
                    <p className="text-xs font-medium opacity-70 mb-1">{c.label}</p>
                    <p className="text-2xl font-bold">{c.value}</p>
                </div>
            ))}
        </div>
    );
};

// ── Sections Master Tab ────────────────────────────────────────────────────────
const SectionsMasterTab = ({ fy }) => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get('/tcs/master/sections').then(r => setList(r.data?.data || [])).catch(() => toast.error('Load failed')).finally(() => setLoading(false));
    }, [fy]);
    if (loading) return <BrandedLoader />;
    return (
        <div className="mt-4 bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Section</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Description</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Rate %</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Threshold</th>
                    </tr>
                </thead>
                <tbody>
                    {list.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-slate-400">No TCS sections configured</td></tr>}
                    {list.map(row => (
                        <tr key={row._id} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono font-semibold text-blue-700">{row.sectionCode}</td>
                            <td className="px-4 py-3 text-slate-700">{row.description}</td>
                            <td className="px-4 py-3 text-right">{row.rate}%</td>
                            <td className="px-4 py-3 text-right">₹{fmt(row.thresholdAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ── Deductions Tab ─────────────────────────────────────────────────────────────
const DeductionsTab = ({ fy }) => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get('/tcs/deductions', { params: { financialYear: fy } })
            .then(r => setList(r.data?.data || []))
            .catch(() => toast.error('Load failed'))
            .finally(() => setLoading(false));
    }, [fy]);
    if (loading) return <BrandedLoader />;
    return (
        <div className="mt-4 bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Date</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Buyer</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Section</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Sale Amount</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">TCS Amount</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {list.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">No TCS deductions recorded</td></tr>}
                    {list.map(row => (
                        <tr key={row._id} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-500">{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '—'}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{row.buyerName || row.buyerId}</td>
                            <td className="px-4 py-3 font-mono text-blue-700">{row.sectionCode}</td>
                            <td className="px-4 py-3 text-right">₹{fmt(row.saleAmount)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-green-700">₹{fmt(row.tcsAmount)}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.status === 'Remitted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{row.status || 'Pending'}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ── Challans Tab ───────────────────────────────────────────────────────────────
const ChallansTab = ({ fy }) => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get('/tcs/challans', { params: { financialYear: fy } })
            .then(r => setList(r.data?.data || []))
            .catch(() => toast.error('Load failed'))
            .finally(() => setLoading(false));
    }, [fy]);
    if (loading) return <BrandedLoader />;
    return (
        <div className="mt-4 bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Challan No</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Quarter</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Due Date</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Amount</th>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {list.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No challans recorded</td></tr>}
                    {list.map(row => (
                        <tr key={row._id} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">{row.challanNo || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.quarter}</td>
                            <td className="px-4 py-3 text-slate-500">{row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{fmt(row.totalAmount)}</td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{row.status || 'Pending'}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ── Reports Tab ────────────────────────────────────────────────────────────────
const ReportsTab = ({ fy }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        axiosInstance.get('/tcs/reports/quarterly-summary', { params: { financialYear: fy } })
            .then(r => {
                const raw = r.data?.data || [];
                // Aggregate by quarter (backend may return per-section rows)
                const byQ = {};
                raw.forEach(r => {
                    const q = r.quarter || 'Unknown';
                    if (!byQ[q]) byQ[q] = { quarter: q, count: 0, tcsAmount: 0 };
                    byQ[q].count += r.count || 0;
                    byQ[q].tcsAmount += r.totalTcs || r.tcsAmount || 0;
                });
                setRows(Object.values(byQ).sort((a, b) => a.quarter.localeCompare(b.quarter)));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [fy]);
    if (loading) return <BrandedLoader />;
    return (
        <div className="mt-4 bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50"><h3 className="font-semibold text-slate-700 text-sm">Quarterly TCS Summary — {fy}</h3></div>
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Quarter</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Deductions</th>
                        <th className="text-right px-4 py-3 text-slate-600 font-medium">TCS Collected</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400">No quarterly data — add TCS deductions to see summary</td></tr>}
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">{row.quarter}</td>
                            <td className="px-4 py-3 text-right">{row.count}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{fmt(row.tcsAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const TcsCompliancePage = () => {
    const location = useLocation();
    const { selectedFY } = useFinancialYear();
    const fy = selectedFY || '2025-2026';
    const activeKey = NAV_TABS.find(t => location.pathname.startsWith(t.path))?.key || 'dashboard';

    const tabProps = { fy };
    const ActiveComponent = { dashboard: DashboardTab, master: SectionsMasterTab, deductions: DeductionsTab, challans: ChallansTab, reports: ReportsTab }[activeKey] || DashboardTab;

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <ReceiptText className="text-blue-600" size={24} />
                <h1 className="text-xl font-bold text-slate-800">TCS — Tax Collected at Source</h1>
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{fy}</span>
            </div>

            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
                {NAV_TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <a key={tab.key} href={tab.path} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeKey === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}>
                            <Icon size={14} /> {tab.label}
                        </a>
                    );
                })}
            </div>

            <ActiveComponent {...tabProps} />
        </div>
    );
};

export default TcsCompliancePage;
