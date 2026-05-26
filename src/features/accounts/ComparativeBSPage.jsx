import { useState } from 'react';
import { Search, ArrowLeftRight } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const lastYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; };

const ComparativeBSPage = () => {
    const [date1, setDate1] = useState(lastYear());
    const [date2, setDate2] = useState(today());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/accounting/reports/comparative-bs', { params: { date1, date2 } });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load comparative balance sheet');
        } finally {
            setLoading(false);
        }
    };

    // Backend returns { comparison: [{ groupName, nature, date1, date2, variance }] }
    const rows = (data?.comparison || []).map(r => ({
        ...r,
        label: r.groupName,
    }));

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <ArrowLeftRight className="text-blue-600" size={24} />
                <h1 className="text-xl font-bold text-slate-800">Comparative Balance Sheet</h1>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Date 1</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={date1} onChange={e => setDate1(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Date 2</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={date2} onChange={e => setDate2(e.target.value)} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Compare
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Particulars</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">As on {date1}</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">As on {date2}</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-slate-400">No data available</td></tr>}
                            {rows.map((row, i) => {
                                const change = row.variance ?? ((row.date2 || 0) - (row.date1 || 0));
                                return (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-2.5 text-slate-700 font-medium">{row.label}</td>
                                        <td className="px-4 py-2.5 text-right">₹{fmt(row.date1)}</td>
                                        <td className="px-4 py-2.5 text-right">₹{fmt(row.date2)}</td>
                                        <td className={`px-4 py-2.5 text-right ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>{change >= 0 ? '+' : ''}₹{fmt(Math.abs(change))}</td>
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

export default ComparativeBSPage;
