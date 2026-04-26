import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, TrendingDown, Minus, DollarSign, Trash2, Calendar, Package, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatPrices, addWeChatPriceRecord, deleteWeChatPriceRecord, getWeChatProducts } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import { format } from 'date-fns';

const SOURCE_LABELS = {
    'group_chat': 'Group Chat',
    'individual_chat': 'Direct Chat',
    'manual': 'Manual Entry',
    'quotation_file': 'Quotation File'
};

const WechatPriceHistoryTab = ({ contactId }) => {
    const [prices, setPrices] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterProduct, setFilterProduct] = useState('');
    const [form, setForm] = useState({
        productId: '', price: '', currency: 'RMB',
        moq: '', leadTimeDays: '', source: 'manual',
        quotationDate: new Date().toISOString().split('T')[0],
        remarks: ''
    });

    useEffect(() => {
        fetchEverything();
    }, [contactId]);

    const fetchEverything = async () => {
        try {
            setLoading(true);
            const [pricesRes, productsRes] = await Promise.all([
                getWeChatPrices({ contactId }),
                getWeChatProducts({ contactId })
            ]);
            setPrices(Array.isArray(pricesRes.data?.data) ? pricesRes.data.data : []);
            setProducts(Array.isArray(productsRes.data?.data) ? productsRes.data.data : []);
        } catch { toast.error('Failed to load price history'); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.productId) return toast.error('Please select a product');
        if (!form.price) return toast.error('Price is required');
        try {
            const selectedProduct = products.find(p => p._id === form.productId);
            await addWeChatPriceRecord({
                contactId,
                productId: form.productId,
                partNumber: selectedProduct?.partNumber || '',
                productCategory: selectedProduct?.productCategory || '',
                productName: selectedProduct?.productName || '',
                price: parseFloat(form.price),
                currency: form.currency,
                moq: parseFloat(form.moq) || 0,
                leadTimeDays: parseFloat(form.leadTimeDays) || 0,
                source: form.source,
                quotationDate: form.quotationDate,
                remarks: form.remarks
            });
            toast.success('Price record added');
            setShowForm(false);
            setForm({ productId: '', price: '', currency: 'RMB', moq: '', leadTimeDays: '', source: 'manual', quotationDate: new Date().toISOString().split('T')[0], remarks: '' });
            fetchEverything();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add price');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remove this price record?')) return;
        try {
            await deleteWeChatPriceRecord(id);
            toast.success('Removed');
            fetchEverything();
        } catch { toast.error('Failed'); }
    };

    const getPriceTrend = (price, idx, allPrices) => {
        if (idx >= allPrices.length - 1) return 'first';
        const older = allPrices[idx + 1];
        if (older.price > price.price) return 'down';
        if (older.price < price.price) return 'up';
        return 'same';
    };

    const filteredPrices = filterProduct
        ? prices.filter(p => p.productId?._id === filterProduct || p.productId === filterProduct)
        : prices;

    if (loading) return <div className="flex items-center justify-center py-16"><BrandedLoader size={100} /></div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-6 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Quotation Persistence & Market Trends</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{filteredPrices.length} Professional Quotes Archived</p>
                </div>
                <div className="flex gap-4 items-center w-full md:w-auto">
                    {products.length > 0 && (
                        <select
                            value={filterProduct}
                            onChange={e => setFilterProduct(e.target.value)}
                            className="flex-1 md:flex-none h-14 text-sm font-black border-2 border-slate-100 rounded-2xl px-6 text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none"
                        >
                            <option value="">Filter by Intelligence Node</option>
                            {products.map(p => (
                                <option key={p._id} value={p._id}>{p.partNumber} – {p.productCategory}</option>
                            ))}
                        </select>
                    )}
                    <Button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-slate-900 hover:bg-black text-white text-base font-black rounded-2xl px-8 py-4 flex items-center gap-3 shadow-xl shadow-slate-200 transition-all hover:scale-[1.02]"
                    >
                        <Plus size={20} /> New Quote
                    </Button>
                </div>
            </div>

            {/* Add Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-slate-100/30 border-2 border-slate-100 rounded-[2.5rem] p-10 space-y-8 animate-in fade-in slide-in-from-top-4 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-600" /> Archiving Market Intelligence
                        </h4>
                        <Badge className="bg-white px-3 py-1 rounded-lg text-[10px] font-black emerald-600 border border-slate-200 uppercase">Input Node v2.1</Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Linked Engineering node (Product) *</label>
                            <select
                                value={form.productId}
                                onChange={e => setForm(p => ({ ...p, productId: e.target.value }))}
                                className="w-full h-16 border-2 border-slate-200 rounded-2xl px-6 text-lg font-black text-slate-700 bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 ring-emerald-50 transition-all shadow-sm"
                                required
                            >
                                <option value="">-- Choose Part for Quote Binding --</option>
                                {products.map(p => (
                                    <option key={p._id} value={p._id}>{p.partNumber} — {p.productName || p.productCategory}</option>
                                ))}
                            </select>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-100 shadow-sm">
                            <label className="text-[11px] font-black text-emerald-600 uppercase tracking-widest block mb-2 px-1">Unit Quoted Price *</label>
                            <div className="flex gap-3">
                                <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-24 h-14 border-2 border-emerald-200 rounded-xl px-4 text-sm font-black bg-emerald-50 focus:border-emerald-500 outline-none">
                                    <option value="RMB">¥ (RMB)</option>
                                    <option value="USD">$ (USD)</option>
                                    <option value="INR">₹ (INR)</option>
                                </select>
                                <Input variant="lg" value={form.price} type="number" step="0.001" onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="5.20" required className="h-14 text-xl font-black text-emerald-800 rounded-xl border-2 border-emerald-200 bg-emerald-50/20" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <Input label="Minimum Qty (MOQ)" variant="lg" value={form.moq} type="number" onChange={e => setForm(p => ({ ...p, moq: e.target.value }))} placeholder="5000" className="h-14 rounded-2xl border-2" />
                            <Input label="Lead Time (Days)" variant="lg" value={form.leadTimeDays} type="number" onChange={e => setForm(p => ({ ...p, leadTimeDays: e.target.value }))} placeholder="15" className="h-14 rounded-2xl border-2" />
                        </div>
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Communication Source</label>
                            <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="w-full h-14 border-2 border-slate-200 rounded-2xl px-6 text-base font-bold text-slate-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 ring-blue-50 transition-all shadow-sm">
                                <option value="manual">Manual Log</option>
                                <option value="individual_chat">Direct Message</option>
                                <option value="group_chat">Group Discussion</option>
                                <option value="quotation_file">Formal Quotation File</option>
                            </select>
                        </div>
                        <Input label="Record Mapping Date" variant="lg" value={form.quotationDate} type="date" onChange={e => setForm(p => ({ ...p, quotationDate: e.target.value }))} className="h-14 rounded-2xl border-2" />
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Contextual Remarks</label>
                            <input
                                value={form.remarks}
                                onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                                className="w-full h-16 border-2 border-slate-200 rounded-2xl px-6 text-base font-bold text-slate-700 focus:bg-white focus:border-emerald-500 transition-all shadow-sm"
                                placeholder="e.g. Valid until next month, FOB Shenzhen, Including Tax..."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-6 pt-6 border-t border-slate-200">
                        <Button type="button" variant="ghost" className="text-base font-black h-14 px-8 rounded-2xl text-slate-400" onClick={() => setShowForm(false)}>Discard</Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white h-14 px-12 font-black rounded-2xl shadow-xl shadow-emerald-100 active:scale-[0.98] transition-all">Archive Price Record</Button>
                    </div>
                </form>
            )}

            {/* Price Timeline */}
            {filteredPrices.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">No price records yet</p>
                    <p className="text-xs text-slate-300 mt-1">Record quoted prices to track history and compare suppliers</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredPrices.map((price, idx) => {
                        const trend = getPriceTrend(price, idx, filteredPrices);
                        return (
                            <div key={price._id} className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 flex items-start justify-between group hover:shadow-2xl hover:border-emerald-100 transition-all duration-300">
                                <div className="flex items-start gap-8 flex-1 min-w-0">
                                    <div className={`p-5 rounded-[1.5rem] shrink-0 transform transition-transform group-hover:scale-110 ${
                                        trend === 'down' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' :
                                        trend === 'up' ? 'bg-red-500 text-white shadow-lg shadow-red-100' : 'bg-slate-900 text-white shadow-lg'
                                    }`}>
                                        {trend === 'down' ? <TrendingDown size={24} /> :
                                         trend === 'up' ? <TrendingUp size={24} /> :
                                         <Minus size={24} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-6 flex-wrap mb-4">
                                            <span className="text-3xl font-black text-slate-900 tracking-tighter transition-colors group-hover:text-emerald-700">
                                                <span className="text-sm align-top mr-1">{price.currency === 'RMB' ? '¥' : (price.currency === 'USD' ? '$' : '₹')}</span>
                                                {Number(price.price).toFixed(3)}
                                            </span>
                                            {price.productId?.partNumber && (
                                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest shadow-sm">
                                                    Part: {price.productId.partNumber}
                                                </Badge>
                                            )}
                                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-100 px-4 py-2 rounded-xl font-black uppercase tracking-widest bg-slate-50">
                                                {SOURCE_LABELS[price.source] || price.source}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-6 text-[11px] font-black text-slate-400 flex-wrap uppercase tracking-widest">
                                            <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border-2 border-slate-100 shadow-sm text-slate-500 h-10">
                                                <Calendar size={14} className="text-slate-400" /> {format(new Date(price.quotationDate), 'dd MMM yyyy')}
                                            </span>
                                            {price.moq > 0 && <span className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-md h-10 inline-flex items-center gap-2">
                                                <Package size={12} /> MOQ: {price.moq} UNITS
                                            </span>}
                                            {price.leadTimeDays > 0 && <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl border-2 border-amber-200 h-10 inline-flex items-center gap-2">
                                                <Clock size={12} /> LEAD: {price.leadTimeDays}d
                                            </span>}
                                        </div>
                                        {price.remarks && (
                                            <div className="mt-6 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl relative overflow-hidden group/remark">
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                                                <p className="text-base font-bold text-slate-600 italic leading-relaxed">"{price.remarks}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(price._id)}
                                    className="opacity-0 group-hover:opacity-100 p-4 hover:bg-red-50 rounded-2xl text-red-400 transition-all ml-6 shrink-0 border-2 border-transparent hover:border-red-100 shadow-sm"
                                >
                                    <Trash2 size={24} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default WechatPriceHistoryTab;
