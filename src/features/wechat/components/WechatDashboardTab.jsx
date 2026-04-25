import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Package, Users, FlaskConical, Bell, TrendingUp, Globe, Search } from 'lucide-react';
import { getWeChatDashboardStats } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';

const WechatDashboardTab = ({ onNavigate }) => {
    const [stats, setStats] = useState({
        totalProducts: 0,
        totalContacts: 0,
        totalGroups: 0,
        pendingSamples: 0,
        followUpsDue: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await getWeChatDashboardStats();
            if (res.data?.data) setStats(res.data.data);
        } catch (err) {
            console.error('Failed to load dashboard stats', err);
        } finally {
            setLoading(false);
        }
    };

    const cards = [
        { id: 'products', title: 'R&D Products', value: stats.totalProducts, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { id: 'contacts', title: 'Supplier Contacts', value: stats.totalContacts, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'samples', title: 'Pending Samples', value: stats.pendingSamples, icon: FlaskConical, color: 'text-purple-600', bg: 'bg-purple-50' },
        { id: 'reminders', title: 'Follow-ups Due', value: stats.followUpsDue, icon: Bell, color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    return (
        <div className="h-full p-10 overflow-auto custom-scrollbar bg-slate-50/30">
            <div className="flex items-center justify-between mb-10">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">Supplier Intelligence</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time overview of China sourcing activities</p>
                </div>
                <div className="flex gap-3">
                    <Badge className="bg-emerald-50 text-emerald-700 font-black px-4 py-2 rounded-xl border-0">SYSTEM ONLINE</Badge>
                </div>
            </div>

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[3rem] border border-slate-100 p-10 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-black text-slate-800">Quick Intelligence Search</h3>
                        <Globe className="text-slate-200" />
                    </div>
                    <div className="relative mb-8">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                        <input 
                            type="text" 
                            placeholder="Enter Product Part Number (e.g. ZT2S)..." 
                            className="w-full pl-16 pr-8 py-5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-lg outline-none transition-all shadow-inner"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recent Groups</p>
                            <p className="font-bold text-slate-600">No recent activity</p>
                        </div>
                        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Quotes</p>
                            <p className="font-bold text-slate-600">No active quotes</p>
                        </div>
                    </div>
                </div>

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
