import React, { useState, useEffect } from 'react';
import { 
    Save, X, Plus, Trash2, Search, 
    Package, Users, FileText, Camera,
    ArrowLeft, CheckCircle2, AlertCircle,
    Info, DollarSign, Globe, Layers
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import { 
    api 
} from '../../../services/weChatApi';

const WechatGroupCreatePage = () => {
    const navigate = useNavigate();
    const { groupId } = useParams();
    const [activeTab, setActiveTab] = useState('group');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);

    // --- State: Group Details ---
    const [groupDetails, setGroupDetails] = useState({
        groupName: '',
        chineseGroupName: '',
        groupAlias: '',
        groupCreatedBy: '',
        purpose: '',
        groupSource: 'WeChat',
        isActive: true,
        remarks: '',
        location: '',
        address: ''
    });

    // --- Fetch Group Data for Editing ---
    const [liveRates, setLiveRates] = useState({ CNY: null, USD: null });

    useEffect(() => {
        if (groupId) {
            fetchGroupData();
        }
        fetchLiveRates();
    }, [groupId]);

    const fetchLiveRates = async () => {
        try {
            const response = await api.get('/utils/exchange-rates');
            setLiveRates(response.data.data);
        } catch (err) { console.error('Live rate fetch failed', err); }
    };

    const fetchGroupData = async () => {
        try {
            setFetching(true);
            const response = await api.get(`/wechat/groups/${groupId}/deep`);
            const { groupDetails: gd, productRates: pr, members: mb } = response.data.data;
            
            setGroupDetails(gd);
            // Normalize loaded rates to ensure all fields exist (backwards compat)
            const normalizedRates = pr.length > 0 
                ? pr.map(r => ({
                    ...r,
                    id: r._id || r.id || Date.now() + Math.random(),
                    freightPercent: r.freightPercent ?? 0,
                    exchangeRate: r.exchangeRate ?? 1,
                    landingCost: r.landingCost ?? 0,
                }))
                : [{ id: Date.now(), currency: 'RMB', exchangeRate: 1, freightPercent: 0, landingCost: 0 }];
            setProductRates(normalizedRates);
            setMembers(mb.length > 0 ? mb.map(m => ({ ...m, id: m._id || m.id || Date.now() + Math.random() })) : [{ id: Date.now() + 1 }]);
        } catch (err) {
            toast.error('Failed to load group details');
        } finally {
            setFetching(false);
        }
    };

    // --- State: Product Rates ---
    const [productRates, setProductRates] = useState([{
        id: Date.now(),
        productName: '',
        partNumber: '',
        productCategory: '',
        brandName: '',
        modelNo: '',
        specification: '',
        rateRMB: '',
        sampleRateRMB: '',
        bulkRateRMB: '',
        currency: 'RMB',
        exchangeRate: 1,
        freightPercent: 0,
        landingCost: 0,
        moq: '',
        leadTime: '',
        quotedByMember: '', 
        quotationDate: new Date().toISOString().split('T')[0],
        remarks: ''
    }]);

    // --- State: Members ---
    const [members, setMembers] = useState([{
        id: Date.now() + 1,
        weChatDisplayName: '',
        chineseName: '',
        englishName: '',
        weChatId: '',
        mobile: '',
        whatsapp: '',
        email: '',
        companyName: '',
        role: 'Unknown',
        isMainContact: false,
        language: 'Chinese',
        source: 'Group',
        remarks: '',
        location: '',
        address: ''
    }]);

    // --- Tab Configuration ---
    const tabs = [
        { id: 'group', name: 'Group Details', icon: FileText },
        { id: 'products', name: 'Products & Rates', icon: Layers },
        { id: 'members', name: 'Group Members', icon: Users },
    ];

    // --- Actions: Products ---
    const addProductRow = () => {
        setProductRates([...productRates, {
            id: Date.now(),
            productName: '',
            partNumber: '',
            productCategory: '',
            brandName: '',
            modelNo: '',
            specification: '',
            rateRMB: '',
            sampleRateRMB: '',
            bulkRateRMB: '',
            currency: 'RMB',
            exchangeRate: 1,
            freightPercent: 0,
            landingCost: 0,
            moq: '',
            leadTime: '',
            quotedByMember: '',
            quotationDate: new Date().toISOString().split('T')[0],
            remarks: ''
        }]);
    };

    const removeProductRow = (id) => {
        if (productRates.length === 1) return;
        setProductRates(productRates.filter(p => p.id !== id));
    };

    const updateProductRow = (id, field, value) => {
        setProductRates(productRates.map(row => {
            if (row.id === id) {
                const updatedRow = { ...row, [field]: value };
                // Recalculate landing cost when any pricing field changes
                if (['rateRMB', 'exchangeRate', 'freightPercent'].includes(field)) {
                    const rate    = parseFloat(updatedRow.rateRMB)       || 0;
                    const exch    = parseFloat(updatedRow.exchangeRate)   || 0;
                    const freight = parseFloat(updatedRow.freightPercent) || 0;
                    // baseINR = rate × exchangeRate
                    // landingCost = baseINR × (1 + freight%/100)
                    const baseINR = rate * exch;
                    updatedRow.landingCost = Number((baseINR * (1 + freight / 100)).toFixed(5));
                }
                return updatedRow;
            }
            return row;
        }));
    };

    const applyGlobalExchangeRate = (rate) => {
        const parsedRate = parseFloat(rate) || 0;
        if (parsedRate <= 0) return;
        setProductRates(productRates.map(row => {
            const unitRate = parseFloat(row.rateRMB)       || 0;
            const freight  = parseFloat(row.freightPercent) || 0;
            const baseINR  = unitRate * parsedRate;
            return {
                ...row,
                exchangeRate: parsedRate,
                landingCost:  Number((baseINR * (1 + freight / 100)).toFixed(5))
            };
        }));
    };

    // --- Actions: Members ---
    const addMemberRow = () => {
        setMembers([...members, {
            id: Date.now(),
            weChatDisplayName: '',
            chineseName: '',
            englishName: '',
            weChatId: '',
            mobile: '',
            whatsapp: '',
            email: '',
            companyName: '',
            role: 'Unknown',
            isMainContact: false,
            language: 'Chinese',
            source: 'Group',
            remarks: '',
            location: '',
            address: ''
        }]);
    };

    const removeMemberRow = (id) => {
        if (members.length === 1) return;
        setMembers(members.filter(m => m.id !== id));
    };

    const updateMemberRow = (id, field, value) => {
        setMembers(members.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    // --- Final Save ---
    const handleSave = async () => {
        if (!groupDetails.groupName) {
            toast.error('Group Name is required');
            setActiveTab('group');
            return;
        }

        try {
            setLoading(true);
            const payload = {
                groupDetails,
                productRates,
                members
            };

            await api.post('/wechat/groups/deep', payload);
            toast.success(groupId ? 'WeChat Group updated successfully!' : 'WeChat Group created and all records synced!');
            navigate('/china-supplier/groups');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save group');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this group and all its related price records? This cannot be undone.')) return;
        
        try {
            setLoading(true);
            await api.delete(`/wechat/groups/${groupId}`);
            toast.success('Group deleted successfully');
            navigate('/china-supplier/groups');
        } catch (err) {
            toast.error('Failed to delete group');
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <BrandedLoader size={120} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button onClick={() => navigate(-1)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all">
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                                {groupId ? 'Update WeChat Group Intelligence' : 'Create WeChat Group Intelligence'}
                            </h1>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Deep synchronization of group, products, and members</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        {groupId && (
                            <Button 
                                variant="ghost" 
                                className="rounded-xl font-bold px-6 text-red-500 hover:bg-red-50" 
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <Trash2 size={20} className="mr-2" /> Delete Group
                            </Button>
                        )}
                        <Button variant="ghost" className="rounded-xl font-bold px-6" onClick={() => navigate(-1)}>Discard</Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black px-8 py-6 flex items-center gap-3 shadow-xl shadow-emerald-100 transition-all active:scale-95"
                            onClick={handleSave}
                            isLoading={loading}
                        >
                            <Save size={20} /> {groupId ? 'Update & Sync Records' : 'Finalize & Sync All Records'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 max-w-7xl mx-auto w-full p-8 space-y-8">
                {/* Tabs Navigation */}
                <div className="bg-white rounded-[2rem] p-2 border border-slate-200 shadow-sm flex gap-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
                                activeTab === tab.id 
                                    ? 'bg-emerald-50 text-emerald-700 shadow-inner ring-1 ring-emerald-200' 
                                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                            }`}
                        >
                            <tab.icon size={20} />
                            {tab.name}
                        </button>
                    ))}
                </div>

                {/* Tab 1: Group Details */}
                {activeTab === 'group' && (
                    <div className="bg-white rounded-[3rem] p-12 border border-slate-200 shadow-sm space-y-10 animate-in fade-in slide-in-from-bottom-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                            <div className="md:col-span-2 space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Group Name *</label>
                                        <Input 
                                            placeholder="e.g. ZT2S Zigbee Technical Support" 
                                            value={groupDetails.groupName}
                                            onChange={(e) => setGroupDetails({...groupDetails, groupName: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Chinese Name</label>
                                        <Input 
                                            placeholder="e.g. ZT2S技术支持群" 
                                            value={groupDetails.chineseGroupName}
                                            onChange={(e) => setGroupDetails({...groupDetails, chineseGroupName: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all font-chinese"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">English Alias / Short Name</label>
                                        <Input 
                                            placeholder="e.g. ZT2S Tech" 
                                            value={groupDetails.groupAlias}
                                            onChange={(e) => setGroupDetails({...groupDetails, groupAlias: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Created By</label>
                                        <Input 
                                            placeholder="Person who initiated group" 
                                            value={groupDetails.groupCreatedBy}
                                            onChange={(e) => setGroupDetails({...groupDetails, groupCreatedBy: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Location / City</label>
                                        <Input 
                                            placeholder="e.g. Guzhen, Zhongshan" 
                                            value={groupDetails.location}
                                            onChange={(e) => setGroupDetails({...groupDetails, location: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Address</label>
                                        <Input 
                                            placeholder="Detailed factory/office address" 
                                            value={groupDetails.address}
                                            onChange={(e) => setGroupDetails({...groupDetails, address: e.target.value})}
                                            className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-emerald-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Purpose / Remarks</label>
                                    <textarea 
                                        rows={4}
                                        placeholder="Detailed purpose of this group..."
                                        value={groupDetails.purpose}
                                        onChange={(e) => setGroupDetails({...groupDetails, purpose: e.target.value})}
                                        className="w-full p-6 rounded-[2rem] border-2 border-slate-100 font-bold focus:border-emerald-500 outline-none transition-all resize-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Group Source</label>
                                    <select 
                                        className="w-full h-14 bg-white border-2 border-slate-100 rounded-2xl px-4 font-bold outline-none focus:border-emerald-500"
                                        value={groupDetails.groupSource}
                                        onChange={(e) => setGroupDetails({...groupDetails, groupSource: e.target.value})}
                                    >
                                        <option value="WeChat">WeChat</option>
                                        <option value="Alibaba">Alibaba</option>
                                        <option value="Made-in-China">Made-in-China</option>
                                        <option value="Reference">Reference</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="p-8 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center gap-4 text-center">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm border border-slate-100">
                                        <Camera size={32} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-700">Group Screenshot</p>
                                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Upload Chat Screenshot</p>
                                    </div>
                                    <Button variant="outline" className="mt-2 rounded-xl text-xs font-black uppercase tracking-widest">Select File</Button>
                                </div>
                                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div>
                                        <p className="text-sm font-black text-slate-700">Group Status</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{groupDetails.isActive ? 'Active' : 'Inactive'}</p>
                                    </div>
                                    <button 
                                        onClick={() => setGroupDetails({...groupDetails, isActive: !groupDetails.isActive})}
                                        className={`w-14 h-8 rounded-full transition-all relative p-1 ${groupDetails.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all ${groupDetails.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab 2: Products & Rates */}
                {activeTab === 'products' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <div className="flex items-center justify-end mb-4 px-4 gap-4 pt-4">
                                    <div className="flex items-center gap-2 bg-slate-50 p-2 px-4 rounded-xl border border-slate-100">
                                        <span className="text-[10px] font-black uppercase text-slate-400">Quick Tools:</span>
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] font-bold text-slate-500">Global Exch. Rate:</label>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" 
                                                    placeholder="e.g. 14.5"
                                                    className="w-24 h-8 text-[11px] font-bold border-2 border-white rounded-lg px-2 focus:border-emerald-500 outline-none transition-all shadow-sm"
                                                    id="globalExchInput"
                                                    onBlur={(e) => applyGlobalExchangeRate(e.target.value)}
                                                />
                                                {liveRates.CNY && (
                                                    <button 
                                                        onClick={() => {
                                                            const rate = liveRates.CNY.toFixed(2);
                                                            document.getElementById('globalExchInput').value = rate;
                                                            applyGlobalExchangeRate(rate);
                                                            toast.success(`Applied live rate: ₹${rate}`);
                                                        }}
                                                        className="h-8 px-3 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-600 transition-all flex items-center gap-1 shadow-sm"
                                                        title={`Live Rate: ₹${liveRates.CNY.toFixed(4)}`}
                                                    >
                                                        <Globe size={12} /> Use Live (₹{liveRates.CNY.toFixed(2)})
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-900 text-white">
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Product Identity</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Specifications</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Quoted Rates</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Logistics</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Landing Cost (INR)</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Source / Quoted By</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {productRates.map((rate, index) => (
                                            <tr key={rate.id} className="group hover:bg-slate-50/50 transition-all">
                                                <td className="p-6 border-r border-slate-50 min-w-[280px]">
                                                    <div className="space-y-4">
                                                        <Input 
                                                            placeholder="Product Name *" 
                                                            value={rate.productName}
                                                            onChange={(e) => updateProductRow(rate.id, 'productName', e.target.value)}
                                                            className="h-10 text-sm font-black rounded-xl border-slate-100"
                                                        />
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <Input 
                                                                placeholder="Part No." 
                                                                value={rate.partNumber}
                                                                onChange={(e) => updateProductRow(rate.id, 'partNumber', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                            <Input 
                                                                placeholder="Category" 
                                                                value={rate.productCategory}
                                                                onChange={(e) => updateProductRow(rate.id, 'productCategory', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                        <Input 
                                                            placeholder="Brand Name" 
                                                            value={rate.brandName}
                                                            onChange={(e) => updateProductRow(rate.id, 'brandName', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[240px]">
                                                    <div className="space-y-4">
                                                        <Input 
                                                            placeholder="Model No." 
                                                            value={rate.modelNo}
                                                            onChange={(e) => updateProductRow(rate.id, 'modelNo', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                        <textarea 
                                                            placeholder="Full Technical Specification..."
                                                            value={rate.specification}
                                                            onChange={(e) => updateProductRow(rate.id, 'specification', e.target.value)}
                                                            className="w-full p-3 h-24 text-[11px] font-bold rounded-xl border border-slate-200 outline-none focus:border-emerald-500 transition-all resize-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[240px]">
                                                    <div className="space-y-3 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50">
                                                        <div className="flex items-center justify-between mb-1 border-b border-emerald-100/50 pb-2">
                                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Pricing</span>
                                                            <select 
                                                                value={rate.currency}
                                                                onChange={(e) => updateProductRow(rate.id, 'currency', e.target.value)}
                                                                className="text-[10px] font-black bg-white border border-emerald-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer shadow-sm"
                                                            >
                                                                <option value="RMB">RMB (¥)</option>
                                                                <option value="INR">INR (₹)</option>
                                                                <option value="USD">USD ($)</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[9px] font-black text-emerald-600 uppercase w-16">Unit Rate</label>
                                                            <Input 
                                                                type="number"
                                                                value={rate.rateRMB}
                                                                onChange={(e) => updateProductRow(rate.id, 'rateRMB', e.target.value)}
                                                                className="h-9 text-sm font-black text-emerald-800 rounded-lg border-emerald-200 bg-white"
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[9px] font-black text-slate-500 uppercase w-16">Sample</label>
                                                            <Input 
                                                                type="number"
                                                                value={rate.sampleRateRMB}
                                                                onChange={(e) => updateProductRow(rate.id, 'sampleRateRMB', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[9px] font-black text-slate-500 uppercase w-16">Bulk</label>
                                                            <Input 
                                                                type="number"
                                                                value={rate.bulkRateRMB}
                                                                onChange={(e) => updateProductRow(rate.id, 'bulkRateRMB', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[160px]">
                                                    <div className="space-y-4">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MOQ</label>
                                                            <Input 
                                                                value={rate.moq}
                                                                onChange={(e) => updateProductRow(rate.id, 'moq', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Lead Time (d)</label>
                                                            <Input 
                                                                value={rate.leadTime}
                                                                onChange={(e) => updateProductRow(rate.id, 'leadTime', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[200px]">
                                                    <div className="space-y-4">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase">Exch. Rate (₹/unit)</label>
                                                            <Input 
                                                                type="number"
                                                                value={rate.exchangeRate}
                                                                onChange={(e) => updateProductRow(rate.id, 'exchangeRate', e.target.value)}
                                                                className="h-9 text-[11px] font-bold"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase">Freight %</label>
                                                            <div className="relative">
                                                                <Input 
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    step="0.5"
                                                                    value={rate.freightPercent}
                                                                    onChange={(e) => updateProductRow(rate.id, 'freightPercent', e.target.value)}
                                                                    className="h-9 text-[11px] font-bold pr-7"
                                                                />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-400">%</span>
                                                            </div>
                                                        </div>
                                                        <div className="pt-2 border-t border-slate-100 space-y-1">
                                                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                                                                <span>Base INR:</span>
                                                                <span>₹{Number(((parseFloat(rate.rateRMB)||0) * (parseFloat(rate.exchangeRate)||0)).toFixed(4))}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-emerald-700 uppercase">Landing Cost:</span>
                                                                <span className="text-sm font-black text-emerald-600">₹{rate.landingCost}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[180px]">
                                                    <div className="space-y-4">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Quoted By</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2 text-[11px] font-bold outline-none"
                                                                value={rate.quotedByMember}
                                                                onChange={(e) => updateProductRow(rate.id, 'quotedByMember', e.target.value)}
                                                            >
                                                                <option value="">Group Level Price</option>
                                                                {members.filter(m => m.weChatDisplayName).map(m => (
                                                                    <option key={m.id} value={m.weChatDisplayName}>{m.weChatDisplayName}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <Input 
                                                            type="date"
                                                            value={rate.quotationDate}
                                                            onChange={(e) => updateProductRow(rate.id, 'quotationDate', e.target.value)}
                                                            className="h-9 text-[10px] font-bold rounded-lg"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <button 
                                                        onClick={() => removeProductRow(rate.id)}
                                                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex gap-4">
                                    <Button onClick={addProductRow} className="bg-slate-900 text-white rounded-xl text-xs font-black uppercase px-6 h-10 flex items-center gap-2">
                                        <Plus size={16} /> Add Product Row
                                    </Button>
                                    <Button variant="outline" className="rounded-xl text-xs font-black uppercase px-6 h-10 border-2">
                                        <Search size={16} className="mr-2" /> Select Existing Product
                                    </Button>
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                                    <Info size={14} /> Row details will be synced to Product Master & Quotation Mapping
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab 3: Group Members */}
                {activeTab === 'members' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-900 text-white">
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Member Identity</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Contact Intel</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Location & Address</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Role & Level</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 whitespace-nowrap">Source & Context</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {members.map((member, index) => (
                                            <tr key={member.id} className="group hover:bg-slate-50/50 transition-all">
                                                <td className="p-6 border-r border-slate-50 min-w-[280px]">
                                                    <div className="space-y-4">
                                                        <Input 
                                                            placeholder="WeChat Display Name *" 
                                                            value={member.weChatDisplayName}
                                                            onChange={(e) => updateMemberRow(member.id, 'weChatDisplayName', e.target.value)}
                                                            className="h-10 text-sm font-black rounded-xl border-slate-100"
                                                        />
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <Input 
                                                                placeholder="Chinese Name" 
                                                                value={member.chineseName}
                                                                onChange={(e) => updateMemberRow(member.id, 'chineseName', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg font-chinese"
                                                            />
                                                            <Input 
                                                                placeholder="English Name" 
                                                                value={member.englishName}
                                                                onChange={(e) => updateMemberRow(member.id, 'englishName', e.target.value)}
                                                                className="h-9 text-[11px] font-bold rounded-lg"
                                                            />
                                                        </div>
                                                        <Input 
                                                            placeholder="Company Name" 
                                                            value={member.companyName}
                                                            onChange={(e) => updateMemberRow(member.id, 'companyName', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[220px]">
                                                    <div className="space-y-4">
                                                        <Input 
                                                            placeholder="WeChat ID" 
                                                            value={member.weChatId}
                                                            onChange={(e) => updateMemberRow(member.id, 'weChatId', e.target.value)}
                                                            className="h-9 text-[11px] font-black text-blue-600 rounded-lg bg-blue-50/30 border-blue-100"
                                                        />
                                                        <Input 
                                                            placeholder="Mobile No." 
                                                            value={member.mobile}
                                                            onChange={(e) => updateMemberRow(member.id, 'mobile', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                        <Input 
                                                            placeholder="WhatsApp No." 
                                                            value={member.whatsapp}
                                                            onChange={(e) => updateMemberRow(member.id, 'whatsapp', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[220px]">
                                                    <div className="space-y-4">
                                                        <Input 
                                                            placeholder="City / Province" 
                                                            value={member.location}
                                                            onChange={(e) => updateMemberRow(member.id, 'location', e.target.value)}
                                                            className="h-9 text-[11px] font-bold rounded-lg"
                                                        />
                                                        <textarea 
                                                            placeholder="Full Address..."
                                                            value={member.address}
                                                            onChange={(e) => updateMemberRow(member.id, 'address', e.target.value)}
                                                            className="w-full p-3 h-20 text-[11px] font-bold rounded-xl border border-slate-200 outline-none focus:border-emerald-500 transition-all resize-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[180px]">
                                                    <div className="space-y-4">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Role in Group</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2 text-[11px] font-bold outline-none"
                                                                value={member.role}
                                                                onChange={(e) => updateMemberRow(member.id, 'role', e.target.value)}
                                                            >
                                                                <option value="Owner">Owner</option>
                                                                <option value="Sales">Sales</option>
                                                                <option value="Technical">Technical</option>
                                                                <option value="Export">Export</option>
                                                                <option value="Unknown">Unknown</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Main Contact</span>
                                                            <button 
                                                                onClick={() => updateMemberRow(member.id, 'isMainContact', !member.isMainContact)}
                                                                className={`w-10 h-5 rounded-full transition-all relative p-0.5 ${member.isMainContact ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                            >
                                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all ${member.isMainContact ? 'translate-x-5' : 'translate-x-0'}`} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 border-r border-slate-50 min-w-[200px]">
                                                    <div className="space-y-4">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Language</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2 text-[11px] font-bold outline-none"
                                                                value={member.language}
                                                                onChange={(e) => updateMemberRow(member.id, 'language', e.target.value)}
                                                            >
                                                                <option value="Chinese">Chinese</option>
                                                                <option value="English">English</option>
                                                                <option value="Other">Other</option>
                                                            </select>
                                                        </div>
                                                        <textarea 
                                                            placeholder="Remarks / Relationship Context..."
                                                            value={member.remarks}
                                                            onChange={(e) => updateMemberRow(member.id, 'remarks', e.target.value)}
                                                            className="w-full p-3 h-20 text-[11px] font-bold rounded-xl border border-slate-200 outline-none focus:border-emerald-500 transition-all resize-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <button 
                                                        onClick={() => removeMemberRow(member.id)}
                                                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex gap-4">
                                    <Button onClick={addMemberRow} className="bg-slate-900 text-white rounded-xl text-xs font-black uppercase px-6 h-10 flex items-center gap-2">
                                        <Plus size={16} /> Add Member Row
                                    </Button>
                                    <Button variant="outline" className="rounded-xl text-xs font-black uppercase px-6 h-10 border-2">
                                        <Search size={16} className="mr-2" /> Select Existing Contact
                                    </Button>
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                                    <Info size={14} /> Members will be automatically saved to the Individual Contact Master
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Sticky Action (Optional, since header has Save) */}
            <div className="bg-white border-t border-slate-200 px-8 py-4 sticky bottom-0 z-40 hidden md:block shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
                <div className="max-w-7xl mx-auto flex justify-end gap-4">
                    <div className="flex items-center gap-3 mr-auto">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                            <Info size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Creation Mode</p>
                            <p className="text-sm font-bold text-slate-700">Multi-Entity Sync Protocol Active</p>
                        </div>
                    </div>
                    <Button variant="ghost" className="rounded-xl font-bold px-8" onClick={() => navigate(-1)}>Discard Changes</Button>
                    <Button 
                        className="bg-slate-900 hover:bg-black text-white rounded-xl font-black px-12 py-6 shadow-xl shadow-slate-100 transition-all active:scale-95"
                        onClick={handleSave}
                        isLoading={loading}
                    >
                        Sync All Master Data
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default WechatGroupCreatePage;
