import React, { useState, useEffect } from 'react';
import { 
    Link, Plus, X, Search, Building2, 
    ChevronRight, CheckCircle2, Globe, Tag 
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { api } from '../../../services/weChatApi';
import axios from 'axios';
import { getAuthData } from '../../../utils/auth';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const LinkGroupModal = ({ isOpen, onClose, product, keyword, onLinked }) => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('select'); // 'select', 'link_existing'
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroups, setSelectedGroups] = useState([]);

    useEffect(() => {
        if (mode === 'link_existing') {
            fetchGroups();
        }
    }, [mode]);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const res = await api.get('/wechat/groups', { params: { search: searchTerm } });
            setGroups(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load groups');
        } finally {
            setLoading(false);
        }
    };

    const handleLinkExisting = async () => {
        if (selectedGroups.length === 0) {
            toast.error('Please select at least one group');
            return;
        }

        try {
            setLoading(true);
            
            // Find names of selected groups for more context in logs
            const selectedGroupNames = groups
                .filter(g => selectedGroups.includes(g._id))
                .map(g => g.groupName);

            const payload = {
                productId: product?._id,
                productName: product?.productName,
                groupIds: selectedGroups,
                keyword: keyword,
                selectedGroupName: selectedGroupNames[0], // Primary group name context
                itemId: product?.inventoryItemId,
                itemCode: product?.inventoryItemCode,
                itemName: product?.inventoryItemName
            };
            
            console.log('🔗 Sending Intelligence Link:', payload);
            
            // Call the direct mount point using axios to bypass the /api/v1 prefix
            const authData = getAuthData();
            await axios.post('/api/china-supplier/intelligence/link-existing-group', payload, {
                headers: {
                    Authorization: `Bearer ${authData?.token}`
                }
            });

            toast.success('Product linked with group successfully');
            if (onLinked) onLinked();
            onClose();
        } catch (err) {
            console.error('Linking error:', err);
            let errorMsg = 'Unable to link group. Please try again.';
            if (err.response?.status === 404 || err.response?.data?.message?.includes('LOCKEDDOWN')) {
                errorMsg = 'Unable to link group. Please try again.';
            } else if (err.response?.data?.message) {
                errorMsg = err.response.data.message;
            }
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        navigate('/china-supplier/groups/new', { 
            state: { 
                autoFill: {
                    productName: product.productName,
                    productId: product._id,
                    keywords: keyword ? [keyword] : []
                }
            } 
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                                <Link size={20} />
                            </div>
                            Intelligence Linking
                        </h2>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Link <span className="text-slate-600">"{product.productName}"</span> with keyword <span className="text-slate-600">"{keyword}"</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl text-slate-300 hover:text-slate-900 transition-all shadow-sm">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-10">
                    {mode === 'select' ? (
                        <div className="grid grid-cols-1 gap-6">
                            <button 
                                onClick={() => setMode('link_existing')}
                                className="group flex items-center gap-6 p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] hover:border-blue-400 hover:shadow-xl hover:shadow-blue-50 transition-all text-left"
                            >
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Building2 size={28} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-black text-slate-800">Option A: Link Existing Group</h3>
                                    <p className="text-sm font-bold text-slate-400 mt-1">Search and select from existing WeChat groups in the system.</p>
                                </div>
                                <ChevronRight className="text-slate-200 group-hover:text-blue-400" />
                            </button>

                            <button 
                                onClick={handleCreateNew}
                                className="group flex items-center gap-6 p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-50 transition-all text-left"
                            >
                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Plus size={28} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-black text-slate-800">Option B: Create New Group</h3>
                                    <p className="text-sm font-bold text-slate-400 mt-1">Auto-fill group details with this product and start a new sync.</p>
                                </div>
                                <ChevronRight className="text-slate-200 group-hover:text-emerald-400" />
                            </button>

                            <button 
                                onClick={onClose}
                                className="mt-4 text-center text-sm font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-all"
                            >
                                Option C: Cancel & Return
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-800">Search Existing Groups</h3>
                                <button onClick={() => setMode('select')} className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline">Back to Options</button>
                            </div>
                            
                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                                <Input 
                                    placeholder="Type group name or alias..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchGroups()}
                                    className="pl-14 h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-blue-500 transition-all"
                                />
                                <Button 
                                    onClick={fetchGroups}
                                    isLoading={loading}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white rounded-xl h-10 px-4 text-xs font-black uppercase"
                                >
                                    Search
                                </Button>
                            </div>

                            <div className="max-h-[300px] overflow-auto pr-2 space-y-3 custom-scrollbar">
                                {groups.length === 0 ? (
                                    <div className="py-10 text-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-[2rem]">
                                        No groups found. Try a different search term.
                                    </div>
                                ) : (
                                    groups.map(group => {
                                        const isSelected = selectedGroups.includes(group._id);
                                        return (
                                            <div 
                                                key={group._id}
                                                onClick={() => {
                                                    setSelectedGroups(prev => 
                                                        isSelected ? prev.filter(id => id !== group._id) : [...prev, group._id]
                                                    );
                                                }}
                                                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                                    isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-50 hover:border-slate-200 bg-slate-50/30'
                                                }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                                                        isSelected ? 'bg-blue-500 text-white' : 'bg-white text-slate-400 border border-slate-100'
                                                    }`}>
                                                        {group.groupName[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className={`font-black text-sm ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{group.groupName}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group.groupAlias || 'No Alias'}</p>
                                                    </div>
                                                </div>
                                                {isSelected && <CheckCircle2 className="text-blue-600" size={20} />}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="pt-6 border-t border-slate-100 flex gap-4">
                                <Button 
                                    variant="ghost" 
                                    className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest"
                                    onClick={() => setMode('select')}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-black uppercase tracking-widest shadow-xl shadow-blue-100 transition-all active:scale-95"
                                    onClick={handleLinkExisting}
                                    isLoading={loading}
                                    disabled={selectedGroups.length === 0}
                                >
                                    Link {selectedGroups.length} Group{selectedGroups.length !== 1 ? 's' : ''} Now
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Globe size={14} /> Global Sourcing Data
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Tag size={14} /> Product Intelligence
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LinkGroupModal;
