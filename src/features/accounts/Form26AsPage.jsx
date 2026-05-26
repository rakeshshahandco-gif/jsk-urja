import { useState, useEffect } from 'react';
import { Upload, RefreshCw, CheckCircle, AlertCircle, FileSearch } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const Form26AsPage = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [reconLoading, setReconLoading] = useState(false);
    const [importForm, setImportForm] = useState({ financialYear: '', pan: '', entries: [] });
    const [showImport, setShowImport] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/form-26as');
            setList(res.data?.data?.records || res.data?.data || []);
        } catch { toast.error('Failed to load 26AS records'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const runRecon = async (id) => {
        setReconLoading(true);
        try {
            const res = await axiosInstance.post(`/form-26as/${id}/reconcile`);
            setSelected(res.data?.data);
            toast.success('Reconciliation complete');
            load();
        } catch { toast.error('Reconciliation failed'); }
        finally { setReconLoading(false); }
    };

    const doImport = async () => {
        if (!importForm.financialYear || !importForm.pan) return toast.error('FY and PAN are required');
        try {
            await axiosInstance.post('/form-26as/import', importForm);
            toast.success('26AS data imported');
            setShowImport(false);
            load();
        } catch (err) { toast.error(err?.response?.data?.message || 'Import failed'); }
    };

    const lines = selected?.lines || [];
    const reconSummary = selected?.reconSummary || {};

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <FileSearch className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">26AS Reconciliation</h1>
                </div>
                <button onClick={() => setShowImport(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Upload size={16} /> Import 26AS
                </button>
            </div>

            {showImport && (
                <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm max-w-lg">
                    <h2 className="font-semibold text-slate-700 mb-4">Import Form 26AS Data</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Financial Year *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2025-2026" value={importForm.financialYear} onChange={e => setImportForm(p => ({ ...p, financialYear: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">PAN *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm uppercase" value={importForm.pan} onChange={e => setImportForm(p => ({ ...p, pan: e.target.value }))} />
                        </div>
                        <div className="col-span-2 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                            Paste your 26AS deduction entries in JSON format, or use the API to upload. Manual entry via this form creates a blank record for reconciliation.
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={doImport} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Import</button>
                        <button onClick={() => setShowImport(false)} className="border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-xl border overflow-hidden">
                    {loading ? <div className="p-4"><BrandedLoader /></div> : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">FY</th>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">PAN</th>
                                    <th className="text-right px-4 py-3 text-slate-600 font-medium">Lines</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400">No 26AS imports yet</td></tr>}
                                {list.map(row => (
                                    <tr key={row._id} className={`border-b cursor-pointer hover:bg-slate-50 ${selected?._id === row._id ? 'bg-blue-50' : ''}`} onClick={() => setSelected(row)}>
                                        <td className="px-4 py-3 font-medium text-slate-800">{row.financialYear}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.pan}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{row.lines?.length || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {selected && (
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white rounded-xl border p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">26AS — FY {selected.financialYear} | PAN: {selected.pan}</p>
                                <div className="flex gap-4 text-sm">
                                    <span className="text-green-700"><CheckCircle size={14} className="inline mr-1" />{reconSummary.matched || 0} Matched</span>
                                    <span className="text-red-600"><AlertCircle size={14} className="inline mr-1" />{reconSummary.unmatched || 0} Unmatched</span>
                                </div>
                            </div>
                            <button onClick={() => runRecon(selected._id)} disabled={reconLoading} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                                <RefreshCw size={14} className={reconLoading ? 'animate-spin' : ''} /> Reconcile
                            </button>
                        </div>

                        {reconLoading ? <BrandedLoader /> : (
                            <div className="bg-white rounded-xl border overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-slate-600 font-medium">Deductor</th>
                                            <th className="text-left px-4 py-3 text-slate-600 font-medium">Section</th>
                                            <th className="text-right px-4 py-3 text-slate-600 font-medium">TDS (26AS)</th>
                                            <th className="text-right px-4 py-3 text-slate-600 font-medium">TDS (Books)</th>
                                            <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No lines in this import</td></tr>}
                                        {lines.map((ln, i) => (
                                            <tr key={i} className="border-b hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-700">{ln.deductorName || ln.deductorTan}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-blue-700">{ln.section}</td>
                                                <td className="px-4 py-3 text-right">₹{fmt(ln.tdsAmount26As)}</td>
                                                <td className="px-4 py-3 text-right">₹{fmt(ln.tdsAmountBooks)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ln.status === 'Matched' ? 'bg-green-100 text-green-700' : ln.status === 'Excess in 26AS' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                                                        {ln.status || 'Pending'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Form26AsPage;
