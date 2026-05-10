import React, { useState, useEffect } from 'react';
import { Plus, Search, FlaskConical, Calendar, Truck, CheckCircle2, XCircle, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatSamples, createWeChatSample } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';
import { Input } from '../../../components/ui/Input';
import SearchableSelect from '../../../components/ui/SearchableSelect';
import { api } from '../../../services/weChatApi';
import { User } from 'lucide-react';

const TESTING_STATUSES = ['Pending', 'Under Testing', 'Approved', 'Failed', 'Hold'];

const WechatSamplesTab = ({ onSelectSample }) => {
    const [samples, setSamples] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSample, setNewSample] = useState({
        productId: '',
        contactId: '',
        orderedDate: new Date().toISOString().split('T')[0],
        quantity: 1,
        samplePrice: 0,
        currency: 'RMB',
        courierName: '',
        trackingNumber: '',
        testingStatus: 'Pending',
        remarks: ''
    });

    const [availableProducts, setAvailableProducts] = useState([]);
    const [availableContacts, setAvailableContacts] = useState([]);

    useEffect(() => {
        fetchSamples();
        fetchDropdownData();
    }, []);

    const fetchDropdownData = async () => {
        try {
            const [prodRes, contRes] = await Promise.all([
                api.get('/wechat/products'),
                api.get('/wechat/contacts')
            ]);
            setAvailableProducts(prodRes.data?.data || []);
            setAvailableContacts(contRes.data?.data || []);
        } catch (err) {
            console.error('Failed to load dropdown data', err);
        }
    };

    const fetchSamples = async () => {
        try {
            setLoading(true);
            const res = await getWeChatSamples({ search: searchTerm });
            setSamples(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load samples');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSample = async () => {
        if (!newSample.productId || !newSample.contactId) {
            toast.error('Product and Supplier are required');
            return;
        }

        try {
            setLoading(true);
            await createWeChatSample(newSample);
            toast.success('Sample recorded successfully');
            setShowAddModal(false);
            fetchSamples();
            // Reset form
            setNewSample({
                productId: '',
                contactId: '',
                orderedDate: new Date().toISOString().split('T')[0],
                quantity: 1,
                samplePrice: 0,
                currency: 'RMB',
                courierName: '',
                trackingNumber: '',
                testingStatus: 'Pending',
                remarks: ''
            });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save sample');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Approved': return <CheckCircle2 size={16} className="text-emerald-500" />;
            case 'Failed': return <XCircle size={16} className="text-red-500" />;
            case 'Under Testing': return <Clock size={16} className="text-blue-500" />;
            case 'Hold': return <AlertCircle size={16} className="text-amber-500" />;
            default: return <Clock size={16} className="text-slate-400" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Approved': return 'bg-emerald-100 text-emerald-700';
            case 'Failed': return 'bg-red-100 text-red-700';
            case 'Under Testing': return 'bg-blue-100 text-blue-700';
            case 'Hold': return 'bg-amber-100 text-amber-700';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Sample Tracking</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Monitor R&D samples from ordering to approval</p>
                </div>
                <Button onClick={() => setShowAddModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 px-6 shadow-lg shadow-purple-100">
                    <Plus size={20} /> Record Sample
                </Button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex gap-4 items-center shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search by tracking number, product or supplier..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchSamples()}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-purple-300 rounded-xl font-bold outline-none transition-all"
                    />
                </div>
                <Button variant="ghost" onClick={fetchSamples} className="rounded-xl font-bold text-purple-600">Search</Button>
            </div>

            {/* Samples List */}
            <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-64"><BrandedLoader size={100} /></div>
                ) : samples.length === 0 ? (
                    <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 h-64 flex flex-col items-center justify-center text-slate-400">
                        <FlaskConical size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">No samples recorded</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {samples.map(sample => (
                            <div 
                                key={sample._id} 
                                onClick={() => onSelectSample(sample)}
                                className="bg-white border border-slate-100 rounded-[2rem] p-6 hover:shadow-xl hover:border-purple-200 transition-all cursor-pointer group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-6 flex-1">
                                    <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                                        <FlaskConical size={24} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h4 className="text-xl font-black text-slate-800 truncate">{sample.productId?.productName || 'Unknown Product'}</h4>
                                            <Badge className={`text-[10px] font-black uppercase flex items-center gap-1.5 px-3 py-1 rounded-lg ${getStatusColor(sample.testingStatus)}`}>
                                                {getStatusIcon(sample.testingStatus)} {sample.testingStatus}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                            <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(sample.orderedDate).toLocaleDateString()}</span>
                                            <span className="flex items-center gap-1"><User size={12} /> {sample.contactId?.weChatDisplayName || 'No Contact'}</span>
                                            {sample.trackingNumber && <span className="flex items-center gap-1 text-purple-600"><Truck size={12} /> {sample.trackingNumber}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-8 ml-6">
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</p>
                                        <p className="text-lg font-black text-slate-800">{sample.quantity} Pcs</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Testing</p>
                                        <p className="text-sm font-bold text-slate-500">{sample.receivedDate ? 'Received' : 'In Transit'}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-purple-600 group-hover:text-white transition-all">
                                        <ChevronRight size={20} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Sample Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800">Record R&D Sample</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Order tracking and testing status</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400">
                                <XCircle size={24} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2 col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Product Identity *</label>
                                <SearchableSelect 
                                    options={availableProducts.map(p => ({ value: p._id, label: p.productName, meta: p.partNumber }))}
                                    value={newSample.productId}
                                    onChange={(val) => setNewSample({...newSample, productId: val})}
                                    placeholder="Select Product..."
                                    style={{ height: '56px' }}
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Supplier / Contact *</label>
                                <SearchableSelect 
                                    options={availableContacts.map(c => ({ value: c._id, label: c.weChatDisplayName, meta: c.companyName }))}
                                    value={newSample.contactId}
                                    onChange={(val) => setNewSample({...newSample, contactId: val})}
                                    placeholder="Select Supplier..."
                                    style={{ height: '56px' }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Ordered Date</label>
                                <Input 
                                    type="date"
                                    value={newSample.orderedDate}
                                    onChange={(e) => setNewSample({...newSample, orderedDate: e.target.value})}
                                    className="h-14 rounded-2xl border-2 border-slate-100 font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Quantity</label>
                                <Input 
                                    type="number"
                                    value={newSample.quantity}
                                    onChange={(e) => setNewSample({...newSample, quantity: e.target.value})}
                                    className="h-14 rounded-2xl border-2 border-slate-100 font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Courier Name</label>
                                <Input 
                                    placeholder="SF Express, DHL, etc."
                                    value={newSample.courierName}
                                    onChange={(e) => setNewSample({...newSample, courierName: e.target.value})}
                                    className="h-14 rounded-2xl border-2 border-slate-100 font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Tracking Number</label>
                                <Input 
                                    placeholder="Tracking ID"
                                    value={newSample.trackingNumber}
                                    onChange={(e) => setNewSample({...newSample, trackingNumber: e.target.value})}
                                    className="h-14 rounded-2xl border-2 border-slate-100 font-bold"
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Internal Remarks</label>
                                <textarea 
                                    rows={3}
                                    placeholder="Testing parameters, priority, etc."
                                    value={newSample.remarks}
                                    onChange={(e) => setNewSample({...newSample, remarks: e.target.value})}
                                    className="w-full p-4 rounded-2xl border-2 border-slate-100 font-bold focus:border-purple-500 outline-none transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 mt-10">
                            <Button variant="ghost" onClick={() => setShowAddModal(false)} className="rounded-xl px-8 font-bold">Cancel</Button>
                            <Button 
                                onClick={handleSaveSample} 
                                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-12 h-14 font-black shadow-xl shadow-purple-100"
                                isLoading={loading}
                            >
                                Save Sample Record
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WechatSamplesTab;
