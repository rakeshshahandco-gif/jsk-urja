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
import { 
    X, Plus, Star, Users, Tag, 
    FileText, ImageIcon, Upload, Trash2, 
    Link as LinkIcon, Building2 
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
        <Modal isOpen={true} onClose={onClose} title={group ? 'Edit WeChat Group' : 'Add WeChat Group'} width="max-w-4xl">
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[80vh] overflow-y-auto px-1">
                <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
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
                                Favorite Group
                            </span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Users className="w-3.5 h-3.5" /> Basic Identity
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Name (Display) *</label>
                                    <Input required name="groupName" value={formData.groupName} onChange={handleChange} placeholder="e.g. Zigbee Solutions Team" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chinese Group Name</label>
                                        <Input name="chineseGroupName" value={formData.chineseGroupName} onChange={handleChange} placeholder="中文群组名" className="font-hindi" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">English Alias / Purpose</label>
                                        <Input name="groupAlias" value={formData.groupAlias} onChange={handleChange} placeholder="Project Alpha Group" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Purpose / Category</label>
                                    <Input name="purpose" value={formData.purpose} onChange={handleChange} placeholder="e.g. Sourcing, Technical Discussion, Logistics" />
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 pt-2 border-t">
                                <Tag className="w-3.5 h-3.5" /> Product & Business Linking
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Product Keywords (e.g. ZT2S, DALI)</label>
                                    <div className="flex gap-2">
                                        <Input 
                                            value={tempInputs.keyword} 
                                            onChange={(e) => setTempInputs(prev => ({...prev, keyword: e.target.value}))} 
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('productKeywords', 'keyword'))}
                                            placeholder="Type product name and press enter" 
                                        />
                                        <Button type="button" variant="outline" onClick={() => addArrayItem('productKeywords', 'keyword')}>Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {formData.productKeywords.map(kw => (
                                            <Badge key={kw} className="bg-gray-100 text-gray-700 border-0 flex items-center gap-1">
                                                {kw} <X className="w-3 h-3 cursor-pointer" onClick={() => removeArrayItem('productKeywords', kw)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Related Companies / Suppliers</label>
                                    <div className="flex gap-2">
                                        <Input 
                                            value={tempInputs.company} 
                                            onChange={(e) => setTempInputs(prev => ({...prev, company: e.target.value}))} 
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('relatedCompanies', 'company'))}
                                            placeholder="Type company and press enter" 
                                        />
                                        <Button type="button" variant="outline" onClick={() => addArrayItem('relatedCompanies', 'company')}>Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {formData.relatedCompanies.map(co => (
                                            <Badge key={co} className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1">
                                                <Building2 className="w-3 h-3" /> {co} <X className="w-3 h-3 cursor-pointer" onClick={() => removeArrayItem('relatedCompanies', co)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="space-y-4">
                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <LinkIcon className="w-3.5 h-3.5" /> Members Relationship
                            </h3>
                            <div className="border rounded-2xl overflow-hidden">
                                <div className="bg-gray-50 p-2 border-b">
                                    <p className="text-[10px] text-gray-500 px-2 italic">Select individual contacts who belong to this group</p>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                                    {(Array.isArray(contacts) ? contacts : []).map(contact => (
                                        <div 
                                            key={contact._id} 
                                            onClick={() => toggleMember(contact._id)}
                                            className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                                                formData.memberIds.includes(contact._id) 
                                                ? 'bg-green-50 border-green-200' 
                                                : 'hover:bg-gray-50 border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1.5 rounded-lg ${formData.memberIds.includes(contact._id) ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                    <User className="w-3.5 h-3.5" />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-gray-800">{contact.weChatDisplayName}</div>
                                                    <div className="text-[10px] text-gray-400">{contact.companyName}</div>
                                                </div>
                                            </div>
                                            {formData.memberIds.includes(contact._id) && <Plus className="w-3.5 h-3.5 rotate-45 text-green-600" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 pt-2 border-t">
                                <ImageIcon className="w-3.5 h-3.5" /> Documentation & Screenshots
                            </h3>
                            <div className="bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <div className="p-3 bg-white rounded-full shadow-sm mb-2">
                                        <Upload className={`w-6 h-6 ${uploading ? 'animate-bounce text-blue-500' : 'text-gray-400'}`} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-1">Catalog / Reference Screenshot</p>
                                    <p className="text-[10px] text-gray-400 mb-4 px-4">Upload price lists or chat screenshots for quick identification</p>
                                    <input 
                                        type="file" 
                                        id="group-file" 
                                        className="hidden" 
                                        onChange={handleFileUpload} 
                                        disabled={uploading || !group}
                                    />
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={!group}
                                        onClick={() => document.getElementById('group-file').click()}
                                    >
                                        {uploading ? 'Uploading...' : (group ? 'Select File' : 'Save Group first to upload')}
                                    </Button>
                                </div>
                            </div>
                            {group?.attachments?.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {group.attachments.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-white border rounded-xl shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                                <span className="text-[10px] font-medium text-gray-700 truncate max-w-[150px]">{file.filename}</span>
                                            </div>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"><X className="w-3 h-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                <div className="pt-4 border-t flex flex-col gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Internal Management Notes</label>
                        <textarea 
                            name="notes"
                            className="w-full border rounded-2xl p-4 text-sm bg-gray-50 focus:bg-white transition-all min-h-[100px]"
                            value={formData.notes} 
                            onChange={handleChange}
                            placeholder="Add business strategy, price discussion summary, or group rules..."
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={onClose}>Discard Changes</Button>
                        <Button type="submit" loading={loading} className="bg-blue-600 hover:bg-blue-700 px-8 rounded-xl shadow-lg shadow-blue-100">
                            {group ? 'Update Group' : 'Initialize Group'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default WechatGroupForm;
