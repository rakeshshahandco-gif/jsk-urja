import React, { useState, useEffect } from 'react';
import { 
    ChevronLeft, Globe, Tag, DollarSign, Users, 
    MessageSquare, FlaskConical, FileText, StickyNote,
    TrendingUp, ArrowRight, Download, Link, ChevronRight
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import WechatPriceHistoryTab from '../components/WechatPriceHistoryTab';
import WechatSamplesTab from '../components/WechatSamplesTab';
import WechatPriceMatrix from '../components/WechatPriceMatrix';
import LinkGroupModal from '../components/LinkGroupModal';
import { api } from '../../../services/weChatApi';
import { toast } from 'react-hot-toast';

const WechatProductDetailsPage = ({ product: initialProduct, onBack }) => {
    const [product, setProduct] = useState(initialProduct);
    const [activeTab, setActiveTab] = useState('overview');
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [stats, setStats] = useState({
        avgPrice: 0,
        priceMin: 0,
        priceMax: 0,
        supplierCount: 0,
        sampleSuccessRate: 0,
        lastUpdate: null
    });

    useEffect(() => {
        setProduct(initialProduct);
        if (initialProduct?._id) fetchProductStats(initialProduct._id);
    }, [initialProduct]);

    const fetchProductStats = async (pId) => {
        try {
            const [pricesRes, samplesRes] = await Promise.all([
                api.get(`/wechat/prices?productId=${pId}`),
                api.get(`/wechat/samples?productId=${pId}`)
            ]);
            
            const prices = pricesRes.data?.data || [];
            const samples = samplesRes.data?.data || [];
            
            const validPrices = prices.map(p => p.price).filter(p => p > 0);
            const avg = validPrices.length ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;
            const min = validPrices.length ? Math.min(...validPrices) : 0;
            const max = validPrices.length ? Math.max(...validPrices) : 0;
            
            const approved = samples.filter(s => s.testingStatus === 'Approved').length;
            const totalTested = samples.filter(s => ['Approved', 'Failed'].includes(s.testingStatus)).length;
            const successRate = totalTested ? Math.round((approved / totalTested) * 100) : 0;

            setStats({
                avgPrice: avg,
                priceMin: min,
                priceMax: max,
                supplierCount: new Set(prices.map(p => p.contactId?._id)).size,
                sampleSuccessRate: successRate,
                lastUpdate: prices.length ? prices[0].updatedAt : null
            });
        } catch (err) { console.error('Failed to fetch stats'); }
    };

    const refreshProduct = async () => {
        try {
            const res = await api.get(`/wechat/products/${product._id}`);
            setProduct(res.data?.data);
        } catch (err) { console.error('Failed to refresh product'); }
    };

    if (!product) return null;

    const tabs = [
        { id: 'overview', name: 'Overview', icon: FileText },
        { id: 'suppliers', name: 'Suppliers', icon: Users },
        { id: 'groups', name: 'WeChat Groups', icon: MessageSquare },
        { id: 'prices', name: 'Price Comparison', icon: DollarSign },
        { id: 'samples', name: 'Samples History', icon: FlaskConical },
        { id: 'followups', name: 'Follow-ups', icon: StickyNote },
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="col-span-2 space-y-6">
                                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                                    <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> Engineering Specifications
                                    </h3>
                                    <div className="grid grid-cols-2 gap-8">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Chinese Product Name</p>
                                            <p className="text-xl font-bold text-slate-800 font-chinese">{product.chineseProductName || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Category</p>
                                            <p className="text-xl font-bold text-slate-800">{product.category}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Description / Notes</p>
                                            <p className="text-base font-bold text-slate-600 leading-relaxed">{product.description || 'No detailed description available for this product master record.'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-slate-200">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Latest Market Intel</p>
                                    <div className="space-y-6">
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 mb-1">Market Price Range</p>
                                            <p className="text-3xl font-black text-emerald-400">
                                                {stats.priceMin > 0 ? `¥ ${stats.priceMin.toFixed(2)} - ${stats.priceMax.toFixed(2)}` : 'No Data'}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Avg: ¥ {stats.avgPrice.toFixed(2)}</p>
                                        </div>
                                        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                                            <span className="text-xs font-bold text-slate-500">Active Suppliers</span>
                                            <span className="text-lg font-black text-white">{stats.supplierCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">Sample Success</span>
                                            <span className={cn("text-lg font-black", stats.sampleSuccessRate > 50 ? "text-emerald-400" : "text-amber-400")}>
                                                {stats.sampleSuccessRate}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'prices':
                return <WechatPriceMatrix productId={product._id} />;
            case 'samples':
                return <WechatSamplesTab productId={product._id} />;
            case 'groups':
                return (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">Intelligence Sourcing Groups</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Direct links to WeChat supplier discussions and quotes</p>
                            </div>
                            <div className="flex gap-4">
                                <Button 
                                    onClick={() => setIsLinkModalOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
                                >
                                    <Link size={18} /> Link Existing Group
                                </Button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(product.wechatGroupIds || []).map(group => (
                                <div 
                                    key={group._id} 
                                    className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-400 transition-all cursor-pointer group relative overflow-hidden"
                                >
                                    <div className="flex items-center gap-5 mb-6">
                                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-black text-xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                                            {group.groupName?.[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-slate-800 text-lg truncate leading-tight">{group.groupName}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{group.groupAlias || 'No Alias'}</p>
                                        </div>
                                        <ChevronRight className="text-slate-200 group-hover:text-emerald-400" />
                                    </div>
                                    
                                    <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                                        <div className="flex gap-2">
                                            <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-100 text-slate-400 bg-slate-50 px-2">Group Chat</Badge>
                                        </div>
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (window.confirm('Unlink this group? (The group itself will not be deleted)')) {
                                                    try {
                                                        // Remove group from product
                                                        await api.put(`/wechat/products/${product._id}`, {
                                                            $pull: { wechatGroupIds: group._id }
                                                        });
                                                        // Remove product from group
                                                        await api.put(`/wechat/groups/${group._id}`, {
                                                            $pull: { productIds: product._id }
                                                        });
                                                        toast.success('Link removed successfully');
                                                        refreshProduct();
                                                    } catch (err) { toast.error('Failed to remove link'); }
                                                }
                                            }}
                                            className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest transition-all"
                                        >
                                            Remove Link
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {(product.wechatGroupIds || []).length === 0 && (
                                <div className="col-span-full py-24 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                                    <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center text-slate-200 shadow-sm border border-slate-100 mb-6">
                                        <MessageSquare size={40} />
                                    </div>
                                    <h4 className="text-xl font-black text-slate-800 mb-2">No Linked Intelligence</h4>
                                    <p className="text-slate-400 font-bold italic max-w-sm mb-8">This product is not yet linked with any WeChat sourcing groups for market intelligence.</p>
                                    <div className="flex gap-4">
                                        <Button onClick={() => setIsLinkModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold px-8 h-14 shadow-xl shadow-blue-100">
                                            Link Existing Group
                                        </Button>
                                        <Button 
                                            onClick={() => setIsLinkModalOpen(true)} // Modal handles both
                                            variant="outline" 
                                            className="bg-white border-2 border-slate-200 rounded-xl font-bold px-8 h-14"
                                        >
                                            Create Sourcing Group
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50/50">
            {/* Top Navigation / Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-900">
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{product.productName}</h2>
                            <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] font-black uppercase px-3 py-1 rounded-lg">
                                {product.productCode}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><Tag size={12} /> {product.category}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="text-emerald-500">
                                {stats.lastUpdate ? `Last price sync: ${new Date(stats.lastUpdate).toLocaleDateString()}` : 'No market sync yet'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="rounded-xl border-2 font-bold flex items-center gap-2">
                        <Download size={18} /> Export Profile
                    </Button>
                    <Button className="bg-slate-900 hover:bg-black text-white rounded-xl font-bold flex items-center gap-2 px-6 shadow-lg shadow-slate-200">
                        Edit Product
                    </Button>
                </div>
            </div>

            {/* Inner Tabs Navigation */}
            <div className="px-8 pt-4 bg-white border-b border-slate-200">
                <div className="flex gap-8 overflow-x-auto no-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-4 px-1 text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${
                                activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <tab.icon size={16} />
                            {tab.name}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-full shadow-lg shadow-emerald-200" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                {renderTabContent()}
            </div>

            {/* Link Modal */}
            <LinkGroupModal 
                isOpen={isLinkModalOpen}
                onClose={() => setIsLinkModalOpen(false)}
                product={product}
                keyword={product.productName}
                onLinked={refreshProduct}
            />
        </div>
    );
};

export default WechatProductDetailsPage;
