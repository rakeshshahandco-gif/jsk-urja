import React, { useState, useEffect } from 'react';
import { Plus, Search, Tag, Package, ChevronRight, Filter, Download, X, CheckCircle2, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatProducts, createWeChatProduct, api } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import { Input } from '../../../components/ui/Input';
import { cn } from '../../../lib/utils';

const WechatProductsTab = ({ onSelectProduct }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newProduct, setNewProduct] = useState({
        productName: '',
        productCode: '',
        chineseProductName: '',
        category: '',
        status: 'New',
        partNumber: '',
        brandName: '',
        modelNo: '',
        sourceType: 'manual',
        inventoryItemId: null,
        inventoryItemCode: '',
        inventoryItemName: '',
        inventoryItemGroup: '',
    });

    const [itemGroups, setItemGroups] = useState([]);
    const [invSearch, setInvSearch] = useState('');
    const [invResults, setInvResults] = useState([]);
    const [searchingInv, setSearchingInv] = useState(false);
    const [mode, setMode] = useState('manual'); // 'manual' or 'inventory'

    useEffect(() => {
        fetchProducts();
        fetchItemGroups();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (invSearch.trim().length >= 2) {
                handleSearchInventory(invSearch.trim());
            } else {
                setInvResults([]);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [invSearch]);

    const fetchItemGroups = async () => {
        try {
            const res = await api.get('/item-groups');
            setItemGroups(res.data?.data || []);
        } catch (err) { console.error('Failed to load item groups'); }
    };

    const handleSearchInventory = async (q) => {
        try {
            setSearchingInv(true);
            const res = await api.get('/items', { params: { search: q, limit: 10 } });
            setInvResults(res.data?.data || []);
        } catch (err) { console.error('Inv search failed'); }
        finally { setSearchingInv(false); }
    };

    const selectInventoryItem = (item) => {
        setNewProduct({
            ...newProduct,
            productName: item.itemName,
            productCode: item.itemCode,
            category: item.itemGroupName || '',
            partNumber: item.partNumber || '', 
            sourceType: 'inventory',
            inventoryItemId: item._id,
            inventoryItemCode: item.itemCode,
            inventoryItemName: item.itemName,
            inventoryItemGroup: item.itemGroupName || '',
        });
        setMode('inventory');
        setInvResults([]);
        setInvSearch('');
    };

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

    const handleEditProduct = (product) => {
        setEditingId(product._id);
        setIsEditing(true);
        setNewProduct({
            productName: product.productName || '',
            productCode: product.productCode || '',
            chineseProductName: product.chineseProductName || '',
            category: product.category || '',
            status: product.status || 'New',
            partNumber: product.partNumber || '',
            brandName: product.brandName || '',
            modelNo: product.modelNo || '',
            sourceType: product.sourceType || 'manual',
            inventoryItemId: product.inventoryItemId || null,
            inventoryItemCode: product.inventoryItemCode || '',
            inventoryItemName: product.inventoryItemName || '',
            inventoryItemGroup: product.inventoryItemGroup || '',
        });
        setMode(product.sourceType === 'inventory' ? 'inventory' : 'manual');
        setShowAddModal(true);
    };

    const handleDeleteProduct = async (e, id) => {
        e.stopPropagation(); // Don't trigger onSelectProduct
        if (!window.confirm('Are you sure you want to delete this product?')) return;
        
        try {
            await api.delete(`/wechat/products/${id}`);
            toast.success('Product deleted successfully');
            fetchProducts();
        } catch (err) {
            toast.error('Failed to delete product');
        }
    };

    const handleSubmitProduct = async (e) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await api.put(`/wechat/products/${editingId}`, newProduct);
                toast.success('Product updated successfully');
            } else {
                await api.post('/wechat/products', newProduct);
                toast.success('Product created successfully');
            }
            setShowAddModal(false);
            setIsEditing(false);
            setEditingId(null);
            fetchProducts();
            // Reset form
            setNewProduct({
                productName: '',
                productCode: '',
                chineseProductName: '',
                category: '',
                status: 'New',
                partNumber: '',
                brandName: '',
                modelNo: '',
                sourceType: 'manual',
                inventoryItemId: null,
                inventoryItemCode: '',
                inventoryItemName: '',
                inventoryItemGroup: '',
            });
            setMode('manual');
        } catch (err) {
            toast.error(isEditing ? 'Failed to update product' : 'Failed to create product');
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
                    <Button 
                        onClick={() => {
                            setIsEditing(false);
                            setEditingId(null);
                            setNewProduct({
                                productName: '',
                                productCode: '',
                                chineseProductName: '',
                                category: '',
                                status: 'New',
                                partNumber: '',
                                brandName: '',
                                modelNo: '',
                                sourceType: 'manual',
                                inventoryItemId: null,
                                inventoryItemCode: '',
                                inventoryItemName: '',
                                inventoryItemGroup: '',
                            });
                            setMode('manual');
                            setShowAddModal(true);
                        }} 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 px-6"
                    >
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
                    <div className="flex items-center justify-center h-64"><BrandedLoader size={100} /></div>
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
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleEditProduct(product); }}
                                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        title="Edit Product"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                        onClick={(e) => handleDeleteProduct(e, product._id)}
                                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                        title="Delete Product"
                                    >
                                        <Trash2 size={16} />
                                    </button>
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <form onSubmit={handleSubmitProduct} className="bg-white rounded-[2.5rem] w-full max-w-2xl my-8 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{isEditing ? 'Update R&D Product' : 'Add New R&D Product'}</h3>
                                <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">{isEditing ? 'Modify Existing component details' : 'Initialize China-Sourced Component Master'}</p>
                            </div>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button 
                                    type="button"
                                    onClick={() => { setMode('inventory'); setNewProduct(p => ({...p, sourceType: 'inventory'})); }}
                                    className={cn("px-4 py-2 rounded-lg text-xs font-black transition-all", mode === 'inventory' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400")}
                                >
                                    INVENTORY LINK
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => { setMode('manual'); setNewProduct(p => ({...p, sourceType: 'manual', inventoryItemId: null})); }}
                                    className={cn("px-4 py-2 rounded-lg text-xs font-black transition-all", mode === 'manual' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400")}
                                >
                                    MANUAL R&D
                                </button>
                            </div>
                        </div>

                        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {/* Mode A: Inventory Selection */}
                            {mode === 'inventory' && (
                                <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4">
                                    <label className="text-[11px] font-black text-emerald-700 uppercase tracking-widest px-1">Select from Inventory Master</label>
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={18} />
                                        <input 
                                            type="text"
                                            placeholder="Search Code, Name, or HSN..."
                                            value={invSearch}
                                            onChange={(e) => setInvSearch(e.target.value)}
                                            className="w-full pl-12 pr-4 h-14 bg-white border-2 border-emerald-100 rounded-2xl font-bold outline-none focus:border-emerald-500 transition-all shadow-sm"
                                        />
                                        {searchingInv && <div className="absolute right-4 top-1/2 -translate-y-1/2"><BrandedLoader size={20} /></div>}
                                    </div>

                                    {invResults.length > 0 && (
                                        <div className="bg-white border border-emerald-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto mt-2">
                                            {invResults.map(item => (
                                                <button
                                                    key={item._id}
                                                    type="button"
                                                    onClick={() => selectInventoryItem(item)}
                                                    className="w-full text-left p-4 hover:bg-emerald-50 border-b border-slate-50 last:border-0 transition-colors"
                                                >
                                                    <p className="text-sm font-black text-slate-800">{item.itemName}</p>
                                                    <div className="flex gap-2 mt-1">
                                                        <Badge className="bg-slate-100 text-slate-500 text-[9px] uppercase">{item.itemCode}</Badge>
                                                        <Badge className="bg-emerald-100 text-emerald-600 text-[9px] uppercase">{item.itemGroupName}</Badge>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {newProduct.inventoryItemId && (
                                        <div className="flex items-center gap-3 p-3 bg-emerald-100/50 rounded-xl border border-emerald-200">
                                            <CheckCircle2 size={16} className="text-emerald-600" />
                                            <p className="text-xs font-bold text-emerald-800">Linked to: <span className="font-black underline">{newProduct.inventoryItemName}</span> ({newProduct.inventoryItemCode})</p>
                                            <button onClick={() => {
                                                setNewProduct({...newProduct, inventoryItemId: null, sourceType: 'manual'});
                                                setMode('manual');
                                            }} className="ml-auto text-emerald-600 hover:text-red-500"><X size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Input 
                                    label="Product Name *" 
                                    value={newProduct.productName} 
                                    onChange={e => setNewProduct({...newProduct, productName: e.target.value})}
                                    placeholder="e.g. ZT2S Zigbee Module" 
                                    required 
                                />
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block px-1">Product Group</label>
                                    <select 
                                        value={newProduct.category}
                                        onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                                        className="w-full h-12 border-2 border-slate-100 rounded-xl px-4 font-bold outline-none focus:border-emerald-500 transition-all bg-slate-50"
                                    >
                                        <option value="">-- Select Group --</option>
                                        {itemGroups.map(g => <option key={g._id} value={g.name}>{g.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <Input 
                                    label="Part Number" 
                                    value={newProduct.partNumber} 
                                    onChange={e => setNewProduct({...newProduct, partNumber: e.target.value})}
                                    placeholder="e.g. 4N65 / ZT2S" 
                                />
                                <Input 
                                    label="Product Code / Alias" 
                                    value={newProduct.productCode} 
                                    onChange={e => setNewProduct({...newProduct, productCode: e.target.value})}
                                    placeholder="Internal tracking code" 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <Input 
                                    label="Brand / Manufacturer" 
                                    value={newProduct.brandName} 
                                    onChange={e => setNewProduct({...newProduct, brandName: e.target.value})}
                                    placeholder="e.g. TUYA, SILAN" 
                                />
                                <Input 
                                    label="Model Number" 
                                    value={newProduct.modelNo} 
                                    onChange={e => setNewProduct({...newProduct, modelNo: e.target.value})}
                                    placeholder="Manufacturer model" 
                                />
                            </div>

                            <Input 
                                label="Chinese Product Name" 
                                value={newProduct.chineseProductName} 
                                onChange={e => setNewProduct({...newProduct, chineseProductName: e.target.value})}
                                placeholder="e.g. 涂鸦智能模块" 
                            />
                        </div>

                        <div className="p-8 bg-slate-50 flex justify-end gap-4 border-t border-slate-100">
                            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)} className="font-bold rounded-xl px-6">Discard</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-10 h-12 font-black shadow-lg shadow-emerald-100 transition-all active:scale-95">
                                {isEditing ? 'Save Changes' : (newProduct.inventoryItemId ? 'Link & Create Product' : 'Create Manual R&D Product')}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default WechatProductsTab;
