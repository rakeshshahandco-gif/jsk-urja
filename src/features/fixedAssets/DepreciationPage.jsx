import { useState } from 'react';
import { Search, Play, History, Calendar } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

const DepreciationPage = () => {
    const [tab, setTab] = useState('preview');
    const [period, setPeriod] = useState({ periodStart: firstOfMonth(), periodEnd: today() });
    const [preview, setPreview] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);

    const loadPreview = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/depreciation/preview', { params: period });
            setPreview(res.data?.data?.assets || res.data?.data || []);
            setTab('preview');
        } catch { toast.error('Failed to load preview'); }
        finally { setLoading(false); }
    };

    const loadHistory = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/depreciation/history');
            setHistory(res.data?.data?.runs || res.data?.data || []);
            setTab('history');
        } catch { toast.error('Failed to load history'); }
        finally { setLoading(false); }
    };

    const runDepreciation = async () => {
        if (!window.confirm(`Run depreciation for ${period.periodStart} to ${period.periodEnd}? This will post vouchers.`)) return;
        setRunning(true);
        try {
            await axiosInstance.post('/depreciation/run', period);
            toast.success('Depreciation run complete. Vouchers posted.');
            loadHistory();
        } catch (err) { toast.error(err?.response?.data?.message || 'Run failed'); }
        finally { setRunning(false); }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Calendar className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Depreciation</h1>
                </div>
            </div>

            <div className="flex gap-2 mb-5">
                <button onClick={() => setTab('preview')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'preview' ? 'bg-blue-600 text-white' : 'border text-slate-600 hover:bg-slate-50'}`}>
                    <Search size={14} className="inline mr-1" /> Preview
                </button>
                <button onClick={loadHistory} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'history' ? 'bg-blue-600 text-white' : 'border text-slate-600 hover:bg-slate-50'}`}>
                    <History size={14} className="inline mr-1" /> Run History
                </button>
            </div>

            {tab === 'preview' && (
                <>
                    <div className="bg-white rounded-xl border p-4 mb-5 flex flex-wrap gap-4 items-end">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Period Start</label>
                            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={period.periodStart} onChange={e => setPeriod(p => ({ ...p, periodStart: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Period End</label>
                            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={period.periodEnd} onChange={e => setPeriod(p => ({ ...p, periodEnd: e.target.value }))} />
                        </div>
                        <button onClick={loadPreview} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                            <Search size={15} /> Preview
                        </button>
                        {preview.length > 0 && (
                            <button onClick={runDepreciation} disabled={running} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                <Play size={15} /> {running ? 'Running...' : 'Run & Post'}
                            </button>
                        )}
                    </div>

                    {loading ? <BrandedLoader /> : (
                        <div className="bg-white rounded-xl border overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Asset</th>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Method</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Book Value</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Rate %</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Depreciation</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Closing BV</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">Click Preview to load assets</td></tr>}
                                    {preview.map((row, i) => (
                                        <tr key={i} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.assetName}</td>
                                            <td className="px-4 py-3 text-slate-500">{row.method}</td>
                                            <td className="px-4 py-3 text-right">₹{fmt(row.openingBV)}</td>
                                            <td className="px-4 py-3 text-right">{row.rate}%</td>
                                            <td className="px-4 py-3 text-right text-red-600 font-medium">₹{fmt(row.depreciation)}</td>
                                            <td className="px-4 py-3 text-right font-semibold">₹{fmt(row.closingBV)}</td>
                                        </tr>
                                    ))}
                                    {preview.length > 0 && (
                                        <tr className="bg-slate-800 text-white font-semibold">
                                            <td className="px-4 py-3" colSpan={4}>Total Depreciation</td>
                                            <td className="px-4 py-3 text-right">₹{fmt(preview.reduce((s, r) => s + (r.depreciation || 0), 0))}</td>
                                            <td></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {tab === 'history' && (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    {loading ? <div className="p-6"><BrandedLoader /></div> : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">Run Date</th>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">Period</th>
                                    <th className="text-right px-4 py-3 text-slate-600 font-medium">Assets</th>
                                    <th className="text-right px-4 py-3 text-slate-600 font-medium">Total Dep.</th>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">Run By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No depreciation runs recorded</td></tr>}
                                {history.map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-600">{row.runDate ? new Date(row.runDate).toLocaleDateString('en-IN') : '—'}</td>
                                        <td className="px-4 py-3 text-slate-500">{row.periodStart} 뿯↽ {row.periodEnd}</td>
                                        <td className="px-4 py-3 text-right">{row.assetCount}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-red-600">₹{fmt(row.totalDepreciation)}</td>
                                        <td className="px-4 py-3 text-slate-500">{row.runBy || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

export default DepreciationPage;
