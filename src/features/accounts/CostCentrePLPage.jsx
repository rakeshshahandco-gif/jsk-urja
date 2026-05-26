import { useState } from 'react';
import { BarChart2, Search } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const CostCentrePLPage = () => {
    const fyDateRange = useFYDateRange();
    const [filters, setFilters] = useState({ startDate: fyDateRange.startDate, endDate: fyDateRange.endDate });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/cost-centers/pl-report', { params: filters });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load report');
        } finally {
            setLoading(false);
        }
    };

    const rows = data?.centres || [];

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <BarChart2 className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Cost Centre P&L Report</h1>
                    <FYBadge />
                </div>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">From</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">To</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Generate
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Cost Centre</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Type</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Income</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Expense</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Net P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No data for this period</td></tr>
                            )}
                            {rows.map((row, i) => {
                                const net = (row.income || 0) - (row.expense || 0);
                                return (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                                        <td className="px-4 py-3 text-slate-500">{row.type}</td>
                                        <td className="px-4 py-3 text-right text-green-700">₹{fmt(row.income)}</td>
                                        <td className="px-4 py-3 text-right text-red-600">₹{fmt(row.expense)}</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>₹{fmt(Math.abs(net))} {net >= 0 ? 'Profit' : 'Loss'}</td>
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

export default CostCentrePLPage;
