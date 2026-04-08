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
    FileText, Upload, Briefcase
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
            const res = await getWeChatGroups();
            setGroups(res.data || []);
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
        <Modal isOpen={true} onClose={onClose} title={contact ? 'Edit Business Contact' : 'New WeChat Contact'} width="max-w-5xl">
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[85vh] overflow-y-auto px-1">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 p-4 rounded-2xl border gap-4">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                name="isFavorite" 
                                checked={formData.isFavorite} 
                                onChange={handleChange}
                                className="w-5 h-5 text-yellow-500 focus:ring-yellow-500 rounded-lg border-gray-300 transition-all"
                            />
                            <span className="text-sm font-bold flex items-center gap-1.5 text-gray-700">
                                <Star className={`w-5 h-5 transition-colors ${formData.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 group-hover:text-yellow-200'}`} />
                                Key Supplier/Contact
                            </span>
                        </label>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-green-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase">Contact Class:</span>
                        <Select 
                            name="contactType" 
                            value={formData.contactType} 
                            onChange={handleChange}
                            className="h-8 py-0 text-sm w-44 border-0 focus:ring-0 font-bold text-gray-800"
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Column: Essential Info */}
                    <div className="md:col-span-2 space-y-6">
                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-green-600" /> Primary Identity
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">WeChat Display Name *</label>
                                    <Input required name="weChatDisplayName" value={formData.weChatDisplayName} onChange={handleChange} placeholder="As displayed in WeChat List" className="h-11 text-lg font-bold" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chinese Name (中文名)</label>
                                    <Input name="chineseName" value={formData.chineseName} onChange={handleChange} placeholder="e.g. 潘建伟" className="font-hindi" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">English Alias/Name</label>
                                    <Input name="englishName" value={formData.englishName} onChange={handleChange} placeholder="e.g. David Pan" />
                                </div>
                                <div className="md:col-span-2 grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Company / Manufacturer Name</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <Input name="companyName" value={formData.companyName} onChange={handleChange} className="pl-10" placeholder="e.g. Shenzhen Tuya Smart" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Short Code</label>
                                        <Input name="shortCode" value={formData.shortCode} onChange={handleChange} placeholder="e.g. TUYA_SALES" />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="pt-4 border-t">
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Tag className="w-4 h-4 text-blue-600" /> Product & Category Sourcing
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Main Products Handled (e.g. ZT2S, Module, Driver)</label>
                                    <div className="flex gap-2 mb-2">
                                        <Input 
                                            value={tempInputs.item} 
                                            onChange={(e) => setTempInputs(prev => ({...prev, item: e.target.value}))} 
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('relatedItems', 'item'))}
                                            placeholder="Add product code or module name" 
                                        />
                                        <Button type="button" variant="outline" onClick={() => addArrayItem('relatedItems', 'item')}>Link</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {formData.relatedItems.map(item => (
                                            <Badge key={item} className="bg-blue-600 text-white border-0 flex items-center gap-1.5 px-3 py-1">
                                                {item} <X className="w-3.5 h-3.5 cursor-pointer opacity-70 hover:opacity-100" onClick={() => removeArrayItem('relatedItems', item)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Keywords (Zigbee, DALI, Tuya, Plastics)</label>
                                    <div className="flex gap-2 mb-2">
                                        <Input 
                                            value={tempInputs.searchKw} 
                                            onChange={(e) => setTempInputs(prev => ({...prev, searchKw: e.target.value}))} 
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('searchKeywords', 'searchKw'))}
                                            placeholder="Add searchable tag" 
                                        />
                                        <Button type="button" variant="outline" onClick={() => addArrayItem('searchKeywords', 'searchKw')}>Tag</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {formData.searchKeywords.map(kw => (
                                            <Badge key={kw} variant="secondary" className="bg-gray-100 text-gray-700 border-0 flex items-center gap-1.5">
                                                {kw} <X className="w-3.5 h-3.5 cursor-pointer opacity-50 hover:opacity-100" onClick={() => removeArrayItem('searchKeywords', kw)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Groups & Media */}
                    <div className="space-y-6">
                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Layout className="w-3.5 h-3.5" /> Group Memberships
                            </h3>
                            <div className="border rounded-2xl p-3 space-y-2 bg-gray-50/50 max-h-[300px] overflow-y-auto">
                                {groups.length === 0 ? (
                                    <p className="text-[10px] text-gray-400 italic text-center py-4">No groups available. Create one first.</p>
                                ) : groups.map(group => (
                                    <label key={group._id} className="flex items-center gap-3 p-2 bg-white rounded-xl border cursor-pointer hover:border-blue-300 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.groupIds.includes(group._id)} 
                                            onChange={() => toggleGroupSelection(group._id)}
                                            className="w-4 h-4 text-blue-600 rounded"
                                        />
                                        <div>
                                            <div className="text-[11px] font-bold text-gray-800">{group.groupName}</div>
                                            <div className="text-[9px] text-gray-400">{group.chineseGroupName || group.groupAlias}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section className="pt-4 border-t">
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" /> Reference Screenshots
                            </h3>
                            <div className="bg-white p-6 rounded-2xl border-2 border-dashed border-gray-200 text-center">
                                <input type="file" id="contact-screenshot" className="hidden" onChange={handleFileUpload} disabled={uploading || !contact} />
                                <div className="mb-4 flex justify-center">
                                    <div className="p-3 bg-green-50 rounded-full">
                                        <Upload className={`w-6 h-6 ${uploading ? 'animate-bounce text-green-600' : 'text-green-500'}`} />
                                    </div>
                                </div>
                                <p className="text-xs font-bold text-gray-700 mb-1">Chinese Name / Chat Proof</p>
                                <p className="text-[9px] text-gray-400 mb-4">Identify the person via app screenshot</p>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full"
                                    disabled={!contact}
                                    onClick={() => document.getElementById('contact-screenshot').click()}
                                >
                                    {uploading ? 'Uploading...' : 'Upload Image'}
                                </Button>
                            </div>
                            {contact?.attachments?.filter(a => a.type === 'Screenshot').map((file, idx) => (
                                <div key={idx} className="mt-2 p-2 bg-white border rounded-xl flex items-center gap-2 overflow-hidden">
                                    <ImageIcon className="w-4 h-4 text-green-600 shrink-0" />
                                    <span className="text-[10px] text-gray-600 truncate">{file.filename}</span>
                                </div>
                            ))}
                        </section>
                    </div>
                </div>

                <div className="pt-6 border-t space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <section>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Technical & Business Notes</label>
                            <textarea 
                                name="notes"
                                className="w-full border rounded-2xl p-4 text-sm bg-gray-50 focus:bg-white transition-all min-h-[120px]"
                                value={formData.notes} 
                                onChange={handleChange}
                                placeholder="Business discussion points, price history, logistics preferance..."
                            />
                        </section>
                        <section className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Supplier Type</label>
                                    <Input name="supplierType" value={formData.supplierType} onChange={handleChange} placeholder="e.g. Gold, Verified" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">WeChat ID (wxid)</label>
                                    <Input name="weChatId" value={formData.weChatId} onChange={handleChange} placeholder="wxid_..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Phone / Mobile</label>
                                    <Input name="mobile" value={formData.mobile} onChange={handleChange} placeholder="+86..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email</label>
                                    <Input name="email" value={formData.email} onChange={handleChange} placeholder="contact@supplier.com" />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="ghost" onClick={onClose}>Discard Changes</Button>
                        <Button type="submit" loading={loading} className="bg-green-600 hover:bg-green-700 px-8 rounded-xl shadow-lg shadow-green-100 ring-4 ring-green-50">
                            {contact ? 'Update Procurement Profile' : 'Save New Business Contact'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default WechatContactForm;
