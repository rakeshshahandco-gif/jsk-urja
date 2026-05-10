import React, { useState, useEffect } from 'react';
import { 
    BarChart3, TrendingUp, TrendingDown, Users, 
    FlaskConical, MessageSquare, Package, Search,
    ArrowUpRight, ArrowDownRight, Activity, Calendar
} from 'lucide-react';
import { api } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';

const WechatReportsTab = () => {
    const [stats, setStats] = useState(null);
    const [recentPrices, setRecentPrices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReportData();
    }, []);

    const fetchReportData = async () => {
        try {
            setLoading(true);
            const [statsRes, pricesRes] = await Promise.all([
                api.get('/wechat/dashboard/stats'),
                api.get('/wechat/prices?limit=10')
            ]);
            setStats(statsRes.data?.data);
            setRecentPrices(pricesRes.data?.data || []);
        } catch (err) {
            console.error('Failed to load report data', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-24 flex justify-center"><BrandedLoader size={120} /></div>;

    return (
        <div className="p-8 space-y-10 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">China Sourcing Intelligence Report</h2>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Live market data analysis and sourcing activity summary</p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Market Nodes', value: stats?.totalProducts || 0, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Intelligence Groups', value: stats?.totalGroups || 0, icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'R&D Samples', value: stats?.pendingSamples || 0, icon: FlaskConical, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Supplier Network', value: stats?.totalContacts || 0, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
                        <div className={`w-12 h-12 ${s.bg} ${s.color} rounded-2xl flex items-center justify-center mb-6`}>
                            <s.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tight">{s.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Intelligence Log */}
                <div className="lg:col-span-2 bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <Activity className="text-emerald-500" size={20} /> Recent Market Quotes
                        </h3>
                        <Badge className="bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-xl border-0 font-black text-[10px] uppercase">Live Sync</Badge>
                    </div>
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Product / Supplier</th>
                                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Rate (RMB)</th>
                                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Landing (INR)</th>
                                    <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {recentPrices.map(price => (
                                    <tr key={price._id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="font-black text-slate-800 text-sm truncate max-w-[200px]">{price.productId?.productName || price.productName}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{price.contactId?.weChatDisplayName || 'Direct Sourcing'}</span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className="font-black text-slate-600">¥ {price.price.toFixed(3)}</span>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="font-black text-emerald-600">₹ {price.landingCost?.toFixed(2) || '—'}</span>
                                                <span className="text-[9px] font-bold text-slate-400">Total Landed</span>
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                {new Date(price.quotationDate).toLocaleDateString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Market Depth Summary */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-xl shadow-slate-200 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-10 text-slate-400 flex items-center gap-2">
                            <TrendingUp size={16} /> Price Volatility
                        </h3>
                        <div className="space-y-8">
                            <div className="flex items-end gap-4">
                                <p className="text-5xl font-black tracking-tighter">14.50</p>
                                <div className="mb-2">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase flex items-center gap-1">
                                        <ArrowUpRight size={12} /> Standard Exch.
                                    </p>
                                    <p className="text-[11px] font-bold text-slate-500">RMB to INR</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-8 border-t border-slate-800">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Low Range</p>
                                    <p className="text-xl font-black text-emerald-400">¥ 0.15</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">High Range</p>
                                    <p className="text-xl font-black text-blue-400">¥ 1,250</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest mb-6 text-slate-400 flex items-center gap-2">
                            <BarChart3 size={16} /> Logistics Analysis
                        </h3>
                        <div className="space-y-6">
                            {[
                                { label: 'Average Freight %', value: '12.5%', color: 'bg-blue-600' },
                                { label: 'Samples in Transit', value: stats?.pendingSamples || 0, color: 'bg-purple-600' },
                                { label: 'Approved Sources', value: '82%', color: 'bg-emerald-600' },
                            ].map((item, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">{item.label}</span>
                                        <span className="text-sm font-black text-slate-900">{item.value}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${item.color} rounded-full`} style={{ width: typeof item.value === 'string' ? item.value : '100%' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WechatReportsTab;
