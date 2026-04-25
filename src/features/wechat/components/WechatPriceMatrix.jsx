import React, { useState, useEffect } from 'react';
import { getWeChatPrices } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { DollarSign, Package, Clock, TrendingDown, Users } from 'lucide-react';

const WechatPriceMatrix = ({ productId }) => {
    const [prices, setPrices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (productId) fetchPrices();
    }, [productId]);

    const fetchPrices = async () => {
        try {
            setLoading(true);
            const res = await getWeChatPrices({ productId });
            // Group by contact/group and take latest
            setPrices(res.data?.data || []);
        } catch (err) {
            console.error('Failed to load prices for matrix', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400 font-bold">Generating Matrix...</div>;
    if (prices.length === 0) return <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">No quotation data available for comparison.</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <TrendingDown className="text-emerald-500" /> Market Intelligence Matrix
                </h3>
                <Badge className="bg-emerald-50 text-emerald-700 font-black px-4 py-2 rounded-xl border-0">
                    Cheapest: {prices[0]?.currency} {Math.min(...prices.map(p => p.price)).toFixed(2)}
                </Badge>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-slate-200 shadow-xl bg-white">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900 text-white">
                            <th className="p-6 text-[11px] font-black uppercase tracking-widest border-r border-slate-800">Supplier / Source</th>
                            <th className="p-6 text-[11px] font-black uppercase tracking-widest border-r border-slate-800">Latest Price</th>
                            <th className="p-6 text-[11px] font-black uppercase tracking-widest border-r border-slate-800">MOQ</th>
                            <th className="p-6 text-[11px] font-black uppercase tracking-widest border-r border-slate-800">Lead Time</th>
                            <th className="p-6 text-[11px] font-black uppercase tracking-widest">Remarks / Context</th>
                        </tr>
                    </thead>
                    <tbody>
                        {prices.map((price, idx) => (
                            <tr key={price._id} className={`group hover:bg-emerald-50/30 transition-colors ${idx !== prices.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                <td className="p-6 border-r border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-slate-100 rounded-xl text-slate-500 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                            <Users size={18} />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-800">{price.contactId?.weChatDisplayName || 'Unknown'}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{price.groupId?.groupName || 'Direct Chat'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-6 border-r border-slate-100">
                                    <div className="flex flex-col">
                                        <span className="text-2xl font-black text-emerald-700 tracking-tighter">
                                            <span className="text-sm align-top mr-1">{price.currency === 'RMB' ? '¥' : '$'}</span>
                                            {price.price.toFixed(3)}
                                        </span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(price.quotationDate).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="p-6 border-r border-slate-100">
                                    <div className="flex items-center gap-2 text-slate-600 font-bold">
                                        <Package size={14} className="text-slate-300" />
                                        {price.moq} Units
                                    </div>
                                </td>
                                <td className="p-6 border-r border-slate-100">
                                    <div className="flex items-center gap-2 text-slate-600 font-bold">
                                        <Clock size={14} className="text-slate-300" />
                                        {price.leadTimeDays} Days
                                    </div>
                                </td>
                                <td className="p-6 max-w-xs">
                                    <p className="text-xs font-bold text-slate-500 leading-relaxed italic line-clamp-2">"{price.remarks || 'Standard terms and conditions apply.'}"</p>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WechatPriceMatrix;
