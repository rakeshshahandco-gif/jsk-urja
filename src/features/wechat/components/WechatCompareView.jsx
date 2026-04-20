import React, { useState, useEffect } from 'react';
import { ArrowUpDown, Star, Building2, Users, MessageSquare, FileText, TrendingDown, X, Download, Package, Tag, Clock } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'react-hot-toast';
import { compareWeChatProducts, exportWeChatComparison } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { format } from 'date-fns';

const WechatCompareView = ({ partNumber, productCategory, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('price'); // 'price' | 'date' | 'supplier'

    useEffect(() => {
        fetchComparison();
    }, [partNumber, productCategory]);

    const fetchComparison = async () => {
        try {
            setLoading(true);
            const res = await compareWeChatProducts({ partNumber, productCategory });
            setData(res.data?.data);
        } catch { toast.error('Failed to load comparison'); }
        finally { setLoading(false); }
    };

    const handleExportComparison = async () => {
        try {
            toast.loading('Generating report...', { id: 'exporting_comp' });
            const res = await exportWeChatComparison({ partNumber, productCategory });
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Comparison_${partNumber || productCategory}_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            toast.success('Downloaded', { id: 'exporting_comp' });
        } catch { toast.error('Export failed', { id: 'exporting_comp' }); }
    };

    const getSortedResults = () => {
        if (!data?.results) return [];
        const results = [...data.results];
        if (sortBy === 'price') {
            return results.sort((a, b) => (a.latestPrice ?? Infinity) - (b.latestPrice ?? Infinity));
        }
        if (sortBy === 'date') {
            return results.sort((a, b) => {
                const aDate = a.lastChat?.chatDate || a.latestPriceRecord?.quotationDate || a.updatedAt;
                const bDate = b.lastChat?.chatDate || b.latestPriceRecord?.quotationDate || b.updatedAt;
                return new Date(bDate) - new Date(aDate);
            });
        }
        if (sortBy === 'supplier') {
            return results.sort((a, b) => {
                const aName = a.contactId?.weChatDisplayName || a.contactId?.companyName || '';
                const bName = b.contactId?.weChatDisplayName || b.contactId?.companyName || '';
                return aName.localeCompare(bName);
            });
        }
        return results;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="animate-spin rounded-full border-2 border-emerald-600 border-t-transparent w-10 h-10 mb-4" />
                <p className="text-sm font-medium">Comparing suppliers for <strong className="text-emerald-700">{partNumber || productCategory}</strong>...</p>
            </div>
        );
    }

    const results = getSortedResults();

    return (
        <div className="space-y-12">
            {/* ── PREMIUM ANALYTIC HEADER ── */}
            <div className="flex items-center justify-between px-4 bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-6 mb-3">
                        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl">
                            <ArrowUpDown size={28} />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
                            Market Intelligence Comparison
                        </h2>
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                        {partNumber && (
                            <Badge className="bg-emerald-600 text-white border-0 font-black px-6 py-2.5 text-lg rounded-2xl shadow-lg shadow-emerald-100 uppercase tracking-widest transition-transform hover:scale-105">
                                <Package className="w-4 h-4 mr-2" /> {partNumber}
                            </Badge>
                        )}
                        {productCategory && (
                            <Badge className="bg-blue-600 text-white border-0 font-black px-6 py-2.5 text-lg rounded-2xl shadow-lg shadow-blue-100 uppercase tracking-widest transition-transform hover:scale-105">
                                <Tag className="w-4 h-4 mr-2" /> {productCategory}
                            </Badge>
                        )}
                        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                             Analysis of {data?.totalSuppliers || 0} Global Nodes
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-6">
                    <div className="flex items-center gap-4">
                        <Button 
                            onClick={handleExportComparison}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-14 px-8 font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all border-0 flex items-center gap-3"
                        >
                            <Download size={20} /> Generate Ledger Report
                        </Button>
                        {onClose && (
                            <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400">
                                <X size={24} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-[1.5rem] border-2 border-slate-200">
                         <span className="text-[10px] font-black uppercase text-slate-400 px-3">Filter Logic:</span>
                        {['price', 'date', 'supplier'].map(s => (
                            <button
                                key={s}
                                onClick={() => setSortBy(s)}
                                className={`text-xs px-6 py-2.5 capitalize font-black transition-all rounded-xl border-2 ${sortBy === s ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* No results */}
            {results.length === 0 && (
                <div className="text-center py-24 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                    <TrendingDown className="w-16 h-16 text-slate-300 mx-auto mb-6" />
                    <p className="text-lg font-black text-slate-400 mb-2">No supplier competition found</p>
                    <p className="text-sm text-slate-300">Ensure products and prices are recorded to generate comparison analytics</p>
                </div>
            )}

            {/* ── INTELLIGENCE DATA GRID ── */}
            {results.length > 0 && (
                <div className="overflow-hidden rounded-[2.5rem] border-2 border-slate-100 shadow-2xl bg-white">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-900 text-white border-b-4 border-emerald-600">
                                <th className="text-left px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">SUPPLIER IDENTITY NODE</th>
                                <th className="text-right px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">OPTIMIZED QUOTATION</th>
                                <th className="text-center px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">CURRENCY UNIT</th>
                                <th className="text-center px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">MOQ LIMIT</th>
                                <th className="text-center px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">LEAD CYCLE</th>
                                <th className="text-center px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">LAST SYNC</th>
                                <th className="text-center px-8 py-8 text-[11px] font-black uppercase tracking-[0.25em] h-24">LEDGER RANK</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((item, idx) => (
                                <tr
                                    key={item._id}
                                    className={`border-b border-slate-100 transition-all duration-300 group h-32 ${
                                        item.isBestPrice
                                            ? 'bg-emerald-50/50 hover:bg-emerald-100/80 ring-2 ring-emerald-500/20'
                                            : 'bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    {/* Supplier */}
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-6">
                                            <div className={cn(
                                                "w-16 h-16 rounded-[1.25rem] flex items-center justify-center transition-all shadow-lg",
                                                item.isBestPrice ? "bg-emerald-600 text-white rotate-3 group-hover:rotate-6" : "bg-slate-100 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
                                            )}>
                                                <Building2 size={24} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="font-black text-slate-900 text-lg tracking-tighter">
                                                        {item.contactId?.weChatDisplayName || item.contactId?.companyName || 'Unknown Entity'}
                                                    </span>
                                                    {item.contactId?.isFavorite && (
                                                        <div className="bg-amber-100 p-1.5 rounded-lg">
                                                            <Star size={14} className="text-amber-500 fill-amber-500" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                                    {item.contactId?.companyName || 'Boutique Firm'} · {item.contactId?.region || 'Global'}
                                                </p>
                                                {item.isBestPrice && (
                                                    <span className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-emerald-200">
                                                        <TrendingDown size={12} /> Optimization Target
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Price */}
                                    <td className="px-8 py-6 text-right">
                                        {item.latestPrice != null ? (
                                            <div className="flex flex-col items-end">
                                                <span className={cn(
                                                    "font-black text-3xl tracking-tighter",
                                                    item.isBestPrice ? "text-emerald-700" : "text-slate-900"
                                                )}>
                                                    {item.latestPrice.toFixed(4)}
                                                </span>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Net Base Cost</p>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 text-sm font-black uppercase tracking-widest">Pricing Pending</span>
                                        )}
                                    </td>

                                    {/* Currency */}
                                    <td className="px-8 py-6 text-center">
                                        <Badge variant="outline" className="h-10 px-5 rounded-xl border-2 font-black text-sm text-slate-500 bg-slate-50/50 uppercase tracking-widest">
                                            {item.currency || 'RMB'}
                                        </Badge>
                                    </td>

                                    {/* MOQ */}
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-lg font-black text-slate-800">{item.moq > 0 ? item.moq : '∞'}</span>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Min Units</span>
                                        </div>
                                    </td>

                                    {/* Lead Time */}
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-lg font-black text-slate-800">{item.leadTimeDays > 0 ? `${item.leadTimeDays}D` : '⚡'}</span>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cycle State</span>
                                        </div>
                                    </td>

                                    {/* Last Chat */}
                                    <td className="px-8 py-6 text-center">
                                        {item.lastChat ? (
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <span className="text-xs font-black text-slate-900 uppercase tracking-tighter">{format(new Date(item.lastChat.chatDate), 'dd MMM yyyy')}</span>
                                                <Badge className={cn(
                                                    "text-[9px] px-3 py-1.5 border-0 rounded-lg font-black uppercase tracking-widest transition-colors shadow-sm",
                                                    item.lastChat.tag === 'Price' ? "bg-emerald-600 text-white" :
                                                    item.lastChat.tag === 'Technical' ? "bg-blue-600 text-white" :
                                                    "bg-slate-200 text-slate-500"
                                                )}>{item.lastChat.tag}</Badge>
                                            </div>
                                        ) : (
                                            <Badge variant="ghost" className="text-slate-300 font-black text-[10px] uppercase tracking-widest">Offline</Badge>
                                        )}
                                    </td>

                                    {/* Ranking */}
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex items-center justify-center">
                                            {item.isBestPrice ? (
                                                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center font-black shadow-xl shadow-emerald-200 animate-pulse">
                                                    #1
                                                </div>
                                            ) : (
                                                <div className="h-10 px-6 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center font-black text-sm border-2 border-slate-200/50 uppercase tracking-widest">
                                                    Tier {idx + 1}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── MARKET DEPTH ANALYTICS ── */}
            {results.length > 1 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
                    {[
                        { 
                            label: 'Optimized Market Entry', 
                            value: results.find(r => r.isBestPrice)?.latestPrice?.toFixed(4), 
                            currency: results.find(r => r.isBestPrice)?.currency, 
                            color: 'from-emerald-600 to-emerald-800 shadow-emerald-200/50',
                            icon: <TrendingDown size={28} />
                        },
                        { 
                            label: 'Market Ceiling Value', 
                            value: results.filter(r => r.latestPrice != null).slice(-1)[0]?.latestPrice?.toFixed(4), 
                            currency: results.filter(r => r.latestPrice != null).slice(-1)[0]?.currency, 
                            color: 'from-slate-800 to-slate-900 shadow-slate-300/50',
                            icon: <ArrowUpDown size={28} />
                        },
                        { 
                            label: 'Supplier Concentration', 
                            value: data?.totalSuppliers, 
                            suffix: 'Vetted Suppliers Engaged', 
                            color: 'from-blue-600 to-blue-800 shadow-blue-200/50',
                            icon: <Users size={28} />
                        }
                    ].map((stat, i) => (
                        <div key={i} className={`relative overflow-hidden rounded-[2.5rem] p-10 shadow-2xl bg-gradient-to-br ${stat.color} text-white transition-all hover:scale-[1.03] group`}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all" />
                            <div className="relative z-10 flex flex-col h-full justify-between">
                                <div className="flex items-center justify-between mb-8">
                                    <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-80">{stat.label}</p>
                                    <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-xl border border-white/30 shadow-lg">
                                        {stat.icon}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-5xl font-black tracking-tighter leading-none mb-3">{stat.value ?? '—'}</p>
                                    <p className="text-[11px] font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-white opacity-50" /> {stat.currency || stat.suffix}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WechatCompareView;
