import React, { useState, useEffect } from 'react';
import { 
    ChevronLeft, Globe, Tag, DollarSign, Users, 
    MessageSquare, FlaskConical, FileText, StickyNote,
    TrendingUp, ArrowRight, Download
} from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import WechatPriceHistoryTab from '../components/WechatPriceHistoryTab';
import WechatSamplesTab from '../components/WechatSamplesTab';
import WechatPriceMatrix from '../components/WechatPriceMatrix';

const WechatProductDetailsPage = ({ product, onBack }) => {
    const [activeTab, setActiveTab] = useState('overview');

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
                                            <p className="text-xs font-bold text-slate-500 mb-1">Average Price</p>
                                            <p className="text-3xl font-black text-emerald-400">¥ 4.25 - 5.10</p>
                                        </div>
                                        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                                            <span className="text-xs font-bold text-slate-500">Active Suppliers</span>
                                            <span className="text-lg font-black text-white">4</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">Sample Success</span>
                                            <span className="text-lg font-black text-emerald-400">85%</span>
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
            default:
                return (
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 p-20 text-center text-slate-400 font-bold italic">
                        Tab "{activeTab}" is currently being optimized for intelligence gathering.
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
                            <span className="text-emerald-500">Last updated: 2 days ago</span>
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
        </div>
    );
};

export default WechatProductDetailsPage;
