import { useState } from 'react';
import { Search, BarChart2 } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const today = () => new Date().toISOString().split('T')[0];

const RATIO_GROUPS = [
    { key: 'liquidity', label: 'Liquidity Ratios', color: 'bg-blue-50 text-blue-800' },
    { key: 'profitability', label: 'Profitability Ratios', color: 'bg-green-50 text-green-800' },
    { key: 'solvency', label: 'Solvency Ratios', color: 'bg-purple-50 text-purple-800' },
    { key: 'efficiency', label: 'Efficiency Ratios', color: 'bg-orange-50 text-orange-800' },
];

const RatioAnalysisPage = () => {
    const [date, setDate] = useState(today());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/ratio-analysis', { params: { date } });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load ratio analysis');
        } finally {
            setLoading(false);
        }
    };

    const fmt2 = (n) => n != null ? Number(n).toFixed(2) : '—';

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <BarChart2 className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Financial Ratio Analysis</h1>
                    <FYBadge />
                </div>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">As on Date</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Calculate
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {RATIO_GROUPS.map(grp => {
                        // Backend returns { ratios: { liquidity, profitability, solvency } }
                        const ratios = data.ratios?.[grp.key] || {};
                        return (
                            <div key={grp.key} className="bg-white rounded-xl border overflow-hidden">
                                <div className={`px-4 py-3 font-semibold text-sm ${grp.color}`}>{grp.label}</div>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {Object.entries(ratios).map(([name, value]) => (
                                            <tr key={name} className="border-b hover:bg-slate-50">
                                                <td className="px-4 py-2.5 text-slate-700">{name}</td>
                                                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmt2(value)}</td>
                                            </tr>
                                        ))}
                                        {Object.keys(ratios).length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-400 text-xs">Insufficient data</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RatioAnalysisPage;
