import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    LayoutDashboard, Package, Users, FlaskConical, Bell, 
    TrendingUp, Globe, Search, X, Tag, Building2, 
    ChevronRight, IndianRupee, Loader2 
} from 'lucide-react';
import { getWeChatDashboardStats, globalWeChatSearch } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import { useNavigate } from 'react-router-dom';

// ── debounce helper ──────────────────────────────────────────────────────────
function useDebounce(value, delay = 350) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// ── small helper: currency symbol ────────────────────────────────────────────
const currencySymbol = (c) => ({ RMB: '¥', USD: '$', INR: '₹' }[c] || c);

const WechatDashboardTab = ({ onNavigate }) => {
    const navigate = useNavigate();

    const [stats, setStats] = useState({
        totalProducts: 0, totalContacts: 0,
        totalGroups: 0, pendingSamples: 0, followUpsDue: 0
    });
    const [loading, setLoading] = useState(true);

    // ── search state ─────────────────────────────────────────────────────────
    const [query, setQuery]           = useState('');
    const [searching, setSearching]   = useState(false);
    const [results, setResults]       = useState(null);   // null = no search yet
    const debouncedQuery              = useDebounce(query, 350);
    const inputRef                    = useRef(null);

    // ── fetch dashboard stats ─────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await getWeChatDashboardStats();
                if (res.data?.data) setStats(res.data.data);
            } catch { /* silent */ } finally { setLoading(false); }
        })();
    }, []);

    // ── run search whenever debounced query changes ──────────────────────────
    useEffect(() => {
        if (!debouncedQuery.trim()) { setResults(null); return; }
        (async () => {
            try {
                setSearching(true);
                const res = await globalWeChatSearch(debouncedQuery.trim());
                setResults(res.data?.data || { products: [], contacts: [], groups: [], prices: [] });
            } catch { setResults({ products: [], contacts: [], groups: [], prices: [] }); }
            finally { setSearching(false); }
        })();
    }, [debouncedQuery]);

    const clearSearch = () => { setQuery(''); setResults(null); inputRef.current?.focus(); };

    const totalHits = results
        ? (results.products?.length || 0) + (results.contacts?.length || 0) + (results.groups?.length || 0)
        : 0;

    const cards = [
        { id: 'products',  title: 'R&D Products',     value: stats.totalProducts, icon: Package,      color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { id: 'contacts',  title: 'Supplier Contacts', value: stats.totalContacts, icon: Users,        color: 'text-blue-600',    bg: 'bg-blue-50' },
        { id: 'samples',   title: 'Pending Samples',   value: stats.pendingSamples,icon: FlaskConical, color: 'text-purple-600',  bg: 'bg-purple-50' },
        { id: 'reminders', title: 'Follow-ups Due',    value: stats.followUpsDue,  icon: Bell,         color: 'text-amber-600',   bg: 'bg-amber-50' },
    ];

    if (loading) return <div className="h-full flex items-center justify-center bg-slate-50/30"><BrandedLoader size={120} /></div>;

    return (
        <div className="h-full p-10 overflow-auto custom-scrollbar bg-slate-50/30">
            {/* Header */}
            <div className="flex items-center justify-between mb-10">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">Supplier Intelligence</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time overview of China sourcing activities</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 font-black px-4 py-2 rounded-xl border-0">SYSTEM ONLINE</Badge>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
                {cards.map((card) => (
                    <div
                        key={card.id}
                        onClick={() => onNavigate(card.id)}
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group"
                    >
                        <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                            <card.icon size={28} />
                        </div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.title}</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter">{card.value}</p>
                    </div>
                ))}
            </div>

            {/* Search + Efficiency Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* ── Search Panel ── */}
                <div className="lg:col-span-2 bg-white rounded-[3rem] border border-slate-100 p-10 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-black text-slate-800">Quick Intelligence Search</h3>
                        <Globe className="text-slate-200" />
                    </div>

                    {/* Input */}
                    <div className="relative mb-6">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search product, part number, contact, group…"
                            className="w-full pl-16 pr-12 py-5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-base outline-none transition-all shadow-inner"
                        />
                        {searching && (
                            <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" size={20} />
                        )}
                        {query && !searching && (
                            <button onClick={clearSearch} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {/* ── Results ── */}
                    {results === null && (
                        /* Default placeholder grid */
                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recent Groups</p>
                                <p className="font-bold text-slate-500 text-sm">Type to search…</p>
                            </div>
                            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Quotes</p>
                                <p className="font-bold text-slate-500 text-sm">Type to search…</p>
                            </div>
                        </div>
                    )}

                    {results !== null && totalHits === 0 && !searching && (
                        <div className="text-center py-10 text-slate-400">
                            <Search size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="font-bold">No results found for "<span className="text-slate-600">{query}</span>"</p>
                        </div>
                    )}

                    {results !== null && totalHits > 0 && (
                        <div className="space-y-6 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">

                            {/* ── Products ── */}
                            {results.products?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Package size={12} /> Products ({results.products.length})
                                    </p>
                                    <div className="space-y-4">
                                        {results.products.map((p) => {
                                            // Merge p.rates with any prices from results.prices for this product
                                            const extraPrices = (results.prices || []).filter(
                                                r => r.productId?._id === p._id || r.productId === p._id
                                            );
                                            const allRates = p.rates?.length > 0 ? p.rates : extraPrices;

                                            // Collect unique groups from all rates for the header chips
                                            const groupsInRates = [];
                                            const seenGroupIds = new Set();
                                            allRates.forEach(r => {
                                                const gid = r.groupId?._id || r.groupId;
                                                const gname = r.groupId?.groupName;
                                                if (gid && gname && !seenGroupIds.has(String(gid))) {
                                                    seenGroupIds.add(String(gid));
                                                    groupsInRates.push({ _id: gid, groupName: gname });
                                                }
                                            });

                                            return (
                                                <div key={p._id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                                    {/* Product header */}
                                                    <div className="p-5 bg-slate-50 border-b border-slate-100">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-black text-slate-800 text-base">{p.productName}</p>
                                                                <div className="flex gap-2 mt-2 flex-wrap">
                                                                    {p.partNumber && <span className="text-[10px] font-black text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">{p.partNumber}</span>}
                                                                    {p.brandName  && <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{p.brandName}</span>}
                                                                    {p.category   && <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg">{p.category}</span>}
                                                                    {p.modelNo    && <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">Model: {p.modelNo}</span>}
                                                                </div>
                                                                {/* Group chips on header when no quote rows */}
                                                                {groupsInRates.length > 0 && (
                                                                    <div className="flex gap-2 mt-3 flex-wrap">
                                                                        <span className="text-[9px] font-black text-slate-400 uppercase">Found in:</span>
                                                                        {groupsInRates.map(g => (
                                                                            <button
                                                                                key={String(g._id)}
                                                                                onClick={() => navigate(`/china-supplier/groups/edit/${g._id}`)}
                                                                                className="text-[10px] font-black text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white px-3 py-1 rounded-lg flex items-center gap-1 transition-all"
                                                                            >
                                                                                {g.groupName} <ChevronRight size={9} />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl shrink-0 ${allRates.length > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>
                                                                {allRates.length} Quote{allRates.length !== 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Quotes table */}
                                                    {allRates.length > 0 ? (
                                                        <div className="divide-y divide-slate-50">
                                                            {/* Table header */}
                                                            <div className="grid grid-cols-7 gap-2 px-5 py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">
                                                                <span className="col-span-2">Group / Supplier</span>
                                                                <span className="text-right">Unit Rate</span>
                                                                <span className="text-right">Exch. Rate</span>
                                                                <span className="text-right">Freight %</span>
                                                                <span className="text-right text-emerald-400">Landing ₹</span>
                                                                <span className="text-right">Action</span>
                                                            </div>
                                                            {allRates.map((r, i) => {
                                                                const groupId = r.groupId?._id || r.groupId;
                                                                const groupName = r.groupId?.groupName || '—';
                                                                return (
                                                                    <div key={i} className="grid grid-cols-7 gap-2 px-5 py-3 hover:bg-slate-50 transition-all items-center">
                                                                        <div className="col-span-2 min-w-0">
                                                                            <p className="font-black text-slate-700 text-[11px] truncate">{groupName}</p>
                                                                            {r.contactId?.weChatDisplayName && (
                                                                                <p className="text-[9px] text-slate-400 truncate">by {r.contactId.weChatDisplayName}</p>
                                                                            )}
                                                                            {r.quotationDate && (
                                                                                <p className="text-[9px] text-slate-400">{new Date(r.quotationDate).toLocaleDateString('en-IN')}</p>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-right font-black text-slate-800 text-[11px]">{currencySymbol(r.currency)}{r.price}</span>
                                                                        <span className="text-right font-bold text-slate-500 text-[11px]">{r.exchangeRate ? `₹${r.exchangeRate}` : '—'}</span>
                                                                        <span className="text-right font-bold text-slate-500 text-[11px]">{r.freightPercent ? `${r.freightPercent}%` : '—'}</span>
                                                                        <span className={`text-right font-black text-[12px] ${r.landingCost > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                                                            {r.landingCost > 0 ? `₹${r.landingCost}` : '—'}
                                                                        </span>
                                                                        {groupId ? (
                                                                            <button
                                                                                onClick={() => navigate(`/china-supplier/groups/edit/${groupId}`)}
                                                                                className="flex items-center justify-end gap-1 text-[9px] font-black text-blue-600 hover:text-white hover:bg-blue-600 px-2 py-1 rounded-lg transition-all"
                                                                            >
                                                                                Open <ChevronRight size={10} />
                                                                            </button>
                                                                        ) : <span />}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="px-5 py-5 flex items-center justify-between">
                                                            <p className="text-[11px] text-slate-400 font-bold italic">No supplier quotes recorded for this product yet.</p>
                                                            <button
                                                                onClick={() => onNavigate('groups')}
                                                                className="text-[10px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                            >
                                                                Go to Groups <ChevronRight size={11} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}



                            {/* ── Groups ── */}
                            {results.groups?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Building2 size={12} /> Groups ({results.groups.length})
                                    </p>
                                    <div className="space-y-4">
                                        {results.groups.map((g) => (
                                            <div key={g._id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                                {/* Group header */}
                                                <div className="p-5 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-black text-slate-800 text-base">{g.groupName}</p>
                                                        {g.chineseGroupName && <p className="text-[11px] text-slate-500">{g.chineseGroupName}</p>}
                                                        {g.purpose && <p className="text-[11px] text-slate-500 mt-1 truncate max-w-[340px]">{g.purpose}</p>}
                                                        <div className="flex gap-2 mt-2 flex-wrap">
                                                            {g.groupSource && <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">{g.groupSource}</span>}
                                                            {g.members?.length > 0 && <span className="text-[9px] font-black text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">{g.members.length} members</span>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => navigate(`/china-supplier/groups/edit/${g._id}`)}
                                                        className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-sm"
                                                    >
                                                        Open Group <ChevronRight size={13} />
                                                    </button>
                                                </div>

                                                {/* Price records inside this group */}
                                                {g.rates?.length > 0 ? (
                                                    <div className="divide-y divide-slate-50">
                                                        <div className="grid grid-cols-7 gap-2 px-5 py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">
                                                            <span className="col-span-2">Product</span>
                                                            <span className="text-right">Unit Rate</span>
                                                            <span className="text-right">Exch. Rate</span>
                                                            <span className="text-right">Freight %</span>
                                                            <span className="text-right text-emerald-400">Landing ₹</span>
                                                            <span className="text-right">MOQ</span>
                                                        </div>
                                                        {g.rates.map((r, i) => (
                                                            <div key={i} className="grid grid-cols-7 gap-2 px-5 py-3 hover:bg-slate-50 transition-all items-center">
                                                                <div className="col-span-2 min-w-0">
                                                                    <p className="font-black text-slate-700 text-[11px] truncate">{r.productName || r.productId?.productName}</p>
                                                                    {r.partNumber && <p className="text-[9px] text-slate-400">{r.partNumber}</p>}
                                                                </div>
                                                                <span className="text-right font-black text-slate-800 text-[11px]">
                                                                    {currencySymbol(r.currency)}{r.price}
                                                                </span>
                                                                <span className="text-right font-bold text-slate-500 text-[11px]">
                                                                    {r.exchangeRate ? `₹${r.exchangeRate}` : '—'}
                                                                </span>
                                                                <span className="text-right font-bold text-slate-500 text-[11px]">
                                                                    {r.freightPercent ? `${r.freightPercent}%` : '—'}
                                                                </span>
                                                                <span className={`text-right font-black text-[12px] ${r.landingCost > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                                                    {r.landingCost > 0 ? `₹${r.landingCost}` : '—'}
                                                                </span>
                                                                <span className="text-right font-bold text-slate-500 text-[11px]">
                                                                    {r.moq || '—'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="px-5 py-4 text-[11px] text-slate-400 font-bold italic">
                                                        No price records for this group yet.
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Contacts ── */}
                            {results.contacts?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Users size={12} /> Contacts ({results.contacts.length})
                                    </p>
                                    <div className="space-y-2">
                                        {results.contacts.map((c) => (
                                            <div key={c._id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4 hover:border-purple-200 hover:bg-purple-50/20 transition-all">
                                                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-black text-slate-600 shrink-0 text-sm">
                                                    {(c.weChatDisplayName || c.englishName || '?')[0].toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-slate-800 text-sm truncate">{c.weChatDisplayName || c.englishName}</p>
                                                    <p className="text-[11px] text-slate-500 truncate">{c.companyName} {c.mobile ? `· ${c.mobile}` : ''}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Efficiency Panel ── */}
                <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl shadow-slate-200 relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12">
                        <TrendingUp size={240} />
                    </div>
                    <h3 className="text-xl font-black mb-6 relative z-10">Sourcing Efficiency</h3>
                    <div className="space-y-8 relative z-10">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase">Sample Approval Rate</span>
                                <span className="text-xs font-black">72%</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-[72%]" />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase">Avg. Lead Time</span>
                                <span className="text-xs font-black">18.5 Days</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 w-[45%]" />
                            </div>
                        </div>
                        <div className="pt-6">
                            <button className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-black text-sm uppercase tracking-widest transition-all">
                                View Full Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WechatDashboardTab;
