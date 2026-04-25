import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Phone, MessageSquare, Building2, ChevronRight, Globe, Download, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatContacts, createWeChatContact } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

const ROLES = ['Owner', 'Sales', 'Technical', 'Export', 'Unknown'];
const SOURCES = ['WeChat', 'Alibaba', 'Made-in-China', 'Reference', 'Exhibition', 'Other'];

const WechatContactsTab = ({ onSelectContact }) => {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newContact, setNewContact] = useState({
        weChatDisplayName: '',
        contactPersonName: '',
        chineseName: '',
        englishName: '',
        weChatId: '',
        mobile: '',
        whatsapp: '',
        email: '',
        companyName: '',
        role: 'Sales',
        source: 'WeChat',
        language: 'Chinese'
    });

    useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        try {
            setLoading(true);
            const res = await getWeChatContacts({ search: searchTerm });
            setContacts(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load contacts');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateContact = async (e) => {
        e.preventDefault();
        try {
            await createWeChatContact(newContact);
            toast.success('Contact created successfully');
            setShowAddModal(false);
            fetchContacts();
        } catch (err) {
            toast.error('Failed to create contact');
        }
    };

    return (
        <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Supplier Contacts</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Manage individual WeChat profiles and company agents</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="rounded-xl border-2 font-bold flex items-center gap-2">
                        <Download size={18} /> Import
                    </Button>
                    <Button onClick={() => setShowAddModal(true)} className="bg-slate-900 hover:bg-black text-white rounded-xl font-bold flex items-center gap-2 px-6 shadow-lg shadow-slate-200">
                        <Plus size={20} /> Add Contact
                    </Button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex gap-4 items-center shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search by WeChat ID, name, company or mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchContacts()}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-slate-300 rounded-xl font-bold outline-none transition-all"
                    />
                </div>
                <Button variant="ghost" onClick={fetchContacts} className="rounded-xl font-bold">Search</Button>
            </div>

            {/* Contact Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-slate-400 font-bold">Loading contacts...</div>
                ) : contacts.length === 0 ? (
                    <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 h-64 flex flex-col items-center justify-center text-slate-400">
                        <User size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">No contacts found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {contacts.map(contact => (
                            <div 
                                key={contact._id} 
                                onClick={() => onSelectContact(contact)}
                                className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:shadow-xl hover:border-slate-400 transition-all cursor-pointer group relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="text-slate-400" />
                                </div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 font-black text-xl">
                                        {contact.weChatDisplayName?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <Badge className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border-0">
                                            {contact.role}
                                        </Badge>
                                        <h4 className="text-xl font-black text-slate-800 leading-tight truncate max-w-[150px]">{contact.weChatDisplayName}</h4>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                                        <MessageSquare size={14} className="text-slate-300" />
                                        <span>ID: {contact.weChatId || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                                        <Building2 size={14} className="text-slate-300" />
                                        <span className="truncate">{contact.companyName || 'No Company'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                                        <Phone size={14} className="text-slate-300" />
                                        <span>{contact.mobile || 'No Mobile'}</span>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-50 flex gap-2">
                                    <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-100 text-slate-400">{contact.source}</Badge>
                                    <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-100 text-slate-400">{contact.language}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Contact Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <form onSubmit={handleCreateContact} className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-2xl font-black text-slate-800">New Supplier Contact</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Register WeChat ID or Phone for tracking</p>
                        </div>
                        <div className="p-8 grid grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div className="col-span-2">
                                <Input 
                                    label="WeChat Display Name *" 
                                    value={newContact.weChatDisplayName} 
                                    onChange={e => setNewContact({...newContact, weChatDisplayName: e.target.value})}
                                    placeholder="Name as seen on WeChat" 
                                    required 
                                />
                            </div>
                            <Input label="English Name" value={newContact.englishName} onChange={e => setNewContact({...newContact, englishName: e.target.value})} placeholder="e.g. Kevin" />
                            <Input label="Chinese Name" value={newContact.chineseName} onChange={e => setNewContact({...newContact, chineseName: e.target.value})} placeholder="e.g. 王力" />
                            <Input label="WeChat ID *" value={newContact.weChatId} onChange={e => setNewContact({...newContact, weChatId: e.target.value})} placeholder="Required for unique tracking" required />
                            <Input label="Company Name" value={newContact.companyName} onChange={e => setNewContact({...newContact, companyName: e.target.value})} placeholder="Supplier Company" />
                            <Input label="Mobile Number" value={newContact.mobile} onChange={e => setNewContact({...newContact, mobile: e.target.value})} placeholder="+86..." />
                            <Input label="WhatsApp" value={newContact.whatsapp} onChange={e => setNewContact({...newContact, whatsapp: e.target.value})} placeholder="+86..." />
                            <Input label="Email" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} placeholder="email@example.com" />
                            <div>
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Role</label>
                                <select 
                                    value={newContact.role}
                                    onChange={e => setNewContact({...newContact, role: e.target.value})}
                                    className="w-full h-12 border-2 border-slate-100 rounded-xl px-4 font-bold outline-none focus:border-slate-400 transition-all bg-slate-50"
                                >
                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Source</label>
                                <select 
                                    value={newContact.source}
                                    onChange={e => setNewContact({...newContact, source: e.target.value})}
                                    className="w-full h-12 border-2 border-slate-100 rounded-xl px-4 font-bold outline-none focus:border-slate-400 transition-all bg-slate-50"
                                >
                                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 flex justify-end gap-4">
                            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)} className="font-bold">Cancel</Button>
                            <Button type="submit" className="bg-slate-900 hover:bg-black text-white rounded-xl px-8 font-black shadow-lg shadow-slate-200">Register Contact</Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default WechatContactsTab;
