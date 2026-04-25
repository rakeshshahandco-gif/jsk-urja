import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import { 
    Search, Plus, User, Building2, Tag, 
    MessageCircle, Star, Filter, Users, 
    ChevronRight, FileText, ImageIcon, 
    MoreHorizontal, AlertCircle, Download, 
    History, Edit2, Trash2, ArrowLeft,
    Package, DollarSign, MessageSquare,
    BarChart2, X, Globe, ShieldCheck, Zap, Shield, Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
    searchWeChatUnified, 
    getWeChatContacts, 
    getWeChatGroups,
    getWeChatContact,
    getWeChatGroup,
    deleteWeChatContact,
    deleteWeChatGroup,
    uploadWeChatAttachment,
    exportWeChatContacts
} from '../../../services/weChatApi';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/Tabs';
import WechatContactForm from '../components/WechatContactForm';
import WechatGroupForm from '../components/WechatGroupForm';
import WechatProductsTab from '../components/WechatProductsTab';
import WechatPriceHistoryTab from '../components/WechatPriceHistoryTab';
import WechatChatTab from '../components/WechatChatTab';
import WechatCompareView from '../components/WechatCompareView';
import { format } from 'date-fns';

// ─── Attachment Tab ───────────────────────────────────────────────────────────
const AttachmentsTab = ({ item, type, onUpload }) => {
    const attachments = item?.attachments || [];
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-800">Documents & Files</h3>
                <label className="cursor-pointer">
                    <input type="file" className="hidden" onChange={e => onUpload(item._id, e.target.files[0])} />
                    <span className="flex items-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold transition-colors cursor-pointer shadow-md">
                        <Plus size={14} /> Add File
                    </span>
                </label>
            </div>
            {attachments.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400 font-bold">No files uploaded</p>
                    <p className="text-xs text-slate-300 mt-1.5">Upload catalogues, screenshots, or quotations</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    {attachments.map((file, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all group">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-50 rounded-xl shrink-0">
                                    {file.mimetype?.startsWith('image') ? <ImageIcon size={20} className="text-blue-600" /> : <FileText size={20} className="text-blue-600" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-slate-900 truncate">{file.filename}</p>
                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">{file.type || 'Document'}</p>
                                    <a href={file.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        View File
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Contact Info Overview ────────────────────────────────────────────────────
const OverviewTab = ({ item, type }) => {
    const isContact = type === 'contact';
    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
                {[
                    { label: 'Entry ID', value: item.entryNo },
                    isContact ? { label: 'Contact Type', value: item.contactType } : { label: 'Category', value: item.category },
                    isContact ? { label: 'Region / Province', value: item.region } : { label: 'Purpose', value: item.purpose },
                    isContact ? { label: 'Company', value: item.companyName } : null,
                    isContact ? { label: 'Mobile No / Ph', value: item.mobile } : null,
                    isContact ? { label: 'WeChat ID', value: item.weChatId } : null,
                    isContact ? { label: 'Channel Name', value: item.channelName } : null,
                    isContact ? { label: 'Email', value: item.email } : null,
                ].filter(Boolean).map((field, i) => field.value ? (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">{field.label}</p>
                        <p className="text-sm font-black text-slate-700">{field.value}</p>
                    </div>
                ) : null)}
            </div>

            {/* Product & Business Keywords */}
            {((item.productKeywords?.length > 0) || (item.relatedItems?.length > 0)) && (
                <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Core Products & Keywords</p>
                    <div className="flex flex-wrap gap-2.5">
                        {[...(item.productKeywords || []), ...(item.relatedItems || [])].map(tag => (
                            <Badge key={tag} className="bg-blue-600 text-white border-0 text-xs px-3 py-1.5 rounded-xl font-bold shadow-sm">
                                <Tag size={10} className="mr-1.5 inline" />{tag}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            {item.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6">
                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-2">Internal Notes</p>
                    <p className="text-sm text-amber-900 font-bold leading-relaxed italic">"{item.notes}"</p>
                </div>
            )}

            {/* Notes History */}
            {item.notesHistory?.length > 0 && (
                <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Communication History</p>
                    <div className="space-y-4">
                        {[...(item.notesHistory || [])].reverse().slice(0, 5).map((note, i) => (
                            <div key={i} className="flex gap-4">
                                <div className="w-2 h-2 rounded-full bg-slate-300 mt-2 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-slate-700">{note.note}</p>
                                    <p className="text-xs text-slate-400 mt-1">{note.date ? format(new Date(note.date), 'dd MMM yyyy') : '—'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Creation info */}
            <p className="text-xs font-bold text-slate-300 pt-4 border-t border-slate-100">
                Record Established: {item.createdAt ? format(new Date(item.createdAt), 'dd MMM yyyy') : '—'}
            </p>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const WechatListPage = () => {
    const [results, setResults] = useState({ contacts: [], groups: [], products: [], prices: [], chats: [] });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null); // { item, type }
    const [detailItem, setDetailItem] = useState(null);     // full populated item
    const [detailLoading, setDetailLoading] = useState(false);
    const [listTab, setListTab] = useState('all');          // all | contacts | groups
    const [detailTab, setDetailTab] = useState('overview'); // overview | products | prices | chat | files | compare
    const [compareParams, setCompareParams] = useState(null); // { partNumber, productCategory }

    // Form states
    const [isContactFormOpen, setIsContactFormOpen] = useState(false);
    const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => fetchResults(), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchResults = async () => {
        try {
            setLoading(true);
            if (search.trim()) {
                const res = await searchWeChatUnified({ search });
                const d = res.data?.data || {};
                setResults({
                    contacts: Array.isArray(d.contacts) ? d.contacts : [],
                    groups: Array.isArray(d.groups) ? d.groups : [],
                    products: Array.isArray(d.products) ? d.products : [],
                    prices: Array.isArray(d.prices) ? d.prices : [],
                    chats: Array.isArray(d.chats) ? d.chats : []
                });
            } else {
                const [contactsRes, groupsRes] = await Promise.all([
                    getWeChatContacts({ limit: 100 }),
                    getWeChatGroups()
                ]);
                setResults({
                    contacts: Array.isArray(contactsRes.data?.data) ? contactsRes.data.data : [],
                    groups: Array.isArray(groupsRes.data?.data) ? groupsRes.data.data : [],
                    products: [], prices: [], chats: []
                });
            }
        } catch { toast.error('Search failed'); }
        finally { setLoading(false); }
    };

    const loadDetailItem = async (item, type) => {
        setSelectedItem({ item, type });
        setDetailItem(null);
        setDetailLoading(true);
        setDetailTab('overview');
        setCompareParams(null);
        try {
            const apiCall = type === 'contact' ? getWeChatContact : getWeChatGroup;
            const res = await apiCall(item._id);
            setDetailItem(res.data?.data || res.data);
        } catch { toast.error('Failed to load details'); }
        finally { setDetailLoading(false); }
    };

    const handleUpload = async (id, file) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', file.type.startsWith('image/') ? 'Screenshot' : 'Catalog');
        try {
            toast.loading('Uploading...', { id: 'uploading' });
            await uploadWeChatAttachment(selectedItem.type, id, formData);
            toast.success('Uploaded', { id: 'uploading' });
            loadDetailItem(selectedItem.item, selectedItem.type);
        } catch { toast.error('Upload failed', { id: 'uploading' }); }
    };

    const handleDelete = async (type, id) => {
        if (!window.confirm(`Delete this ${type}?`)) return;
        try {
            if (type === 'contact') await deleteWeChatContact(id);
            else await deleteWeChatGroup(id);
            toast.success('Deleted');
            if (selectedItem?.item._id === id) {
                setSelectedItem(null);
                setDetailItem(null);
            }
            fetchResults();
        } catch { toast.error('Failed to delete'); }
    };

    const handleCompare = (partNumber, productCategory) => {
        setCompareParams({ partNumber, productCategory });
        setDetailTab('compare');
    };

    const handleExportContacts = async () => {
        try {
            toast.loading('Preparing download...', { id: 'exporting' });
            const query = { search, isActive: true }; // Simplified for now
            const res = await exportWeChatContacts(query);
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `WeChat_Suppliers_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            toast.success('Download started', { id: 'exporting' });
        } catch { toast.error('Export failed', { id: 'exporting' }); }
    };

    const getListItems = () => {
        if (listTab === 'contacts') return results.contacts.map(c => ({ item: c, type: 'contact' }));
        if (listTab === 'groups') return results.groups.map(g => ({ item: g, type: 'group' }));
        return [
            ...results.contacts.map(c => ({ item: c, type: 'contact' })),
            ...results.groups.map(g => ({ item: g, type: 'group' }))
        ];
    };

    const listItems = getListItems();
    const totalCount = results.contacts.length + results.groups.length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
            {/* Page Header */}
            <div className="bg-white border-b border-slate-100 px-8 py-6 shadow-sm sticky top-0 z-10">
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="bg-emerald-600 p-4 rounded-[1.5rem] shadow-xl shadow-emerald-200/50">
                            <MessageCircle className="text-white w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 leading-tight tracking-tight">WeChat Supplier Intelligence</h1>
                            <p className="text-base font-bold text-slate-400 mt-1">Global Procurement · Product Mapping · Market Analytics</p>
                        </div>
                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        <Button
                            onClick={handleExportContacts}
                            variant="outline"
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-base font-black px-6 py-4 rounded-2xl transition-all shadow-sm"
                        >
                            <Download size={20} /> Export Excel
                        </Button>
                        <Button
                            onClick={() => { setEditTarget(null); setIsGroupFormOpen(true); }}
                            variant="outline"
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 border-blue-200 text-blue-700 hover:bg-blue-50 text-base font-black px-6 py-4 rounded-2xl transition-all shadow-sm"
                        >
                            <Users size={20} /> New Group
                        </Button>
                        <Button
                            onClick={() => { setEditTarget(null); setIsContactFormOpen(true); }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-slate-900 hover:bg-black text-white shadow-2xl shadow-slate-200 text-base font-black px-8 py-4 rounded-2xl transition-all"
                        >
                            <Plus size={20} /> New Supplier
                        </Button>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white border-b border-slate-100 px-8 py-4">
                <div className="max-w-screen-2xl mx-auto">
                    <div className="relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6 group-focus-within:text-emerald-600 transition-colors" />
                        <Input
                            placeholder='Search: "Tuya", "BT2S", "Shenzhen", "Alibaba ID", "WeChat ID"...'
                            className="pl-16 h-16 text-lg font-bold rounded-[2rem] border-2 border-slate-100 bg-slate-50/50 focus:bg-white focus:border-emerald-500 transition-all placeholder:text-slate-300 shadow-inner"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors bg-white p-1 rounded-full shadow-sm">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                    {/* Search result hits */}
                    {search && (results.products.length > 0 || results.prices.length > 0 || results.chats.length > 0) && (
                        <div className="flex gap-4 mt-3 flex-wrap pl-6">
                            {results.products.length > 0 && (
                                <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm">
                                    <Package size={12} /> {results.products.length} Products Found
                                </span>
                            )}
                            {results.prices.length > 0 && (
                                <span className="text-xs font-black text-blue-700 bg-blue-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm">
                                    <DollarSign size={12} /> {results.prices.length} Price Records
                                </span>
                            )}
                            {results.chats.length > 0 && (
                                <span className="text-xs font-black text-purple-700 bg-purple-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm">
                                    <MessageSquare size={12} /> {results.chats.length} Chat Logs
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 2-Panel Layout */}
            <div className="max-w-screen-2xl mx-auto flex h-[calc(100vh-160px)]">

                {/* ── LEFT PANEL: List ──────────────────────────────────────── */}
                <div className="w-80 xl:w-96 shrink-0 border-r border-slate-200 bg-white flex flex-col">
                    {/* List Tabs */}
                    <div className="p-3 bg-slate-50">
                        <div className="flex bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200">
                            {[
                                { key: 'all', label: 'All', count: totalCount },
                                { key: 'contacts', label: 'Contacts', count: results.contacts.length },
                                { key: 'groups', label: 'Groups', count: results.groups.length }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setListTab(tab.key)}
                                    className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all duration-300 ${
                                        listTab === tab.key
                                            ? 'bg-emerald-600 text-white shadow-2xl shadow-emerald-200 scale-[1.02]'
                                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <span className="text-[11px] font-black uppercase tracking-[0.15em]">{tab.label}</span>
                                    <span className={`text-[10px] font-black mt-1 ${listTab === tab.key ? 'text-emerald-100' : 'text-slate-300'}`}>
                                        {tab.count.toString().padStart(2, '0')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* List Items */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                <div className="animate-spin rounded-full border-2 border-emerald-600 border-t-transparent w-8 h-8 mb-3" />
                                <p className="text-xs">Loading...</p>
                            </div>
                        ) : listItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300 px-8 text-center bg-slate-50/30">
                                <div className="p-8 bg-white rounded-full shadow-sm mb-6 border border-slate-100">
                                    <AlertCircle size={48} className="text-slate-200" />
                                </div>
                                <p className="text-lg font-black text-slate-400">No Records Found</p>
                                <p className="text-sm text-slate-300 mt-2 font-bold leading-relaxed">Try searching by part number (BT2S) or category (Tuya)</p>
                            </div>
                        ) : (
                            <div>
                                {listItems.map(({ item, type }) => {
                                    const isContact = type === 'contact';
                                    const name = isContact ? item.weChatDisplayName : item.groupName;
                                    const sub = isContact ? (item.chineseName || item.englishName || item.companyName) : (item.groupAlias || item.purpose);
                                    const isSelected = selectedItem?.item._id === item._id;

                                    return (
                                        <div
                                            key={`${type}-${item._id}`}
                                            onClick={() => loadDetailItem(item, type)}
                                            className={`flex items-start gap-4 px-5 py-4 cursor-pointer border-b border-slate-50 transition-colors group ${
                                                isSelected
                                                    ? 'bg-emerald-50 border-l-4 border-l-emerald-600'
                                                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                                            }`}
                                        >
                                            <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${isContact ? 'bg-green-100' : 'bg-blue-100'}`}>
                                                {isContact ? <User size={16} className="text-green-700" /> : <Users size={16} className="text-blue-700" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm font-black truncate ${isSelected ? 'text-emerald-800' : 'text-slate-900'}`}>{name}</span>
                                                    {item.isFavorite && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                                                </div>
                                                {sub && <p className="text-xs font-bold text-slate-400 truncate font-hindi mt-1 italic">{sub}</p>}
                                                <div className="flex gap-2 mt-2 flex-wrap">
                                                    {(item.productKeywords || []).slice(0, 2).map(kw => (
                                                        <span key={kw} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter">{kw}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                {item.attachments?.length > 0 && (
                                                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">{item.attachments.length} files</span>
                                                )}
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setEditTarget(item); isContact ? setIsContactFormOpen(true) : setIsGroupFormOpen(true); }}
                                                        className="p-1 hover:bg-slate-200 rounded"
                                                    >
                                                        <Edit2 size={10} className="text-slate-400" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleDelete(type, item._id); }}
                                                        className="p-1 hover:bg-red-50 rounded"
                                                    >
                                                        <Trash2 size={10} className="text-red-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT PANEL: Detail View ──────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                    {!selectedItem ? (
                        // Premium Empty State
                        <div className="flex flex-col items-center justify-center h-full text-slate-300 px-16 text-center bg-slate-50/10 transition-all duration-700 animate-in fade-in zoom-in-95">
                            <div className="bg-white p-12 rounded-[4rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08)] mb-12 border border-slate-50 relative group transition-transform hover:scale-105 duration-500">
                                <MessageCircle size={80} className="text-emerald-500 transition-colors duration-500 group-hover:text-emerald-600" />
                                <div className="absolute -bottom-4 -right-4 bg-emerald-600 p-5 rounded-3xl shadow-2xl border-8 border-white animate-bounce-subtle">
                                    <Zap size={32} className="text-white" />
                                </div>
                            </div>
                            <h3 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter">Intelligence Dashboard</h3>
                            <p className="text-lg text-slate-400 max-w-lg leading-relaxed font-bold mb-16">
                                Bridge your digital procurement gaps. Select a supplier or group to view deep intelligence mapping, price trends, and historical logs.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl">
                                {[
                                    { 
                                        icon: <Package size={28} />, 
                                        label: 'Product Intelligence', 
                                        desc: 'Technical BOM mapping & part alternatives',
                                        color: 'text-emerald-600 bg-emerald-50' 
                                    },
                                    { 
                                        icon: <DollarSign size={28} />, 
                                        label: 'Price Analytics', 
                                        desc: 'Historical market trends & ceiling benchmarks',
                                        color: 'text-blue-600 bg-blue-50' 
                                    },
                                    { 
                                        icon: <ShieldCheck size={28} />, 
                                        label: 'Digital Integrity', 
                                        desc: 'Verified supplier WeChat IDs & region tags',
                                        color: 'text-purple-600 bg-purple-50' 
                                    },
                                ].map((f, i) => (
                                    <div key={i} 
                                        onClick={() => toast(`Select a supplier from the left panel to access ${f.label}`, { icon: '👈', duration: 4000 })}
                                        className="cursor-pointer text-left p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm hover:shadow-2xl hover:border-emerald-200 transition-all duration-500 group"
                                    >
                                        <div className={`p-5 rounded-2xl inline-flex mb-8 transition-transform group-hover:rotate-12 ${f.color}`}>{f.icon}</div>
                                        <p className="text-base font-black text-slate-900 mb-2">{f.label}</p>
                                        <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase tracking-tight">{f.desc}</p>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Dashboard Status Bar */}
                            <div className="mt-20 flex items-center gap-12 text-slate-300 font-black text-[10px] uppercase tracking-[0.3em]">
                                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Live Data Sync</div>
                                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /> Export Ready</div>
                                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> 128 bit Encryption</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Detail Header */}
                            <div className={cn(
                                "p-10 text-white relative overflow-hidden transition-all duration-700",
                                selectedItem.type === 'contact' 
                                    ? "bg-gradient-to-br from-emerald-600 to-emerald-800 shadow-[0_20px_50px_-20px_rgba(5,150,105,0.4)]" 
                                    : "bg-gradient-to-br from-blue-700 to-blue-900 shadow-[0_20px_50px_-20px_rgba(29,78,216,0.4)]"
                            )}>
                                {/* Background Decoration */}
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl scale-150 transition-transform duration-1000 group-hover:scale-110" />
                                
                                {detailLoading ? (
                                    <div className="flex items-center gap-4 text-white/50 animate-pulse">
                                        <div className="w-12 h-12 rounded-2xl bg-white/10" />
                                        <div className="h-6 w-48 bg-white/10 rounded-lg" />
                                    </div>
                                ) : detailItem && (
                                    <div className="flex items-end justify-between relative z-10">
                                        <div className="flex items-end gap-6">
                                            <div className="p-5 bg-white/15 rounded-3xl backdrop-blur-2xl border border-white/20 shadow-2xl transition-transform hover:scale-110 duration-500">
                                                {selectedItem.type === 'contact' ? <User size={40} className="text-white" /> : <Users size={40} className="text-white" />}
                                            </div>
                                            <div className="pb-1">
                                                <div className="flex items-center gap-4 mb-3">
                                                    <h2 className="text-4xl font-black text-white tracking-tighter drop-shadow-md">
                                                        {selectedItem.type === 'contact' ? detailItem.weChatDisplayName : detailItem.groupName}
                                                    </h2>
                                                    {detailItem.isFavorite && (
                                                        <div className="bg-amber-400 p-2 rounded-xl shadow-lg">
                                                            <Star size={16} className="fill-white text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <p className="text-white/70 text-lg font-black uppercase tracking-[0.25em]">
                                                        {selectedItem.type === 'contact'
                                                            ? (detailItem.chineseName || detailItem.englishName || detailItem.companyName || 'Supplier Identity')
                                                            : (detailItem.chineseGroupName || detailItem.groupAlias || 'Intelligence Cluster')}
                                                    </p>
                                                    <span className="text-white/30">|</span>
                                                    <Badge className="bg-white/10 text-white border-white/10 backdrop-blur-md rounded-xl font-black text-[10px] tracking-widest uppercase py-1.5 px-4 shadow-inner">
                                                        {selectedItem.type === 'contact' ? (detailItem.contactType || 'Regular Contact') : 'Digital Group'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-6 pb-2">
                                            <div className="flex gap-3">
                                                <Button
                                                    variant="ghost"
                                                    className="bg-white/10 text-white hover:bg-white/25 rounded-2xl px-6 h-12 font-black text-xs border border-white/10 transition-all active:scale-95"
                                                    onClick={() => {
                                                        setEditTarget(selectedItem.item);
                                                        selectedItem.type === 'contact' ? setIsContactFormOpen(true) : setIsGroupFormOpen(true);
                                                    }}
                                                >
                                                    <Edit2 size={14} className="mr-2" /> Adjust Identity
                                                </Button>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] font-black text-white/40 uppercase tracking-widest">
                                                <div className="flex items-center gap-1.5"><Clock size={12} /> Active</div>
                                                <div className="flex items-center gap-1.5"><Shield size={12} /> Encrypted</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Detail Tabs */}
                            {!detailLoading && detailItem && (
                                <div className="flex border-b-2 border-slate-200 bg-slate-50/50 overflow-x-auto">
                                    {[
                                        { key: 'overview', label: 'Identity Overview', icon: <User size={14} /> },
                                        ...(selectedItem.type === 'contact' ? [
                                            { key: 'products', label: 'Product Inventory', icon: <Package size={14} /> },
                                            { key: 'prices', label: 'Price Timeline', icon: <DollarSign size={14} /> },
                                            { key: 'chat', label: 'Communication Log', icon: <MessageSquare size={14} /> },
                                        ] : []),
                                        { key: 'files', label: 'Attachments', icon: <FileText size={14} /> },
                                        ...(compareParams ? [{ key: 'compare', label: 'Market Compare', icon: <BarChart2 size={14} /> }] : [])
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setDetailTab(tab.key)}
                                            className={`flex items-center gap-2 px-6 py-4 text-sm font-black uppercase tracking-widest whitespace-nowrap transition-colors ${
                                                detailTab === tab.key
                                                    ? 'text-emerald-700 border-b-4 border-emerald-600 bg-white'
                                                    : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                        >
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Tab Content */}
                            {!detailLoading && detailItem && (
                                <div className="flex-1 overflow-y-auto p-6">
                                    {detailTab === 'overview' && <OverviewTab item={detailItem} type={selectedItem.type} />}
                                    {detailTab === 'products' && selectedItem.type === 'contact' && (
                                        <WechatProductsTab contactId={detailItem._id} onCompare={handleCompare} />
                                    )}
                                    {detailTab === 'prices' && selectedItem.type === 'contact' && (
                                        <WechatPriceHistoryTab contactId={detailItem._id} />
                                    )}
                                    {detailTab === 'chat' && selectedItem.type === 'contact' && (
                                        <WechatChatTab contactId={detailItem._id} />
                                    )}
                                    {detailTab === 'files' && (
                                        <AttachmentsTab item={detailItem} type={selectedItem.type} onUpload={handleUpload} />
                                    )}
                                    {detailTab === 'compare' && compareParams && (
                                        <WechatCompareView
                                            partNumber={compareParams.partNumber}
                                            productCategory={compareParams.productCategory}
                                            onClose={() => { setCompareParams(null); setDetailTab('products'); }}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Forms */}
            {isContactFormOpen && (
                <WechatContactForm
                    contact={editTarget}
                    onClose={() => { setIsContactFormOpen(false); setEditTarget(null); }}
                    onSuccess={() => {
                        setIsContactFormOpen(false);
                        setEditTarget(null);
                        fetchResults();
                        if (selectedItem && editTarget?._id === selectedItem.item._id) {
                            loadDetailItem(selectedItem.item, 'contact');
                        }
                    }}
                />
            )}

            {isGroupFormOpen && (
                <WechatGroupForm
                    group={editTarget}
                    onClose={() => { setIsGroupFormOpen(false); setEditTarget(null); }}
                    onSuccess={() => {
                        setIsGroupFormOpen(false);
                        setEditTarget(null);
                        fetchResults();
                    }}
                />
            )}
        </div>
    );
};

export default WechatListPage;
