import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, Send, FileText, Trash2, Filter, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatChats, addWeChatChat, deleteWeChatChat, getWeChatProducts } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { format } from 'date-fns';

const TAG_COLORS = {
    'Price': 'bg-green-100 text-green-700',
    'MOQ': 'bg-blue-100 text-blue-700',
    'Sample': 'bg-purple-100 text-purple-700',
    'Delivery': 'bg-orange-100 text-orange-700',
    'Technical': 'bg-cyan-100 text-cyan-700',
    'Complaint': 'bg-red-100 text-red-700',
    'New Development': 'bg-pink-100 text-pink-700',
    'General': 'bg-slate-100 text-slate-600'
};

const DIRECTION_CONFIG = {
    'outgoing': { label: 'You sent', color: 'bg-emerald-600 text-white ml-8', icon: <Send size={10} /> },
    'incoming': { label: 'Supplier replied', color: 'bg-white border border-slate-200 text-slate-700 mr-8', icon: <MessageSquare size={10} /> },
    'note': { label: 'Note', color: 'bg-amber-50 border border-amber-200 text-amber-800 mx-4', icon: <FileText size={10} /> }
};

const WechatChatTab = ({ contactId }) => {
    const [chats, setChats] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterTag, setFilterTag] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [form, setForm] = useState({
        message: '', tag: 'General', direction: 'note',
        source: 'manual', productId: '',
        chatDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => { fetchEverything(); }, [contactId]);

    const fetchEverything = async () => {
        try {
            setLoading(true);
            const [chatsRes, productsRes] = await Promise.all([
                getWeChatChats({ contactId }),
                getWeChatProducts({ contactId })
            ]);
            setChats(Array.isArray(chatsRes.data?.data) ? chatsRes.data.data : []);
            setProducts(Array.isArray(productsRes.data?.data) ? productsRes.data.data : []);
        } catch { toast.error('Failed to load communication history'); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.message.trim()) return toast.error('Message is required');
        try {
            const selectedProduct = products.find(p => p._id === form.productId);
            await addWeChatChat({
                contactId,
                productId: form.productId || undefined,
                partNumber: selectedProduct?.partNumber || '',
                productCategory: selectedProduct?.productCategory || '',
                message: form.message.trim(),
                tag: form.tag,
                direction: form.direction,
                source: form.source,
                chatDate: form.chatDate
            });
            toast.success('Entry added');
            setShowForm(false);
            setForm({ message: '', tag: 'General', direction: 'note', source: 'manual', productId: '', chatDate: new Date().toISOString().split('T')[0] });
            fetchEverything();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this entry?')) return;
        try {
            await deleteWeChatChat(id);
            toast.success('Deleted');
            fetchEverything();
        } catch { toast.error('Failed'); }
    };

    const filteredChats = chats.filter(c => {
        if (filterTag && c.tag !== filterTag) return false;
        if (filterProduct && c.productId?._id !== filterProduct && c.productId !== filterProduct) return false;
        return true;
    });

    if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><div className="animate-spin rounded-full border-2 border-emerald-600 border-t-transparent w-8 h-8 mr-3" /> Loading history...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4 px-2">
            <div className="flex items-center justify-between flex-wrap gap-6 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Interactive Communication Ledger</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{chats.length} Strategy & History Points Logged</p>
                </div>
                <Button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-slate-900 hover:bg-black text-white text-base font-black rounded-2xl px-8 py-4 flex items-center gap-3 shadow-xl shadow-slate-200 transition-all hover:scale-[1.02]"
                >
                    <Plus size={20} /> New Communication Entry
                </Button>
            </div>
            </div>

            {/* Filters */}
            {chats.length > 0 && (
                <div className="flex gap-4 flex-wrap bg-slate-100/50 p-6 rounded-[2rem] border border-slate-200/50 shadow-inner">
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                        <Filter size={14} className="text-slate-400" />
                        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="h-10 text-sm font-black text-slate-700 bg-transparent focus:outline-none transition-all cursor-pointer">
                            <option value="">Global Tag Filtering</option>
                            {Object.keys(TAG_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    {products.length > 0 && (
                        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                            <Tag size={14} className="text-slate-400" />
                            <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="h-10 text-sm font-black text-slate-700 bg-transparent focus:outline-none transition-all cursor-pointer">
                                <option value="">Product Specific Filter</option>
                                {products.map(p => <option key={p._id} value={p._id}>{p.partNumber}</option>)}
                            </select>
                        </div>
                    )}
                    {(filterTag || filterProduct) && (
                        <button onClick={() => { setFilterTag(''); setFilterProduct(''); }} className="text-sm font-black text-red-500 hover:text-red-600 transition-colors px-4 h-10 flex items-center gap-2 bg-red-50 rounded-xl border border-red-100 uppercase tracking-widest">
                             Reset Filters
                        </button>
                    )}
                </div>
            )}

            {/* Add Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-10 space-y-10 animate-in fade-in slide-in-from-top-4 shadow-xl">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-emerald-500" /> Communication Inward Record
                        </h4>
                        <Badge className="bg-slate-50 px-3 py-1 rounded-lg text-[10px] font-black text-slate-500 border border-slate-100 uppercase">Interactive Node</Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Entry Classification</label>
                            <select value={form.direction} onChange={e => setForm(p => ({ ...p, direction: e.target.value }))} className="w-full h-14 border-2 border-slate-100 rounded-2xl px-6 text-base font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none">
                                <option value="note">Internal Note (Strategic)</option>
                                <option value="outgoing">Outgoing Transmission (Sent)</option>
                                <option value="incoming">Incoming Transmission (Received)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Mapping Tag</label>
                            <select value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} className="w-full h-14 border-2 border-slate-100 rounded-2xl px-6 text-base font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none">
                                {Object.keys(TAG_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Platform Origin</label>
                            <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="w-full h-14 border-2 border-slate-100 rounded-2xl px-6 text-base font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none">
                                <option value="manual">Manual Ledger Entry</option>
                                <option value="individual">Direct WeChat Context</option>
                                <option value="group">Corporate Group Context</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Record Date</label>
                            <input type="date" value={form.chatDate} onChange={e => setForm(p => ({ ...p, chatDate: e.target.value }))} className="w-full h-14 border-2 border-slate-100 rounded-2xl px-6 text-base font-black text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none" />
                        </div>
                        {products.length > 0 && (
                            <div className="col-span-1 md:col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Related Intelligence Node (Product)</label>
                                <select value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value }))} className="w-full h-14 border-2 border-slate-100 rounded-2xl px-6 text-base font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none">
                                    <option value="">No Global Mapping Link</option>
                                    {products.map(p => <option key={p._id} value={p._id}>{p.partNumber} — {p.productName || p.productCategory}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Core Intelligence / Message Payload *</label>
                            <textarea
                                value={form.message}
                                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                                className="w-full border-2 border-slate-100 rounded-[2rem] p-8 text-lg font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 min-h-[160px] resize-y shadow-inner transition-all outline-none"
                                placeholder="Paste or summarize the key points from the conversation..."
                                required
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-6 pt-6 border-t border-slate-100">
                        <button type="button" className="text-base font-black text-slate-400 hover:text-slate-600 transition-colors px-8" onClick={() => setShowForm(false)}>Discard Phase</button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white h-16 px-12 font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-[0.98]">Push to Ledger</Button>
                    </div>
                </form>
            )}

            {/* Chat Timeline */}
            {filteredChats.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">No communication entries yet</p>
                    <p className="text-xs text-slate-300 mt-1">Record chats, notes, questions, and replies for this supplier</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredChats.map((chat) => {
                        return (
                            <div key={chat._id} className={`rounded-[2.5rem] p-8 border-2 transition-all duration-300 group hover:shadow-2xl hover:scale-[1.01] ${
                                chat.direction === 'outgoing' ? 'bg-emerald-600 border-emerald-700 text-white ml-12 shadow-emerald-100' :
                                chat.direction === 'incoming' ? 'bg-white border-slate-200 text-slate-800 mr-12 shadow-slate-100' :
                                'bg-slate-50 border-slate-200 text-slate-700 mx-6 border-dashed shadow-inner'
                            }`}>
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-4 flex-wrap mb-4">
                                            <Badge className={`text-[10px] px-4 py-2 rounded-xl border-0 font-black uppercase tracking-[0.1em] shadow-sm ${TAG_COLORS[chat.tag]}`}>
                                                {chat.tag}
                                            </Badge>
                                            {chat.productId?.partNumber && (
                                                <Badge variant="outline" className={`text-[10px] px-4 py-2 rounded-xl font-black uppercase tracking-widest border-2 ${chat.direction === 'outgoing' ? 'border-emerald-500/50 text-emerald-100' : 'border-slate-100 text-slate-400 bg-white'}`}>
                                                     Binding: {chat.productId.partNumber}
                                                </Badge>
                                            )}
                                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg border flex items-center gap-2 ${chat.direction === 'outgoing' ? 'bg-emerald-700/50 border-emerald-500' : 'bg-slate-100 border-slate-200'}`}>
                                                {chat.source === 'group' ? '👥 Multi-Group' : chat.source === 'individual' ? '💬 Direct Link' : '📝 Intelligence Note'}
                                            </span>
                                        </div>
                                        <p className="text-lg font-bold leading-relaxed whitespace-pre-wrap tracking-tight">{chat.message}</p>
                                        <div className={`flex items-center gap-5 mt-6 text-[11px] font-black uppercase tracking-[0.15em] ${chat.direction === 'outgoing' ? 'text-emerald-200' : 'text-slate-400'}`}>
                                            <span className="flex items-center gap-2">
                                                <Calendar size={12} /> {format(new Date(chat.chatDate), 'dd MMMM yyyy')}
                                            </span>
                                            {chat.recordedBy?.name && <span className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current opacity-50" /> ARCHIVED BY: {chat.recordedBy.name}
                                            </span>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(chat._id)}
                                        className="opacity-0 group-hover:opacity-100 p-4 hover:bg-black/10 rounded-2xl transition-all shrink-0 border-2 border-transparent hover:border-black/5"
                                    >
                                        <Trash2 size={22} className="text-current" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default WechatChatTab;
