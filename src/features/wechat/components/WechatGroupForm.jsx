import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
    createWeChatGroup, 
    updateWeChatGroup, 
    getWeChatContacts,
    uploadWeChatAttachment 
} from '../../../services/weChatApi';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { BrandedLoader } from '@/components/ui';
import { 
    X, Plus, Star, Users, Tag, 
    FileText, ImageIcon, Upload, Trash2, 
    Link as LinkIcon, Building2, User 
} from 'lucide-react';

const WechatGroupForm = ({ group, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        groupName: '',
        groupAlias: '',
        chineseGroupName: '',
        purpose: '',
        category: '',
        productKeywords: [],
        relatedItems: [],
        relatedCompanies: [],
        memberIds: [],
        notes: '',
        isFavorite: false
    });

    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [tempInputs, setTempInputs] = useState({ keyword: '', item: '', company: '' });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const res = await getWeChatContacts({ limit: 1000 });
                setContacts(Array.isArray(res.data?.data) ? res.data.data : []);
            } catch (error) {
                setContacts([]);
            }
        };
        fetchContacts();

        if (group) {
            setFormData({
                ...group,
                productKeywords: group.productKeywords || [],
                relatedItems: group.relatedItems || [],
                relatedCompanies: group.relatedCompanies || [],
                memberIds: group.memberIds?.map(m => typeof m === 'object' ? m._id : m) || []
            });
        }
    }, [group]);

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

    const toggleMember = (contactId) => {
        setFormData(prev => ({
            ...prev,
            memberIds: prev.memberIds.includes(contactId)
                ? prev.memberIds.filter(id => id !== contactId)
                : [...prev.memberIds, contactId]
        }));
    };

    const handleFileUpload = async (e) => {
        if (!group?._id) {
            toast.error('Please save the group first before uploading attachments');
            return;
        }
        const file = e.target.files[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('type', 'Other');
        uploadData.append('notes', 'Uploaded from group form');

        try {
            setUploading(true);
            await uploadWeChatAttachment('group', group._id, uploadData);
            toast.success('File uploaded');
            onSuccess(); // Refresh to show new attachment
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
            if (group) {
                await updateWeChatGroup(group._id, formData);
                toast.success('Group updated');
            } else {
                await createWeChatGroup(formData);
                toast.success('Group created');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save group');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} width="max-w-5xl">
            <div className="relative bg-white rounded-[2rem] overflow-hidden flex flex-col max-h-[90vh]">
                {/* Sticky Premium Header */}
                <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-8 py-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600 p-3.5 rounded-[1.25rem] shadow-lg shadow-blue-200">
                            <Users className="text-white w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                                {group ? 'Edit Intelligence Group' : 'Initialize New Group'}
                            </h2>
                            <p className="text-sm font-bold text-slate-400 mt-1.5 uppercase tracking-widest">
                                Global Sourcing · Team Collaboration · Category Mapping
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400 group">
                        <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-6 space-y-10">
                    {/* Status & Priority Row */}
                    <div className="flex justify-between items-center bg-blue-50/50 p-6 rounded-[2rem] border-2 border-blue-100/50">
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    name="isFavorite" 
                                    checked={formData.isFavorite} 
                                    onChange={handleChange}
                                    className="w-6 h-6 text-yellow-500 focus:ring-yellow-500 rounded-lg border-slate-300 transition-all cursor-pointer"
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-700 flex items-center gap-2">
                                        <Star className={`w-5 h-5 transition-colors ${formData.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300 group-hover:text-yellow-200'}`} />
                                        Priority Tracking
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Mark as key sourcing group</span>
                                </div>
                            </label>
                        </div>
                        <div className="hidden md:block">
                            <Badge className="bg-white text-blue-700 px-4 py-1.5 rounded-xl font-black border-2 border-blue-100 shadow-sm">ID: {formData.entryNo || 'NEW'}</Badge>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                        {/* Left Column: Basic Info & Keywords */}
                        <div className="lg:col-span-7 space-y-10">
                            <section>
                                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-600" /> Basic Identity
                                </h3>
                                <div className="space-y-6">
                                    <div className="group">
                                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Group Display Name *</label>
                                        <Input required variant="lg" name="groupName" value={formData.groupName} onChange={handleChange} placeholder="e.g. Tuya Sourcing & Price Updates" className="h-16 rounded-2xl border-2 focus:ring-4 ring-blue-50" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="group">
                                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Chinese Name</label>
                                            <Input variant="lg" name="chineseGroupName" value={formData.chineseGroupName} onChange={handleChange} placeholder="供应商群组" className="h-14 rounded-2xl font-hindi border-2" />
                                        </div>
                                        <div className="group">
                                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Purpose / Alias</label>
                                            <Input variant="lg" name="groupAlias" value={formData.groupAlias} onChange={handleChange} placeholder="Project Bluetooth" className="h-14 rounded-2xl border-2" />
                                        </div>
                                    </div>
                                    <div className="group">
                                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Functional Category</label>
                                        <Input variant="lg" name="purpose" value={formData.purpose} onChange={handleChange} placeholder="e.g. Technical Support, Logistics, Direct Factory" className="h-14 rounded-2xl border-2" />
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> Intelligence Mapping
                                </h3>
                                <div className="space-y-6">
                                    <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100/50">
                                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">Product Keywords (e.g. BT2S, Driver)</label>
                                        <div className="flex gap-3">
                                            <Input 
                                                variant="lg"
                                                className="bg-white h-14 rounded-2xl shadow-sm border-2"
                                                value={tempInputs.keyword} 
                                                onChange={(e) => setTempInputs(prev => ({...prev, keyword: e.target.value}))} 
                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('productKeywords', 'keyword'))}
                                                placeholder="Enter part no. or tech and hit Add" 
                                            />
                                            <Button type="button" variant="outline" className="h-14 rounded-2xl px-6 font-black border-2 border-slate-200 hover:border-emerald-500 text-emerald-700" onClick={() => addArrayItem('productKeywords', 'keyword')}>Add</Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {formData.productKeywords.map(kw => (
                                                <Badge key={kw} className="bg-emerald-600 text-white border-0 px-4 py-2 rounded-xl text-sm font-black shadow-md flex items-center gap-2 group/tag">
                                                    {kw} <X className="w-3.5 h-3.5 cursor-pointer hover:rotate-90 transition-transform" onClick={() => removeArrayItem('productKeywords', kw)} />
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-blue-50/30 p-6 rounded-[2rem] border-2 border-blue-100/30">
                                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">Related Suppliers / Brands</label>
                                        <div className="flex gap-3">
                                            <Input 
                                                variant="lg"
                                                className="bg-white h-14 rounded-2xl shadow-sm border-2"
                                                value={tempInputs.company} 
                                                onChange={(e) => setTempInputs(prev => ({...prev, company: e.target.value}))} 
                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('relatedCompanies', 'company'))}
                                                placeholder="Enter factory or brand name" 
                                            />
                                            <Button type="button" variant="outline" className="h-14 rounded-2xl px-6 font-black border-2 border-slate-200 hover:border-blue-500 text-blue-700" onClick={() => addArrayItem('relatedCompanies', 'company')}>Add</Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {formData.relatedCompanies.map(co => (
                                                <Badge key={co} className="bg-blue-700 text-white border-0 px-4 py-2 rounded-xl text-sm font-black shadow-md flex items-center gap-2">
                                                    <Building2 className="w-3.5 h-3.5" /> {co} <X className="w-3.5 h-3.5 cursor-pointer hover:rotate-90 transition-transform" onClick={() => removeArrayItem('relatedCompanies', co)} />
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Members & Attachments */}
                        <div className="lg:col-span-5 space-y-10">
                            <section>
                                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500" /> Group Members
                                </h3>
                                <div className="border-2 border-slate-100 rounded-[2rem] overflow-hidden bg-white shadow-sm">
                                    <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Users size={12} /> Contact Selection ({formData.memberIds.length})
                                        </p>
                                    </div>
                                    <div className="max-h-[380px] overflow-y-auto p-4 space-y-2 bg-slate-50/30">
                                        {(Array.isArray(contacts) ? contacts : []).map(contact => {
                                            const isActive = formData.memberIds.includes(contact._id);
                                            return (
                                                <div 
                                                    key={contact._id} 
                                                    onClick={() => toggleMember(contact._id)}
                                                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group/item hover:scale-[1.01] ${
                                                        isActive 
                                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                                                        : 'bg-white border-transparent hover:border-blue-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2.5 rounded-xl transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400 group-hover/item:bg-blue-50 group-hover/item:text-blue-600'}`}>
                                                            <User className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className={`text-sm font-black truncate ${isActive ? 'text-white' : 'text-slate-900'}`}>{contact.weChatDisplayName}</div>
                                                            <div className={`text-[11px] font-bold ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{contact.companyName || 'No Company'}</div>
                                                        </div>
                                                    </div>
                                                    {isActive && <div className="bg-white/20 p-1 rounded-full"><Plus className="w-4 h-4 rotate-45 text-white" /></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-500" /> Files & Docs
                                </h3>
                                <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center">
                                    <div className={`p-5 rounded-full bg-white shadow-xl mb-4 ${uploading ? 'animate-pulse' : ''}`}>
                                        <Upload className={`w-8 h-8 ${uploading ? 'text-blue-500' : 'text-slate-300'}`} />
                                    </div>
                                    <p className="text-sm font-black text-slate-900 mb-1">Catalog / Reference Screenshot</p>
                                    <p className="text-xs text-slate-400 mb-6 px-10 text-center font-bold">Upload price sheets, QR codes, or group guidelines</p>
                                    <input type="file" id="group-file" className="hidden" onChange={handleFileUpload} disabled={uploading || !group} />
                                    <Button 
                                        type="button" 
                                        className={`h-12 w-full rounded-2xl font-black ${group ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                        disabled={!group || uploading}
                                        onClick={() => document.getElementById('group-file').click()}
                                    >
                                        <div className="flex items-center justify-center gap-3">
                                             {uploading ? (
                                                 <BrandedLoader size={20} />
                                             ) : (
                                                 <span>{group ? 'Select File to Upload' : 'Save group first to upload'}</span>
                                             )}
                                         </div>
                                    </Button>
                                </div>
                                {group?.attachments?.length > 0 && (
                                    <div className="mt-6 grid grid-cols-1 gap-3">
                                        {group.attachments.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm hover:border-blue-200 transition-colors group/file">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-blue-50 rounded-xl"><FileText className="w-5 h-5 text-blue-600" /></div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-black text-slate-900 truncate block max-w-[180px]">{file.filename}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Added: {format(new Date(file.uploadDate), 'dd MMM')}</span>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-red-500 rounded-xl hover:bg-red-50 opacity-0 group-hover/file:opacity-100 transition-opacity"><Trash2 className="w-5 h-5" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>

                    <div className="pt-10 border-t-2 border-slate-100 space-y-8">
                        <div>
                            <label className="block text-[12px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Business Intelligence Notes</label>
                            <textarea 
                                name="notes"
                                className="w-full border-2 border-slate-100 rounded-[2rem] p-6 text-base font-bold text-slate-700 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 ring-blue-50 transition-all min-h-[140px] placeholder:text-slate-300"
                                value={formData.notes} 
                                onChange={handleChange}
                                placeholder="Add business logic, sourcing strategy, group behaviors, or price negotiation context..."
                            />
                        </div>

                        <div className="flex items-center justify-end gap-6 pt-4">
                            <Button type="button" variant="ghost" className="text-slate-400 font-black h-14 px-8 rounded-2xl hover:text-slate-600" onClick={onClose}>Discard Changes</Button>
                            <Button type="submit" isLoading={loading} className="bg-slate-900 hover:bg-black text-white h-14 px-12 rounded-2xl font-black text-lg shadow-2xl shadow-slate-200 transition-all">
                                {group ? 'Update Intelligence Group' : 'Initialize Strategy Group'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default WechatGroupForm;
