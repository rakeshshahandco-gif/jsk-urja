import React, { useState, useEffect } from 'react';
import { 
    Search, Plus, User, Building2, Tag, 
    MessageCircle, Star, Filter, Users, 
    ChevronRight, FileText, ImageIcon, 
    MoreHorizontal, LayoutGrid, List as ListIcon,
    AlertCircle, Download, History, Edit2, Trash2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
    searchWeChatUnified, 
    getWeChatContacts, 
    getWeChatGroups,
    getWeChatContact,
    getWeChatGroup,
    deleteWeChatContact,
    deleteWeChatGroup,
    addWeChatContactNote as addNoteToContact,
    addWeChatGroupNote as addNoteToGroup,
    uploadWeChatAttachment
} from '../../../services/weChatApi';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/Tabs';
import WechatContactForm from '../components/WechatContactForm';
import WechatGroupForm from '../components/WechatGroupForm';

const WechatListPage = () => {
    const [view, setView] = useState('unified'); // unified, contacts, groups
    const [detailsView, setDetailsView] = useState({ open: false, type: '', item: null });
    const [results, setResults] = useState({ contacts: [], groups: [] });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isContactFormOpen, setIsContactFormOpen] = useState(false);
    const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchUnifiedResults();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchUnifiedResults = async () => {
        try {
            setLoading(true);
            if (search.trim()) {
                const response = await searchWeChatUnified({ search });
                setResults(response.data.data || { contacts: [], groups: [] });
            } else {
                const [contactsRes, groupsRes] = await Promise.all([
                    getWeChatContacts({ limit: 50 }),
                    getWeChatGroups()
                ]);
                setResults({
                    contacts: contactsRes.data.data || [],
                    groups: groupsRes.data.data || []
                });
            }
        } catch (error) {
            toast.error('Search failed');
        } finally {
            setLoading(false);
        }
    };

    const fetchDetails = async (type, id) => {
        try {
            const apiCall = type === 'contact' ? getWeChatContact : getWeChatGroup;
            const res = await apiCall(id);
            setDetailsView({ open: true, type, item: res.data });
        } catch (error) {
            toast.error('Failed to load details');
        }
    };

    const handleAddNote = async (id, data) => {
        try {
            const apiCall = detailsView.type === 'contact' ? addNoteToContact : addNoteToGroup;
            await apiCall(id, data);
            toast.success('Note added');
            fetchDetails(detailsView.type, id); // Refresh details
        } catch (error) {
            toast.error('Failed to add note');
        }
    };

    const handleUpload = async (id, file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', file.type.startsWith('image/') ? 'Screenshot' : 'Catalog');
        
        try {
            toast.loading('Uploading...', { id: 'uploading' });
            await uploadWeChatAttachment(detailsView.type, id, formData);
            toast.success('Upload complete', { id: 'uploading' });
            fetchDetails(detailsView.type, id);
        } catch (error) {
            toast.error('Upload failed', { id: 'uploading' });
        }
    };

    const ResultCard = ({ item, type }) => {
        const isContact = type === 'contact';
        const name = isContact ? item.weChatDisplayName : item.groupName;
        const subName = isContact ? item.chineseName || item.englishName : item.chineseGroupName || item.groupAlias;
        
        return (
            <Card 
                className="hover:shadow-lg transition-all duration-200 border-l-4 overflow-hidden cursor-pointer active:scale-[0.98]" 
                onClick={() => fetchDetails(type, item._id)}
                style={{ borderLeftColor: isContact ? '#10b981' : '#3b82f6' }}
            >
                <div className="p-4">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-3">
                            <div className={`p-2 rounded-xl ${isContact ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                {isContact ? <User className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    {name}
                                    {item.isFavorite && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
                                </h3>
                                <p className="text-sm text-gray-500 font-hindi">{subName}</p>
                            </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                            {isContact ? (item.contactType || 'Individual') : 'WeChat Group'}
                        </Badge>
                    </div>

                    <div className="space-y-1.5 mb-4">
                        {item.companyName && (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                <Building2 className="w-3.5 h-3.5" /> {item.companyName}
                            </div>
                        )}
                        {(item.productKeywords?.length > 0 || item.relatedItems?.length > 0) && (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                <Tag className="w-3.5 h-3.5" />
                                <span className="truncate">
                                    {[...(item.productKeywords || []), ...(item.relatedItems || [])].slice(0, 3).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex gap-2">
                            {item.attachments?.length > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                                    <FileText className="w-3 h-3" /> {item.attachments.length} files
                                </div>
                            )}
                            {item.notesHistory?.length > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-600 font-medium bg-gray-50 px-1.5 py-0.5 rounded">
                                    <History className="w-3 h-3" /> Historic notes
                                </div>
                            )}
                        </div>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" 
                                onClick={() => {
                                    setSelectedItem(item);
                                    if (isContact) setIsContactFormOpen(true);
                                    else setIsGroupFormOpen(true);
                                }}>
                                <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" 
                                onClick={() => handleDelete(isContact ? 'Contact' : 'Group', item._id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50/50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                            <span className="bg-green-600 p-2 rounded-2xl shadow-lg shadow-green-200">
                                <MessageCircle className="text-white w-7 h-7" />
                            </span>
                            WeChat Procurement Network
                        </h1>
                        <p className="text-gray-500 mt-1 pl-1">Intelligent sourcing, groups, and supplier tracking for China operations.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button onClick={() => { setSelectedItem(null); setIsGroupFormOpen(true); }} variant="outline" className="flex items-center gap-2 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-4 focus:ring-blue-100">
                            <Users className="w-4 h-4" />
                            New Group
                        </Button>
                        <Button onClick={() => { setSelectedItem(null); setIsContactFormOpen(true); }} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100 ring-4 ring-green-50">
                            <Plus className="w-4 h-4" />
                            New Contact
                        </Button>
                    </div>
                </div>

                <div className="relative mb-8 group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6 group-focus-within:text-green-600 transition-colors" />
                    <Input 
                        placeholder="Search Unified: ZT2S, Zigbee, Tuya, Zhang San, Supplier Group..." 
                        className="pl-14 h-16 text-xl rounded-3xl border-2 border-gray-200 shadow-sm focus:border-green-600 transition-all placeholder:text-gray-300"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Tabs value={view} onValueChange={setView} className="space-y-6">
                    <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border">
                        <TabsList className="bg-transparent border-0 p-0">
                            <TabsTrigger value="unified" className="rounded-xl px-6 data-[state=active]:bg-gray-900 data-[state=active]:text-white transition-all">
                                Unified Results 
                                <Badge className="ml-2 bg-gray-200 text-gray-900">{results.contacts.length + results.groups.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="contacts" className="rounded-xl px-6 data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all">
                                Contacts
                                <Badge className="ml-2 bg-green-100 text-green-700">{results.contacts.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="groups" className="rounded-xl px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                                Groups
                                <Badge className="ml-2 bg-blue-100 text-blue-700">{results.groups.length}</Badge>
                            </TabsTrigger>
                        </TabsList>
                        <div className="flex gap-2 pr-2">
                             <Button variant="ghost" size="sm" className="text-gray-400"><Filter className="w-4 h-4" /></Button>
                             <Button variant="ghost" size="sm" className="text-gray-400"><LayoutGrid className="w-4 h-4" /></Button>
                        </div>
                    </div>

                    <TabsContent value="unified" className="mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {loading ? (
                                <div className="col-span-full flex flex-col items-center justify-center py-20 animate-pulse">
                                    <MessageCircle className="w-12 h-12 text-gray-300 mb-4" />
                                    <div className="text-gray-400 font-medium">Analyzing networks and product links...</div>
                                </div>
                            ) : results.contacts.length === 0 && results.groups.length === 0 ? (
                                <div className="col-span-full text-center py-20 bg-white rounded-3xl border-4 border-dashed border-gray-100 flex flex-col items-center">
                                    <AlertCircle className="w-16 h-16 text-gray-200 mb-4" />
                                    <div className="text-xl font-bold text-gray-400 mb-2">No matching connections found.</div>
                                    <p className="text-gray-300 mb-6">Try searching by product code (ZT2S), category, or Chinese name.</p>
                                    <Button variant="outline" onClick={() => setSearch('')}>Discovery Mode (Reset)</Button>
                                </div>
                            ) : (
                                <>
                                    {results.groups.map(group => <ResultCard key={group._id} item={group} type="group" />)}
                                    {results.contacts.map(contact => <ResultCard key={contact._id} item={contact} type="contact" />)}
                                </>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="contacts" className="mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {results.contacts.map(contact => <ResultCard key={contact._id} item={contact} type="contact" />)}
                        </div>
                    </TabsContent>

                    <TabsContent value="groups" className="mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {results.groups.map(group => <ResultCard key={group._id} item={group} type="group" />)}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {isContactFormOpen && (
                <WechatContactForm 
                    contact={selectedItem}
                    onClose={() => setIsContactFormOpen(false)}
                    onSuccess={() => { setIsContactFormOpen(false); fetchUnifiedResults(); if(detailsView.open) fetchDetails('contact', selectedItem._id); }}
                />
            )}

            {isGroupFormOpen && (
                <WechatGroupForm 
                    group={selectedItem}
                    onClose={() => setIsGroupFormOpen(false)}
                    onSuccess={() => { setIsGroupFormOpen(false); fetchUnifiedResults(); if(detailsView.open) fetchDetails('group', selectedItem._id); }}
                />
            )}

            {/* Detailed View Sidebar */}
            {detailsView.open && (
                <WechatDetailsView 
                    item={detailsView.item}
                    type={detailsView.type}
                    onClose={() => setDetailsView({ open: false, type: '', item: null })}
                    onAddNote={handleAddNote}
                    onUpload={handleUpload}
                />
            )}
        </div>
    );
};

export default WechatListPage;
