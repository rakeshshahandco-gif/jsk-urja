import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
    createWeChatContact, 
    updateWeChatContact, 
    getWeChatGroups,
    uploadWeChatAttachment
} from '../../../services/weChatApi';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { 
    X, Plus, Star, MessageCircle, Building2, 
    Globe, Phone, Mail, Tag, Layout, 
    FileText, Upload, Briefcase, User, Package,
    Image as ImageIcon
} from 'lucide-react';

const WechatContactForm = ({ contact, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        contactType: 'Individual',
        weChatDisplayName: '',
        englishName: '',
        chineseName: '',
        searchName: '',
        shortCode: '',
        searchKeywords: [],
        companyName: '',
        contactPersonName: '',
        mobile: '',
        weChatId: '',
        email: '',
        region: '',
        channelName: '',
        country: 'China',
        city: '',
        productKeywords: [],
        relatedItems: [],
        businessCategory: '',
        supplierType: '',
        groupIds: [],
        notes: '',
        isFavorite: false
    });

    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState([]);
    const [tempInputs, setTempInputs] = useState({ keyword: '', item: '', searchKw: '' });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const res = await getWeChatGroups();
                setGroups(Array.isArray(res.data?.data) ? res.data.data : []);
            } catch (error) {
                setGroups([]);
            }
        };
        fetchGroups();

        if (contact) {
            setFormData({
                ...contact,
                searchKeywords: contact.searchKeywords || [],
                productKeywords: contact.productKeywords || [],
                relatedItems: contact.relatedItems || [],
                groupIds: contact.groupIds?.map(g => typeof g === 'object' ? g._id : g) || []
            });
        }
    }, [contact]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const addArrayItem = (field, tempKey) => {
        const val = tempInputs[tempKey].trim();
        if (val && !formData[field].includes(val)) {
            setFormData(prev => ({ ...prev, [field]: [...prev[field], val] }));
            setTempInputs(prev => ({ ...prev, [tempKey]: '' }));
        }
    };

    const removeArrayItem = (field, val) => {
        setFormData(prev => ({ ...prev, [field]: prev[field].filter(item => item !== val) }));
    };

    const toggleGroupSelection = (groupId) => {
        setFormData(prev => ({
            ...prev,
            groupIds: prev.groupIds.includes(groupId)
                ? prev.groupIds.filter(id => id !== groupId)
                : [...prev.groupIds, groupId]
        }));
    };

    const handleFileUpload = async (e) => {
        if (!contact?._id) {
            toast.error('Save contact first before uploading screenshots');
            return;
        }
        const file = e.target.files[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('type', 'Screenshot');

        try {
            setUploading(true);
            await uploadWeChatAttachment('contact', contact._id, uploadData);
            toast.success('Screenshot uploaded');
            onSuccess();
        } catch (error) {
            toast.error('Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (contact) {
                await updateWeChatContact(contact._id, formData);
                toast.success('Contact record updated');
            } else {
                await createWeChatContact(formData);
                toast.success('New contact created');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save contact');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} size="xl">
            <form onSubmit={handleSubmit} className="bg-white max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl">
                {/* ── STICKY TOP HEADER ── */}
                <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200">
                            <MessageCircle className="text-white w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-widest">
                                {contact ? 'Edit Business Contact' : 'Establish New WeChat Link'}
                            </h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">Intelligence Module v2.0</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-10 bg-slate-50/50">
                    {/* Hero Section: Contact Profile */}
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 relative overflow-hidden">
                        {/* Status Decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 opacity-50" />
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className={`p-5 rounded-3xl transition-all duration-300 ${formData.isFavorite ? 'bg-amber-100' : 'bg-slate-100'}`}>
                                    <label className="cursor-pointer flex flex-col items-center gap-1 group">
                                        <input 
                                            type="checkbox" 
                                            name="isFavorite" 
                                            checked={formData.isFavorite} 
                                            onChange={handleChange}
                                            className="hidden"
                                        />
                                        <Star 
                                            className={`w-10 h-10 transition-transform ${formData.isFavorite ? 'fill-amber-400 text-amber-500 scale-110 drop-shadow-md' : 'text-slate-300 group-hover:scale-110'}`} 
                                        />
                                        <span className={`text-[10px] font-black uppercase tracking-tighter ${formData.isFavorite ? 'text-amber-600' : 'text-slate-400'}`}>
                                            {formData.isFavorite ? 'Key Contact' : 'Standard'}
                                        </span>
                                    </label>
                                </div>
                                <div>
                                    <h1 className="text-4xl font-black text-slate-800 tracking-tight leading-relaxed">
                                        {formData.weChatDisplayName || "New Business Contact"}
                                    </h1>
                                    <div className="flex items-center gap-4 mt-2">
                                        <Badge variant="secondary" className="px-4 py-1.5 rounded-xl text-xs font-bold uppercase bg-slate-100 text-slate-600">
                                            {formData.contactType}
                                        </Badge>
                                        <span className="text-slate-300">|</span>
                                        <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">
                                            {formData.companyName || 'No Company Name Provided'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 px-8 py-5 rounded-3xl border border-slate-100 flex flex-col min-w-[280px]">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Change Contact Class</span>
                                <Select 
                                    name="contactType" 
                                    value={formData.contactType} 
                                    onChange={handleChange}
                                    className="h-12 border-slate-200 rounded-xl font-bold text-base text-slate-700 bg-white shadow-sm"
                                >
                                    <option value="Individual">Individual</option>
                                    <option value="Company">Company Account</option>
                                    <option value="Supplier">Direct Supplier</option>
                                    <option value="Manufacturer">Manufacturer</option>
                                    <option value="Technical Contact">Technical/R&D</option>
                                    <option value="Sales Contact">Sales/Procurement</option>
                                    <option value="Agent">Agent / Export</option>
                                    <option value="Service Contact">Service Provider</option>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                        {/* Main Interaction Area */}
                        <div className="md:col-span-8 space-y-10">
                            {/* Card 1: Primary Identity */}
                            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-4 mb-10 pb-6 border-b border-slate-100">
                                    <div className="p-3 bg-emerald-50 rounded-2xl">
                                        <User className="text-emerald-600 w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Identity & Reach</h2>
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Primary Contact Records</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="md:col-span-2">
                                        <Input 
                                            required 
                                            label="WeChat Display Name"
                                            name="weChatDisplayName" 
                                            variant="lg"
                                            value={formData.weChatDisplayName} 
                                            onChange={handleChange} 
                                            placeholder="Exactly as displayed on WeChat" 
                                            className="h-14 text-xl font-black rounded-2xl" 
                                        />
                                    </div>
                                    <Input 
                                        label="Chinese Name (中文名)"
                                        name="chineseName" 
                                        variant="lg"
                                        value={formData.chineseName} 
                                        onChange={handleChange} 
                                        placeholder="e.g. 潘建伟" 
                                        className="rounded-2xl"
                                    />
                                    <Input 
                                        label="English Alias/Name"
                                        name="englishName" 
                                        variant="lg"
                                        value={formData.englishName} 
                                        onChange={handleChange} 
                                        placeholder="e.g. David Pan" 
                                        className="rounded-2xl"
                                    />
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-8">
                                        <div className="md:col-span-2">
                                            <Input 
                                                label="Organization Name"
                                                name="companyName" 
                                                variant="lg"
                                                value={formData.companyName} 
                                                onChange={handleChange} 
                                                startIcon={<Building2 className="w-5 h-5 text-slate-400" />}
                                                placeholder="Company Name" 
                                                className="rounded-2xl"
                                            />
                                        </div>
                                        <Input 
                                            label="Short Code"
                                            name="shortCode" 
                                            variant="lg"
                                            value={formData.shortCode} 
                                            onChange={handleChange} 
                                            placeholder="Tag" 
                                            className="rounded-2xl"
                                        />
                                    </div>
                                    {/* ── Contact Details Matrix ── */}
                                    <div className="md:col-span-2 mt-6">
                                        <div className="bg-slate-50/80 rounded-[2rem] p-10 border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                                            <Input
                                                label="WeChat ID"
                                                name="weChatId"
                                                variant="lg"
                                                value={formData.weChatId}
                                                onChange={handleChange}
                                                startIcon={<MessageCircle className="w-5 h-5 text-emerald-500" />}
                                                placeholder="wxid_xxxxxxxxx"
                                                className="rounded-2xl text-base"
                                            />
                                            <Input
                                                label="Mobile No / Ph"
                                                name="mobile"
                                                variant="lg"
                                                value={formData.mobile}
                                                onChange={handleChange}
                                                startIcon={<Phone className="w-5 h-5 text-slate-400" />}
                                                placeholder="+86 138..."
                                                className="rounded-2xl text-base"
                                            />
                                            <Input
                                                label="Region / Province"
                                                name="region"
                                                variant="lg"
                                                value={formData.region}
                                                onChange={handleChange}
                                                startIcon={<Globe className="w-5 h-5 text-blue-500" />}
                                                placeholder="e.g. Shenzhen, Guangdong"
                                                className="rounded-2xl text-base"
                                            />
                                            <Input
                                                label="Sourcing Channel"
                                                name="channelName"
                                                variant="lg"
                                                value={formData.channelName}
                                                onChange={handleChange}
                                                startIcon={<Tag className="w-5 h-5 text-purple-600" />}
                                                placeholder="e.g. Alibaba, 1688, Direct"
                                                className="rounded-2xl text-base"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Strategic Product Sourcing */}
                            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-4 mb-10 pb-6 border-b border-slate-100">
                                    <div className="p-3 bg-blue-50 rounded-2xl">
                                        <Package className="text-blue-600 w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sourcing Intelligence</h2>
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Product Mapping & Technical Tags</p>
                                    </div>
                                </div>
                                <div className="space-y-12">
                                    <div className="bg-slate-50 p-10 rounded-[2rem] border border-slate-200">
                                        <label className="block text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Core Products Handled</label>
                                        <div className="flex gap-4 mb-6">
                                            <Input 
                                                variant="lg"
                                                value={tempInputs.item} 
                                                onChange={(e) => setTempInputs(prev => ({...prev, item: e.target.value}))} 
                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('relatedItems', 'item'))}
                                                placeholder="Add product code..." 
                                                className="rounded-xl flex-1 h-14 text-base"
                                            />
                                            <Button type="button" variant="outline" className="rounded-xl px-10 h-14 font-black" onClick={() => addArrayItem('relatedItems', 'item')}>Link</Button>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            {formData.relatedItems.map(item => (
                                                <Badge key={item} className="bg-blue-600 text-white border-0 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black shadow-lg shadow-blue-100">
                                                    {item} <X className="w-5 h-5 cursor-pointer opacity-70 hover:opacity-100" onClick={() => removeArrayItem('relatedItems', item)} />
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Discovery Keywords</label>
                                        <div className="flex gap-4 mb-6">
                                            <Input 
                                                variant="lg"
                                                value={tempInputs.searchKw} 
                                                onChange={(e) => setTempInputs(prev => ({...prev, searchKw: e.target.value}))} 
                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('searchKeywords', 'searchKw'))}
                                                placeholder="Add technical tags..." 
                                                className="rounded-xl border-slate-200 flex-1 h-14 text-base"
                                            />
                                            <Button type="button" variant="ghost" className="rounded-xl px-10 h-14 text-slate-500 font-black" onClick={() => addArrayItem('searchKeywords', 'searchKw')}>Tag</Button>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            {formData.searchKeywords.map(kw => (
                                                <Badge key={kw} variant="secondary" className="bg-slate-100 text-slate-700 border-0 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-tight">
                                                    {kw} <X className="w-4 h-4 cursor-pointer opacity-50 hover:opacity-100" onClick={() => removeArrayItem('searchKeywords', kw)} />
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Column */}
                        <div className="md:col-span-4 space-y-10">
                            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-8 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Layout size={18} className="text-emerald-600" />
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Groups</h3>
                                    </div>
                                    <Badge className="bg-emerald-600 px-2 py-0.5 rounded-lg">{formData.groupIds.length}</Badge>
                                </div>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {(!Array.isArray(groups) || groups.length === 0) ? (
                                        <p className="text-xs text-slate-400 italic text-center py-10">No groups available</p>
                                    ) : groups.map(group => (
                                        <label 
                                            key={group._id} 
                                            className={`flex flex-col p-4 rounded-2xl border transition-all cursor-pointer ${
                                                formData.groupIds.includes(group._id) 
                                                    ? 'bg-emerald-600 border-emerald-700 shadow-lg translate-x-1' 
                                                    : 'bg-slate-50 border-slate-100 hover:border-emerald-300'
                                            }`}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={formData.groupIds.includes(group._id)} 
                                                onChange={() => toggleGroupSelection(group._id)}
                                                className="hidden"
                                            />
                                            <span className={`text-[11px] font-black uppercase tracking-tight ${formData.groupIds.includes(group._id) ? 'text-white' : 'text-slate-800'}`}>
                                                {group.groupName}
                                            </span>
                                            <span className={`text-[10px] mt-1 ${formData.groupIds.includes(group._id) ? 'text-emerald-100' : 'text-slate-400'}`}>
                                                {group.chineseGroupName || group.groupAlias}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-8 pb-2">
                                    <FileText size={18} className="text-slate-400" />
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Screenshots</h3>
                                </div>
                                <div 
                                    className="bg-emerald-50/50 p-10 rounded-3xl border-2 border-dashed border-emerald-200 text-center hover:bg-emerald-50 transition-colors cursor-pointer"
                                    onClick={() => document.getElementById('contact-screenshot').click()}
                                >
                                    <input type="file" id="contact-screenshot" className="hidden" onChange={handleFileUpload} disabled={uploading || !contact} />
                                    <Upload className={`w-10 h-10 mx-auto mb-4 ${uploading ? 'animate-bounce text-emerald-600' : 'text-emerald-400'}`} />
                                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Upload Chat Proof</p>
                                    {uploading && <p className="text-[10px] text-emerald-600 font-bold mt-2 animate-pulse">Uploading...</p>}
                                </div>
                                <div className="mt-6 space-y-3">
                                    {contact?.attachments?.filter(a => a.type === 'Screenshot').map((file, idx) => (
                                        <div key={idx} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group shadow-sm">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <ImageIcon size={18} className="text-emerald-500 shrink-0" />
                                                <span className="text-[11px] font-bold text-slate-600 truncate">{file.filename}</span>
                                            </div>
                                            <X size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-red-500 transition-all" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Full Width Notes Card */}
                    <div className="bg-slate-900 text-white rounded-[2.5rem] p-12 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <Briefcase size={200} className="text-white" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <FileText className="text-emerald-400" size={20} />
                                    <h3 className="text-xs font-black uppercase tracking-widest">Discussion & Strategy</h3>
                                </div>
                                <textarea 
                                    name="notes"
                                    className="w-full h-[240px] bg-slate-800/50 border border-slate-700 rounded-3xl p-8 text-base placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-emerald-50 leading-relaxed"
                                    value={formData.notes} 
                                    onChange={handleChange}
                                    placeholder="Write down meeting points, price history, logistics preference..."
                                />
                            </div>
                            <div className="flex flex-col justify-between">
                                <div className="grid grid-cols-2 gap-10">
                                    {[
                                        { label: 'Quality Level', name: 'supplierType', icon: <Star size={18} />, placeholder: 'e.g. Gold' },
                                        { label: 'Email Address', name: 'email', icon: <Mail size={18} />, placeholder: 'mail@factory.com' }
                                    ].map(field => (
                                        <div key={field.name}>
                                            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                {field.icon} {field.label}
                                            </label>
                                            <input 
                                                name={field.name}
                                                value={formData[field.name]}
                                                onChange={handleChange}
                                                placeholder={field.placeholder}
                                                className="w-full h-14 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 text-base text-white focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600 font-bold"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-16 flex items-center justify-between gap-10">
                                    <button 
                                        type="button" 
                                        onClick={onClose}
                                        className="px-12 py-5 rounded-3xl text-sm font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all underline decoration-slate-700 underline-offset-8"
                                    >
                                        Ignore Changes
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={loading}
                                        className="flex-1 px-14 py-6 rounded-[2rem] bg-emerald-600 text-white text-sm font-black uppercase tracking-widest shadow-2xl shadow-emerald-950 hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : (contact ? 'Push Profile Update' : 'Establish Business Link')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default WechatContactForm;
