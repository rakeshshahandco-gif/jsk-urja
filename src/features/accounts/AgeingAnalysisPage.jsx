import { useState } from 'react';
import { Search, Clock } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import FYBadge from '@/components/ui/FYBadge';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

const BUCKET_KEYS = ['current', 'days0_30', 'days31_60', 'days61_90', 'days91_180', 'days181_365', 'over365'];
const BUCKET_LABELS = { current: 'Not Yet Due', days0_30: '0–30 days', days31_60: '31–60 days', days61_90: '61–90 days', days91_180: '91–180 days', days181_365: '181–365 days', over365: '>365 days' };
const BUCKET_COLOR = { current: 'text-green-700', days0_30: 'text-slate-700', days31_60: 'text-yellow-600', days61_90: 'text-orange-600', days91_180: 'text-red-500', days181_365: 'text-red-700', over365: 'text-red-900 font-bold' };

const AgeingAnalysisPage = () => {
    const [filters, setFilters] = useState({ type: 'Receivable', asOnDate: today() });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeBucket, setActiveBucket] = useState(null);

    const load = async () => {
        setLoading(true);
        setActiveBucket(null);
        try {
            const res = await axiosInstance.get('/accounting/reports/ageing', { params: filters });
            setData(res.data?.data);
        } catch {
            toast.error('Failed to load ageing analysis');
        } finally {
            setLoading(false);
        }
    };

    const summary = data?.summary || {};
    const buckets = data?.buckets || {};
    const rows = activeBucket ? (buckets[activeBucket] || []) : [];

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Clock className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Ageing Analysis</h1>
                    <FYBadge />
                </div>
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Type</label>
                    <select className="border rounded-lg px-3 py-2 text-sm" value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
                        <option>Receivable</option>
                        <option>Payable</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">As on Date</label>
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.asOnDate} onChange={e => setFilters(p => ({ ...p, asOnDate: e.target.value }))} />
                </div>
                <button onClick={load} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Generate
                </button>
            </div>

            {loading ? <BrandedLoader /> : data && (
                <>
                    {/* Summary tiles — click to drill down */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
                        {BUCKET_KEYS.map(bk => {
                            const amt = summary[bk === 'days0_30' ? '0-30' : bk === 'days31_60' ? '31-60' : bk === 'days61_90' ? '61-90' : bk === 'days91_180' ? '91-180' : bk === 'days181_365' ? '181-365' : bk === 'over365' ? 'over365' : 'current'] || 0;
                            const count = (buckets[bk] || []).length;
                            const isActive = activeBucket === bk;
                            return (
                                <button
                                    key={bk}
                                    onClick={() => setActiveBucket(activeBucket === bk ? null : bk)}
                                    className={`rounded-xl p-3 text-left border transition-all ${isActive ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-white hover:border-slate-200'} shadow-sm`}
                                >
                                    <p className={`text-xs font-medium mb-1 ${BUCKET_COLOR[bk]}`}>{BUCKET_LABELS[bk]}</p>
                                    <p className="text-lg font-bold text-slate-800">₹{fmt(amt)}</p>
                                    <p className="text-xs text-slate-400">{count} bill{count !== 1 ? 's' : ''}</p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Total */}
                    <div className="bg-slate-800 text-white rounded-xl px-4 py-3 mb-5 flex justify-between items-center">
                        <span className="font-semibold">Total Outstanding ({filters.type})</span>
                        <span className="text-xl font-bold">₹{fmt(summary.total)}</span>
                    </div>

                    {/* Drill-down detail when a bucket is selected */}
                    {activeBucket && (
                        <div className="bg-white rounded-xl border overflow-x-auto">
                            <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                                <h3 className="font-semibold text-slate-700 text-sm">{BUCKET_LABELS[activeBucket]} — Detail</h3>
                                <button onClick={() => setActiveBucket(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Party</th>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Invoice No</th>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Invoice Date</th>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Due Date</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Days Past</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No records in this bucket</td></tr>}
                                    {rows.map((row, i) => (
                                        <tr key={i} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.partyName}</td>
                                            <td className="px-4 py-3 text-slate-600">{row.invoiceNo}</td>
                                            <td className="px-4 py-3 text-slate-500">{row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString('en-IN') : '—'}</td>
                                            <td className="px-4 py-3 text-slate-500">{row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                                            <td className={`px-4 py-3 text-right font-medium ${row.daysPast > 90 ? 'text-red-600' : row.daysPast > 30 ? 'text-yellow-600' : 'text-slate-700'}`}>{row.daysPast}</td>
                                            <td className="px-4 py-3 text-right font-semibold">₹{fmt(row.outstanding)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AgeingAnalysisPage;
