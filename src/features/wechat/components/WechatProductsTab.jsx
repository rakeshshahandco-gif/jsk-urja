import React, { useState, useEffect } from 'react';
import { Plus, Search, Tag, Package, ChevronRight, Filter, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatProducts, createWeChatProduct } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

const CATEGORIES = ['Zigbee', 'Bluetooth', 'WiFi', 'Enclosure', 'Relay', 'Sensor', 'Power Supply', 'Other'];

const WechatProductsTab = ({ onSelectProduct }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newProduct, setNewProduct] = useState({
        productName: '',
        productCode: '',
        chineseProductName: '',
        category: 'Zigbee',
        status: 'New'
    });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const res = await getWeChatProducts({ search: searchTerm });
            setProducts(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProduct = async (e) => {
        e.preventDefault();
        try {
            await createWeChatProduct(newProduct);
            toast.success('Product created successfully');
            setShowAddModal(false);
            fetchProducts();
        } catch (err) {
            toast.error('Failed to create product');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Approved': return 'bg-emerald-100 text-emerald-700';
            case 'Under R&D': return 'bg-blue-100 text-blue-700';
            case 'Sample Ordered': return 'bg-purple-100 text-purple-700';
            case 'Rejected': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Product Master (R&D)</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Track China-sourced components and modules</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="rounded-xl border-2 font-bold flex items-center gap-2">
                        <Download size={18} /> Import
                    </Button>
                    <Button onClick={() => setShowAddModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 px-6">
                        <Plus size={20} /> Add Product
                    </Button>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex gap-4 items-center shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search product name, code, or chinese name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchProducts()}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-xl font-bold outline-none transition-all"
                    />
                </div>
                <Button variant="ghost" onClick={fetchProducts} className="rounded-xl font-bold">Search</Button>
            </div>

            {/* Product Grid/List */}
            <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-slate-400 font-bold">Loading products...</div>
                ) : products.length === 0 ? (
                    <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 h-64 flex flex-col items-center justify-center text-slate-400">
                        <Package size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">No products found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {products.map(product => (
                            <div 
                                key={product._id} 
                                onClick={() => onSelectProduct(product)}
                                className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:shadow-xl hover:border-emerald-200 transition-all cursor-pointer group relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="text-emerald-500" />
                                </div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <Tag size={24} />
                                    </div>
                                    <div>
                                        <Badge className={`text-[10px] font-black uppercase tracking-widest ${getStatusColor(product.status)}`}>
                                            {product.status}
                                        </Badge>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{product.category}</p>
                                    </div>
                                </div>
                                <h4 className="text-xl font-black text-slate-800 leading-tight mb-1">{product.productName}</h4>
                                <p className="text-sm font-bold text-slate-500 mb-2">{product.productCode}</p>
                                {product.chineseProductName && (
                                    <p className="text-sm font-medium text-slate-400 font-chinese">{product.chineseProductName}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Product Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <form onSubmit={handleCreateProduct} className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-2xl font-black text-slate-800">Add New R&D Product</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Initialize China-Sourced Component Master</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <Input 
                                label="Product Name *" 
                                value={newProduct.productName} 
                                onChange={e => setNewProduct({...newProduct, productName: e.target.value})}
                                placeholder="e.g. ZT2S Zigbee Module" 
                                required 
                            />
                            <div className="grid grid-cols-2 gap-6">
                                <Input 
                                    label="Product Code" 
                                    value={newProduct.productCode} 
                                    onChange={e => setNewProduct({...newProduct, productCode: e.target.value})}
                                    placeholder="e.g. ZT2S-001" 
                                />
                                <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Category</label>
                                    <select 
                                        value={newProduct.category}
                                        onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                                        className="w-full h-12 border-2 border-slate-100 rounded-xl px-4 font-bold outline-none focus:border-emerald-500 transition-all bg-slate-50"
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <Input 
                                label="Chinese Product Name" 
                                value={newProduct.chineseProductName} 
                                onChange={e => setNewProduct({...newProduct, chineseProductName: e.target.value})}
                                placeholder="e.g. 涂鸦智能模块" 
                            />
                        </div>
                        <div className="p-8 bg-slate-50 flex justify-end gap-4">
                            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)} className="font-bold">Cancel</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-8 font-black shadow-lg shadow-emerald-100">Create Product</Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default WechatProductsTab;
