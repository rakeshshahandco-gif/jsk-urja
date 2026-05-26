import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FolderTree, BarChart2 } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const CostCentrePage = () => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', code: '', type: 'Cost Centre', description: '' });

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/cost-centers');
            setList(res.data?.data?.costCenters || res.data?.data || []);
        } catch {
            toast.error('Failed to load cost centres');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => { setEditing(null); setForm({ name: '', code: '', type: 'Cost Centre', description: '' }); setShowForm(true); };
    const openEdit = (row) => { setEditing(row); setForm({ name: row.name, code: row.code || '', type: row.type, description: row.description || '' }); setShowForm(true); };

    const save = async () => {
        if (!form.name.trim()) return toast.error('Name is required');
        try {
            if (editing) {
                await axiosInstance.patch(`/cost-centers/${editing._id}`, form);
                toast.success('Updated');
            } else {
                await axiosInstance.post('/cost-centers', form);
                toast.success('Created');
            }
            setShowForm(false);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        }
    };

    const remove = async (id) => {
        if (!window.confirm('Deactivate this cost centre?')) return;
        try {
            await axiosInstance.delete(`/cost-centers/${id}`);
            toast.success('Deactivated');
            load();
        } catch {
            toast.error('Failed');
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <FolderTree className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800">Cost / Profit Centres</h1>
                </div>
                <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Plus size={16} /> Add Centre
                </button>
            </div>

            {showForm && (
                <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm max-w-lg">
                    <h2 className="font-semibold text-slate-700 mb-4">{editing ? 'Edit' : 'New'} Cost / Profit Centre</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Name *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Code</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm uppercase" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Type</label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                                <option>Cost Centre</option>
                                <option>Profit Centre</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500 block mb-1">Description</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                        <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    </div>
                </div>
            )}

            {loading ? <BrandedLoader /> : (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Name</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Code</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Type</th>
                                <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No cost centres defined yet</td></tr>
                            )}
                            {list.map(row => (
                                <tr key={row._id} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                                    <td className="px-4 py-3 text-slate-500">{row.code || '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.type === 'Profit Centre' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {row.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                            {row.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => openEdit(row)} className="p-1 text-slate-400 hover:text-blue-600 mr-1"><Edit2 size={15} /></button>
                                        <button onClick={() => remove(row._id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
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

export default CostCentrePage;
