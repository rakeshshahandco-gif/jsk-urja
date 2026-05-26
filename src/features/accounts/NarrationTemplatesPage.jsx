import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FileText, Copy } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const NarrationTemplatesPage = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ title: '', narration: '', voucherNature: 'Any' });
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/narration-templates');
            setList(res.data?.data?.templates || res.data?.data || []);
        } catch { toast.error('Failed to load templates'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => { setEditing(null); setForm({ title: '', narration: '', voucherNature: 'Any' }); setShowForm(true); };
    const openEdit = (row) => { setEditing(row); setForm({ title: row.title, narration: row.narration || '', voucherNature: row.voucherNature || 'Any' }); setShowForm(true); };

    const save = async () => {
        if (!form.title.trim() || !form.narration.trim()) return toast.error('Title and narration are required');
        try {
            if (editing) {
                await axiosInstance.patch(`/narration-templates/${editing._id}`, form);
                toast.success('Updated');
            } else {
                await axiosInstance.post('/narration-templates', form);
                toast.success('Created');
            }
            setShowForm(false);
            load();
        } catch (err) { toast.error(err?.response?.data?.message || 'Save failed'); }
    };

    const remove = async (id) => {
        if (!window.confirm('Deactivate this template?')) return;
        try {
            await axiosInstance.delete(`/narration-templates/${id}`);
            toast.success('Deactivated');
            load();
        } catch { toast.error('Failed'); }
    };

    const copyText = (text) => { navigator.clipboard?.writeText(text); toast.success('Copied!'); };

    const filtered = list.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.narration || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <FileText className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Narration Templates</h1>
                </div>
                <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Plus size={16} /> Add Template
                </button>
            </div>

            {showForm && (
                <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm max-w-xl">
                    <h2 className="font-semibold text-slate-700 mb-4">{editing ? 'Edit' : 'New'} Narration Template</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Title *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Narration Text *</label>
                            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Voucher Type</label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.voucherNature} onChange={e => setForm(p => ({ ...p, voucherNature: e.target.value }))}>
                                <option value="Any">All Voucher Types</option>
                                <option>Receipt</option>
                                <option>Payment</option>
                                <option>Journal</option>
                                <option>Expense</option>
                                <option>Sales</option>
                                <option>Purchase</option>
                                <option>Contra</option>
                                <option>Debit Note</option>
                                <option>Credit Note</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                        <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="mb-4">
                <input className="border rounded-lg px-3 py-2 text-sm w-64" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {loading ? <BrandedLoader /> : (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Title</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Narration</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Voucher Type</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">No templates defined yet</td></tr>}
                            {filtered.map(row => (
                                <tr key={row._id} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{row.title}</td>
                                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{row.narration}</td>
                                    <td className="px-4 py-3 text-xs">
                                        {row.voucherNature && row.voucherNature !== 'Any'
                                            ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{row.voucherNature}</span>
                                            : <span className="text-slate-400">All Types</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => copyText(row.narration)} title="Copy" className="p-1 text-slate-400 hover:text-blue-600 mr-1"><Copy size={14} /></button>
                                        <button onClick={() => openEdit(row)} className="p-1 text-slate-400 hover:text-blue-600 mr-1"><Edit2 size={14} /></button>
                                        <button onClick={() => remove(row._id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
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

export default NarrationTemplatesPage;
