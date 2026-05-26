import { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const STATUS_COLORS = {
    Pending: 'bg-yellow-100 text-yellow-700',
    Presented: 'bg-blue-100 text-blue-700',
    Cleared: 'bg-green-100 text-green-700',
    Bounced: 'bg-red-100 text-red-600',
    Cancelled: 'bg-slate-100 text-slate-500',
};

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const PDCRegisterPage = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: 'Receivable', partyName: '', chequeNo: '', chequeDate: '', bankName: '', amount: '', narration: '' });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (typeFilter) params.type = typeFilter;
            if (statusFilter) params.status = statusFilter;
            const res = await axiosInstance.get('/pdc-cheques', { params });
            setList(res.data?.data?.cheques || res.data?.data || []);
        } catch { toast.error('Failed to load PDC register'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [typeFilter, statusFilter]);

    const doAction = async (id, action) => {
        try {
            await axiosInstance.post(`/pdc-cheques/${id}/${action}`);
            toast.success(`Cheque ${action}ed`);
            load();
        } catch (err) { toast.error(err?.response?.data?.message || 'Action failed'); }
    };

    const save = async () => {
        if (!form.chequeNo || !form.chequeDate || !form.amount) return toast.error('Cheque No, Date and Amount are required');
        try {
            await axiosInstance.post('/pdc-cheques', form);
            toast.success('PDC entry created');
            setShowForm(false);
            load();
        } catch (err) { toast.error(err?.response?.data?.message || 'Save failed'); }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Clock className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">PDC Register (Post-dated Cheques)</h1>
                </div>
                <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Plus size={16} /> Add PDC
                </button>
            </div>

            {showForm && (
                <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm max-w-2xl">
                    <h2 className="font-semibold text-slate-700 mb-4">New PDC Entry</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Type</label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                                <option>Receivable</option>
                                <option>Payable</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Party Name *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.partyName} onChange={e => setForm(p => ({ ...p, partyName: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Cheque No *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.chequeNo} onChange={e => setForm(p => ({ ...p, chequeNo: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Cheque Date *</label>
                            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.chequeDate} onChange={e => setForm(p => ({ ...p, chequeDate: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Bank Name</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.bankName} onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Amount *</label>
                            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Narration</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                        <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border p-3 mb-4 flex gap-4">
                <select className="border rounded-lg px-3 py-2 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    <option>Receivable</option>
                    <option>Payable</option>
                </select>
                <select className="border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option>Pending</option>
                    <option>Presented</option>
                    <option>Cleared</option>
                    <option>Bounced</option>
                    <option>Cancelled</option>
                </select>
            </div>

            {loading ? <BrandedLoader /> : (
                <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Party</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Cheque No</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Date</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Bank</th>
                                <th className="text-right px-4 py-3 text-slate-600 font-medium">Amount</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Type</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                                <th className="px-4 py-3 text-slate-600 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-slate-400">No PDC entries found</td></tr>}
                            {list.map(row => (
                                <tr key={row._id} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{row.partyName}</td>
                                    <td className="px-4 py-3 text-slate-600">{row.chequeNo}</td>
                                    <td className="px-4 py-3 text-slate-500">{row.chequeDate ? new Date(row.chequeDate).toLocaleDateString('en-IN') : '—'}</td>
                                    <td className="px-4 py-3 text-slate-500">{row.bankName || '—'}</td>
                                    <td className="px-4 py-3 text-right font-medium">₹{fmt(row.amount)}</td>
                                    <td className="px-4 py-3 text-xs">{row.type}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}>{row.status}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                            {row.status === 'Pending' && (
                                                <>
                                                    <button title="Present" onClick={() => doAction(row._id, 'present')} className="p-1 text-blue-500 hover:text-blue-700"><Clock size={14} /></button>
                                                    <button title="Clear" onClick={() => doAction(row._id, 'clear')} className="p-1 text-green-500 hover:text-green-700"><CheckCircle size={14} /></button>
                                                    <button title="Bounce" onClick={() => doAction(row._id, 'bounce')} className="p-1 text-orange-500 hover:text-orange-700"><AlertTriangle size={14} /></button>
                                                    <button title="Cancel" onClick={() => doAction(row._id, 'cancel')} className="p-1 text-slate-400 hover:text-red-600"><XCircle size={14} /></button>
                                                </>
                                            )}
                                            {row.status === 'Presented' && (
                                                <>
                                                    <button title="Clear" onClick={() => doAction(row._id, 'clear')} className="p-1 text-green-500 hover:text-green-700"><CheckCircle size={14} /></button>
                                                    <button title="Bounce" onClick={() => doAction(row._id, 'bounce')} className="p-1 text-orange-500 hover:text-orange-700"><AlertTriangle size={14} /></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PDCRegisterPage;
