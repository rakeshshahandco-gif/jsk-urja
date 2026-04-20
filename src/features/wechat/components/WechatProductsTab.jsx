import React, { useState, useEffect } from 'react';
import { Plus, Tag, Star, Trash2, ExternalLink, ChevronDown, ChevronUp, Package, DollarSign, Clock, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatProducts, createWeChatProduct, updateWeChatProduct, deleteWeChatProduct } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

const CATEGORIES = ['Tuya', 'Zigbee', 'BLE', 'DALI', 'Driver', 'SMPS', 'Enclosure', 'PCB', 'Sensor', 'Switch', 'Display', 'Lighting', 'Other'];

const WechatProductsTab = ({ contactId, onCompare }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [form, setForm] = useState({
        productCategory: '', productName: '', partNumber: '',
        altPartNumbers: '', brand: '', specification: '',
        moq: '', leadTimeDays: '', currency: 'RMB', latestPrice: '', notes: ''
    });

    useEffect(() => { fetchProducts(); }, [contactId]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const res = await getWeChatProducts({ contactId });
            setProducts(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch { toast.error('Failed to load products'); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.partNumber.trim()) return toast.error('Part number is required');
        try {
            const payload = {
                ...form,
                contactId,
                moq: parseFloat(form.moq) || 0,
                leadTimeDays: parseFloat(form.leadTimeDays) || 0,
                latestPrice: parseFloat(form.latestPrice) || null,
                altPartNumbers: form.altPartNumbers ? form.altPartNumbers.split(',').map(s => s.trim()).filter(Boolean) : []
            };
            if (editingId) {
                await updateWeChatProduct(editingId, payload);
                toast.success('Product updated');
            } else {
                await createWeChatProduct(payload);
                toast.success('Product added');
            }
            setShowForm(false);
            setEditingId(null);
            setForm({ productCategory: '', productName: '', partNumber: '', altPartNumbers: '', brand: '', specification: '', moq: '', leadTimeDays: '', currency: 'RMB', latestPrice: '', notes: '' });
            fetchProducts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save product');
        }
    };

    const handleEdit = (product) => {
        setForm({
            ...product,
            altPartNumbers: (product.altPartNumbers || []).join(', '),
            latestPrice: product.latestPrice || '',
            moq: product.moq || '',
            leadTimeDays: product.leadTimeDays || ''
        });
        setEditingId(product._id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remove this product?')) return;
        try {
            await deleteWeChatProduct(id);
            toast.success('Product removed');
            fetchProducts();
        } catch { toast.error('Failed to remove'); }
    };

    const getCategoryColor = (cat) => {
        const colors = {
            'Tuya': 'bg-orange-100 text-orange-700', 'Zigbee': 'bg-blue-100 text-blue-700',
            'BLE': 'bg-purple-100 text-purple-700', 'DALI': 'bg-teal-100 text-teal-700',
            'Driver': 'bg-yellow-100 text-yellow-700', 'SMPS': 'bg-red-100 text-red-700',
            'Enclosure': 'bg-gray-100 text-gray-700'
        };
        return colors[cat] || 'bg-emerald-100 text-emerald-700';
    };

    if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><div className="animate-spin rounded-full border-2 border-emerald-600 border-t-transparent w-8 h-8 mr-3" /> Loading products...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Product Engineering & Part Mapping</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{products.length} Active Records Dedicated to this Supplier</p>
                </div>
                <Button
                    onClick={() => { setShowForm(!showForm); setEditingId(null); }}
                    className="bg-slate-900 hover:bg-black text-white text-base font-black rounded-2xl px-8 py-4 flex items-center gap-3 shadow-xl shadow-slate-200 transition-all hover:scale-[1.02]"
                >
                    <Plus size={20} /> Add Part Mapping
                </Button>
            </div>

            {/* Inline Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-50/50 border-2 border-slate-100 rounded-[2.5rem] p-10 space-y-8 animate-in fade-in slide-in-from-top-4 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" /> {editingId ? 'Modify Engineering Record' : 'Initialize New Mapping'}
                        </h4>
                        <Badge className="bg-white px-3 py-1 rounded-lg text-[10px] font-black blue-600 border border-slate-200 uppercase">Input Logic v2</Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Industry Category *</label>
                            <select
                                value={form.productCategory}
                                onChange={e => setForm(p => ({ ...p, productCategory: e.target.value }))}
                                className="w-full h-14 border-2 border-slate-200 rounded-2xl px-6 text-base font-bold text-slate-700 bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 ring-emerald-50 transition-all shadow-sm"
                            >
                                <option value="">Global Category</option>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <Input label="Supplier Part Number *" variant="lg" value={form.partNumber} onChange={e => setForm(p => ({ ...p, partNumber: e.target.value }))} placeholder="e.g. BT2S, ESP32-WROOM" required className="rounded-2xl h-14 font-black border-2" />
                        <Input label="Full Product Name / Description" variant="lg" value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value }))} placeholder="e.g. Bluetooth Mesh + WiFi Module" className="rounded-2xl h-14 border-2" />
                        <Input label="Manufacturer / Global Brand" variant="lg" value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} placeholder="e.g. Tuya Smart, Espressif" className="rounded-2xl h-14 border-2" />
                        <Input label="Internal / Alternative Part Nos (CSV)" variant="lg" value={form.altPartNumbers} onChange={e => setForm(p => ({ ...p, altPartNumbers: e.target.value }))} placeholder="e.g. BT2S-V2, ESP-R" className="rounded-2xl h-14 border-2" />
                        <Input label="Technical Specification Details" variant="lg" value={form.specification} onChange={e => setForm(p => ({ ...p, specification: e.target.value }))} placeholder="e.g. 2.4GHz, IP67, 3.3V" className="rounded-2xl h-14 border-2" />
                        
                        <div className="bg-emerald-50/50 p-6 rounded-[2rem] border-2 border-emerald-100/50 grid grid-cols-2 gap-6 items-end">
                            <div className="col-span-1">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Latest Quoted Price</label>
                                <div className="flex gap-2">
                                    <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-24 h-14 border-2 border-emerald-200 rounded-xl px-3 text-sm font-black bg-white focus:border-emerald-500 outline-none">
                                        <option value="RMB">¥</option>
                                        <option value="USD">$</option>
                                        <option value="INR">₹</option>
                                    </select>
                                    <Input variant="lg" value={form.latestPrice} type="number" step="0.01" onChange={e => setForm(p => ({ ...p, latestPrice: e.target.value }))} placeholder="5.20" className="rounded-xl h-14 font-black text-emerald-700 bg-white border-2 border-emerald-200" />
                                </div>
                            </div>
                            <Input label="MOQ (Units)" variant="lg" value={form.moq} type="number" onChange={e => setForm(p => ({ ...p, moq: e.target.value }))} placeholder="1000" className="rounded-2xl h-14 border-2 bg-white" />
                        </div>
                        <Input label="Standard Lead Time (Days)" variant="lg" value={form.leadTimeDays} type="number" onChange={e => setForm(p => ({ ...p, leadTimeDays: e.target.value }))} placeholder="e.g. 15" className="rounded-2xl h-14 border-2" />
                    </div>
                    <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Procurement & Implementation Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            className="w-full border-2 border-slate-200 rounded-2xl p-6 text-base font-bold text-slate-700 bg-white focus:outline-none focus:border-emerald-500 min-h-[100px] transition-all"
                            placeholder="Add price trends, special negotiation points, or quality feedback..."
                        />
                    </div>
                    <div className="flex justify-end gap-6 pt-6 border-t border-slate-200">
                        <Button type="button" variant="ghost" className="text-base font-black h-14 px-8 rounded-2xl text-slate-400" onClick={() => { setShowForm(false); setEditingId(null); }}>Discard</Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white h-14 px-12 font-black rounded-2xl shadow-xl shadow-emerald-100 active:scale-[0.98] transition-all">{editingId ? 'Push Update' : 'Establish Mapping'}</Button>
                    </div>
                </form>
            )}

            {/* Products List */}
            {products.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">No products linked yet</p>
                    <p className="text-xs text-slate-300 mt-1">Add part numbers and products this supplier deals in</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {products.map(product => (
                        <div key={product._id} className="bg-white border-2 border-slate-100 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all duration-300">
                            <div
                                className="flex items-start justify-between p-6 cursor-pointer group"
                                onClick={() => setExpandedId(expandedId === product._id ? null : product._id)}
                            >
                                <div className="flex items-start gap-6 flex-1 min-w-0">
                                    <div className="p-4 bg-emerald-50 rounded-2xl shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                                        <Tag className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-4 flex-wrap mb-2">
                                            <span className="font-black text-slate-900 text-2xl tracking-tighter uppercase">{product.partNumber}</span>
                                            {product.productCategory && (
                                                <Badge className={`text-[10px] px-3 py-1.5 rounded-xl border-0 font-black uppercase tracking-widest ${getCategoryColor(product.productCategory)} shadow-sm`}>
                                                    {product.productCategory}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-base font-bold text-slate-500 truncate">{product.productName} {product.brand && ` · ${product.brand}`}</p>
                                        {product.specification && (
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge variant="outline" className="text-[10px] border-slate-100 text-slate-400 font-bold uppercase py-0.5 px-2 rounded-lg italic">{product.specification}</Badge>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 shrink-0 ml-6">
                                    {product.latestPrice != null && (
                                        <div className="text-right">
                                            <div className="text-2xl font-black text-emerald-700 tracking-tighter">
                                                <span className="text-sm align-top mr-1">{product.currency === 'RMB' ? '¥' : (product.currency === 'USD' ? '$' : '₹')}</span>
                                                {product.latestPrice.toFixed(2)}
                                            </div>
                                            {product.moq > 0 && <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">MOQ: {product.moq} UNITS</div>}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={e => { e.stopPropagation(); onCompare && onCompare(product.partNumber, product.productCategory); }}
                                            className="p-3 hover:bg-emerald-50 rounded-2xl text-emerald-600 transition-all border-2 border-transparent hover:border-emerald-100 shadow-sm"
                                            title="Market Comparison"
                                        >
                                            <ExternalLink size={20} />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleEdit(product); }}
                                            className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all border-2 border-transparent hover:border-slate-200"
                                        >
                                            <Edit2 size={20} />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleDelete(product._id); }}
                                            className="p-3 hover:bg-red-50 rounded-2xl text-red-400 transition-all border-2 border-transparent hover:border-red-100"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                    <div className={`p-2 rounded-xl transition-all ${expandedId === product._id ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-50 text-slate-300'}`}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>
                            </div>

                            {expandedId === product._id && (
                                <div className="border-t border-slate-100 px-10 py-10 bg-slate-50/50 grid grid-cols-2 md:grid-cols-4 gap-10 animate-in fade-in duration-300">
                                    {[
                                        { label: 'Currency Config', val: product.currency || 'RMB', icon: <DollarSign className="w-3.5 h-3.5" /> },
                                        { label: 'Minimum Order', val: `${product.moq || '0'} units`, icon: <Package className="w-3.5 h-3.5" /> },
                                        { label: 'Sourcing Cycle', val: `${product.leadTimeDays || '—'} days`, icon: <Clock className="w-3.5 h-3.5" /> },
                                        { label: 'Last Sync Date', val: product.latestPriceDate ? new Date(product.latestPriceDate).toLocaleDateString() : 'Never', icon: <Star className="w-3.5 h-3.5" /> },
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                {stat.icon} {stat.label}
                                            </p>
                                            <p className="text-base font-black text-slate-900">{stat.val}</p>
                                        </div>
                                    ))}
                                    {product.notes && (
                                        <div className="col-span-full pt-4">
                                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Supplier Intelligence Notes</p>
                                            <div className="bg-white border-2 border-emerald-100/30 p-6 rounded-[2rem] text-base font-bold text-slate-600 leading-relaxed shadow-sm relative italic">
                                                <div className="absolute top-4 left-4 text-emerald-200 opacity-20"><DollarSign size={40} /></div>
                                                <span className="relative z-10">"{product.notes}"</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WechatProductsTab;
