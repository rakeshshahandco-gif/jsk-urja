import { useState, useEffect } from 'react';
import { Plus, Edit2, TrendingUp } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const BudgetPage = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [vsActual, setVsActual] = useState(null);
    const [vaLoading, setVaLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', financialYear: '', period: 'Annual' });

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/budgets');
            setList(res.data?.data?.budgets || res.data?.data || []);
        } catch { toast.error('Failed to load budgets'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const loadVsActual = async (budget) => {
        setSelected(budget);
        setVaLoading(true);
        try {
            const res = await axiosInstance.get(`/budgets/${budget._id}/vs-actual`);
            setVsActual(res.data?.data);
        } catch { toast.error('Failed to load vs-actual'); }
        finally { setVaLoading(false); }
    };

    const save = async () => {
        if (!form.name.trim() || !form.financialYear.trim()) return toast.error('Name and FY are required');
        try {
            await axiosInstance.post('/budgets', form);
            toast.success('Budget created');
            setShowForm(false);
            load();
        } catch (err) { toast.error(err?.response?.data?.message || 'Save failed'); }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <TrendingUp className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Budget Master</h1>
                </div>
                <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Plus size={16} /> New Budget
                </button>
            </div>

            {showForm && (
                <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm max-w-lg">
                    <h2 className="font-semibold text-slate-700 mb-4">New Budget</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Budget Name *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Financial Year * (e.g. 2025-2026)</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2025-2026" value={form.financialYear} onChange={e => setForm(p => ({ ...p, financialYear: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Period</label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}>
                                <option>Annual</option>
                                <option>Monthly</option>
                                <option>Quarterly</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                        <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-xl border overflow-hidden">
                    {loading ? <div className="p-6"><BrandedLoader /></div> : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">Budget</th>
                                    <th className="text-left px-4 py-3 text-slate-600 font-medium">FY</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400">No budgets yet</td></tr>}
                                {list.map(row => (
                                    <tr key={row._id} className={`border-b hover:bg-slate-50 cursor-pointer ${selected?._id === row._id ? 'bg-blue-50' : ''}`} onClick={() => loadVsActual(row)}>
                                        <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{row.financialYear}</td>
                                        <td className="px-4 py-3 text-right"><TrendingUp size={14} className="text-blue-400" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {selected && (
                    <div className="lg:col-span-2 bg-white rounded-xl border overflow-x-auto">
                        <div className="px-4 py-3 border-b bg-slate-50">
                            <h3 className="font-semibold text-slate-700 text-sm">{selected.name} — Budget vs Actual</h3>
                        </div>
                        {vaLoading ? <div className="p-6"><BrandedLoader /></div> : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-600 font-medium">Ledger</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Budgeted</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Actual</th>
                                        <th className="text-right px-4 py-3 text-slate-600 font-medium">Variance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!vsActual?.lines || vsActual.lines.length === 0) && <tr><td colSpan={4} className="text-center py-8 text-slate-400">No line items in this budget</td></tr>}
                                    {vsActual?.lines?.map((ln, i) => {
                                        const variance = (ln.budgetAmount || 0) - (ln.actual || 0);
                                        return (
                                            <tr key={i} className="border-b hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-700">{ln.ledgerName || ln.ledgerId}</td>
                                                <td className="px-4 py-3 text-right">₹{fmt(ln.budgetAmount)}</td>
                                                <td className="px-4 py-3 text-right">₹{fmt(ln.actual)}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                                    {variance >= 0 ? '+' : ''}₹{fmt(variance)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BudgetPage;
