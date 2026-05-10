import React, { useState, useEffect } from 'react';
import { Search, Tag, Package, ChevronRight, ArrowUpDown, TrendingDown, Building2, Globe } from 'lucide-react';
import { getWeChatProducts } from '../../../services/weChatApi';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import WechatCompareView from './WechatCompareView';

const WechatPricesTab = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const res = await getWeChatProducts({ search: searchTerm });
            setProducts(res.data?.data || []);
        } catch (err) {
            console.error('Failed to load products', err);
        } finally {
            setLoading(false);
        }
    };

    if (selectedProduct) {
        return (
            <div className="p-8 animate-in slide-in-from-right duration-500">
                <button 
                    onClick={() => setSelectedProduct(null)}
                    className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black text-[10px] uppercase tracking-[0.2em] mb-8 transition-all group"
                >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-slate-200">
                        <ChevronRight className="rotate-180" size={14} />
                    </div>
                    Back to Product List
                </button>
                <WechatCompareView 
                    productId={selectedProduct._id}
                    partNumber={selectedProduct.productName} 
                    productCategory={selectedProduct.category} 
                />
            </div>
        );
    }

    return (
        <div className="p-8 h-full flex flex-col gap-10 overflow-hidden bg-slate-50/50">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Global Price Intelligence</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Aggregated Supplier Quotations & Market Depth Analysis</p>
                </div>
                <div className="bg-white p-4 rounded-[1.5rem] border-2 border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <TrendingDown size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Market State</p>
                        <p className="text-sm font-black text-slate-800">OPTIMIZED</p>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative group max-w-2xl">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={24} />
                <input
                    type="text"
                    placeholder="Search product master to compare supplier rates…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchProducts()}
                    className="w-full pl-16 pr-6 py-6 bg-white border-2 border-slate-100 focus:border-emerald-500 rounded-[2rem] font-bold text-lg outline-none transition-all shadow-xl shadow-slate-200/50 placeholder:text-slate-300"
                />
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar pr-4 -mx-2 px-2 pb-10">
                {loading ? (
                    <div className="flex items-center justify-center h-64"><BrandedLoader size={120} /></div>
                ) : products.length === 0 ? (
                    <div className="bg-white rounded-[3rem] border-2 border-dashed border-slate-200 h-96 flex flex-col items-center justify-center text-slate-300 text-center p-10">
                        <Package size={64} className="mb-6 opacity-20" />
                        <p className="text-xl font-black text-slate-400">No Intelligence Nodes Found</p>
                        <p className="text-sm font-bold text-slate-300 mt-2">Initialize products in the R&D tab to start comparing prices</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {products.map(product => (
                            <div 
                                key={product._id} 
                                onClick={() => setSelectedProduct(product)}
                                className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl hover:border-emerald-400 transition-all cursor-pointer group relative overflow-hidden flex flex-col h-full"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                    <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                                        <ArrowUpDown size={20} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-5 mb-8">
                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all duration-300">
                                        <Tag size={28} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{product.category}</p>
                                        <h4 className="text-xl font-black text-slate-800 leading-tight truncate">{product.productName}</h4>
                                    </div>
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between py-3 border-b border-slate-50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Market Status</span>
                                        <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">Active Tracking</span>
                                    </div>
                                    <div className="flex items-center justify-between py-3 border-b border-slate-50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Intelligence Depth</span>
                                        <span className="text-[11px] font-black text-slate-600 italic">Deep Sync Enabled</span>
                                    </div>
                                </div>

                                <div className="mt-8 flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-emerald-600 group-hover:border-emerald-600 group-hover:text-white transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Compare Now</span>
                                    <ChevronRight size={16} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WechatPricesTab;
