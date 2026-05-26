import { useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useFYDateRange } from '@/contexts/FinancialYearContext';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const FundFlowPage = () => {
    const fyDateRange = useFYDateRange();
    const [filters, setFilters] = useState({ startDate: fyDateRange.startDate, endDate: fyDateRange.endDate });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/fund-flow', { params: filters });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load fund flow statement');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <ArrowUpDown className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Fund Flow Statement</h1>
                    <FYBadge />
                </div>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Backend: { sourcesOfFunds: [{name, amount}], useOfFunds: [{name, amount}], totalSources, totalUse, netChangeInWorkingCapital } */}
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 bg-green-600 text-white font-semibold text-sm">Sources of Funds</div>
                        <table className="w-full text-sm">
                            <tbody>
                                {(data.sourcesOfFunds || []).map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-2.5 text-slate-700">{row.name}</td>
                                        <td className="px-4 py-2.5 text-right font-medium text-green-700">₹{fmt(row.amount)}</td>
                                    </tr>
                                ))}
                                {(!data.sourcesOfFunds || data.sourcesOfFunds.length === 0) && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">No fund sources in this period</td></tr>}
                            </tbody>
                            <tfoot className="bg-green-50">
                                <tr>
                                    <td className="px-4 py-3 font-bold text-green-800">Total Sources</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-800">₹{fmt(data.totalSources)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 bg-red-600 text-white font-semibold text-sm">Application of Funds</div>
                        <table className="w-full text-sm">
                            <tbody>
                                {(data.useOfFunds || []).map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-2.5 text-slate-700">{row.name}</td>
                                        <td className="px-4 py-2.5 text-right font-medium text-red-600">₹{fmt(row.amount)}</td>
                                    </tr>
                                ))}
                                {(!data.useOfFunds || data.useOfFunds.length === 0) && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">No fund applications in this period</td></tr>}
                            </tbody>
                            <tfoot className="bg-red-50">
                                <tr>
                                    <td className="px-4 py-3 font-bold text-red-800">Total Application</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-800">₹{fmt(data.totalUse)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="md:col-span-2 bg-slate-800 text-white rounded-xl p-4 flex justify-between items-center">
                        <span className="font-bold">Net Change in Working Capital</span>
                        <span className={`text-xl font-bold ${(data.netChangeInWorkingCapital || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>₹{fmt(data.netChangeInWorkingCapital || 0)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FundFlowPage;
