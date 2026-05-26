import { useState } from 'react';
import { Search, ArrowLeftRight } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const thisYear = new Date().getFullYear();

const ComparativePLPage = () => {
    const [filters, setFilters] = useState({
        startDate1: `${thisYear - 1}-04-01`, endDate1: `${thisYear - 1}-03-31`,
        startDate2: `${thisYear}-04-01`, endDate2: `${thisYear}-03-31`,
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/comparative-pl', { params: filters });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load comparative P&L');
        } finally {
            setLoading(false);
        }
    };

    // Backend returns { comparison: [{ groupName, nature, period1, period2, variance, variancePct }] }
    const rows = (data?.comparison || []).map(r => ({
        ...r,
        label: r.groupName,
        isHeader: false,
    }));

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <ArrowLeftRight className="text-blue-600" size={24} />
                <h1 className="text-xl font-bold text-slate-800">Comparative Profit & Loss</h1>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Period 1 From</label>
                        <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={filters.startDate1} onChange={e => setFilters(p => ({ ...p, startDate1: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Period 1 To</label>
                        <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={filters.endDate1} onChange={e => setFilters(p => ({ ...p, endDate1: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Period 2 From</label>
                        <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={filters.startDate2} onChange={e => setFilters(p => ({ ...p, startDate2: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Period 2 To</label>
                        <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={filters.endDate2} onChange={e => setFilters(p => ({ ...p, endDate2: e.target.value }))} />
                    </div>
                    <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 h-[38px]">
                        <Search size={15} /> Compare
                    </button>
                </div>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Particulars</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">{filters.startDate1} to {filters.endDate1}</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">{filters.startDate2} to {filters.endDate2}</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Change</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Change %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No data available</td></tr>}
                            {rows.map((row, i) => {
                                const change = row.variance ?? ((row.period2 || 0) - (row.period1 || 0));
                                const pct = row.variancePct != null ? row.variancePct : (row.period1 ? ((change / row.period1) * 100).toFixed(1) : null);
                                return (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-2.5 text-slate-700 font-medium">{row.label}</td>
                                        <td className="px-4 py-2.5 text-right">₹{fmt(row.period1)}</td>
                                        <td className="px-4 py-2.5 text-right">₹{fmt(row.period2)}</td>
                                        <td className={`px-4 py-2.5 text-right ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>{change >= 0 ? '+' : ''}₹{fmt(Math.abs(change))}</td>
                                        <td className={`px-4 py-2.5 text-right ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct != null ? `${pct}%` : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ComparativePLPage;
