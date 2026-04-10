import React, { useState } from 'react';
import { 
    X, User, Users, Building2, Tag, 
    MessageCircle, Star, Phone, Mail, 
    Globe, FileText, ImageIcon, History, 
    Plus, Download, ExternalLink, Calendar,
    ChevronDown, ChevronUp, Link as LinkIcon
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/Tabs';
import { format } from 'date-fns';

const WechatDetailsView = ({ item, type, onClose, onAddNote, onUpload }) => {
    const [note, setNote] = useState('');
    const [isNoteExpanded, setIsNoteExpanded] = useState(false);
    
    if (!item) return null;

    const isContact = type === 'contact';
    const name = isContact ? item.weChatDisplayName : item.groupName;
    const subName = isContact 
        ? (item.chineseName || item.englishName || 'No alias') 
        : (item.chineseGroupName || item.groupAlias || 'No alias');

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        await onAddNote(item._id, { note });
        setNote('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/20 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className={`p-6 text-white ${isContact ? 'bg-green-600' : 'bg-blue-600'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                            {isContact ? <User className="w-8 h-8" /> : <Users className="w-8 h-8" />}
                        </div>
                        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
                            <X className="w-6 h-6" />
                        </Button>
                    </div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-3xl font-black">{name}</h1>
                                {item.isFavorite && <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />}
                            </div>
                            <p className="text-white/80 font-medium text-lg font-hindi">{subName}</p>
                        </div>
                        <Badge className="bg-white/20 text-white border-0 py-1 px-3">
                            {isContact ? (item.contactType || 'Individual') : 'WeChat Group'}
                        </Badge>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <Tabs defaultValue="info" className="h-full flex flex-col">
                        <TabsList className="px-6 border-b rounded-none bg-gray-50/50">
                            <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none h-12">
                                Overview
                            </TabsTrigger>
                            <TabsTrigger value="links" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none h-12">
                                {isContact ? 'Groups' : 'Members'}
                            </TabsTrigger>
                            <TabsTrigger value="files" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none h-12">
                                Attachments ({item.attachments?.length || 0})
                            </TabsTrigger>
                        </TabsList>

                        <div className="p-6">
                            <TabsContent value="info" className="space-y-8 mt-0">
                                {/* Core Details */}
                                <section>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Core Identification</h3>
                                    <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-2xl border">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-gray-400 uppercase font-bold">Entry ID</p>
                                            <p className="text-sm font-black text-gray-700">{item.entryNo}</p>
                                        </div>
                                        {item.companyName && (
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Organization</p>
                                                <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                                    <Building2 className="w-3.5 h-3.5" /> {item.companyName}
                                                </p>
                                            </div>
                                        )}
                                        {isContact && item.mobile && (
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Contact Number</p>
                                                <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                                    <Phone className="w-3.5 h-3.5" /> {item.mobile}
                                                </p>
                                            </div>
                                        )}
                                        {isContact && item.weChatId && (
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">WeChat ID</p>
                                                <p className="text-sm font-mono font-bold text-gray-700">{item.weChatId}</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Keywords & Tags */}
                                <section>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Business Intelligence</h3>
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap gap-2">
                                            {[...(item.productKeywords || []), ...(item.relatedItems || [])].map(tag => (
                                                <Badge key={tag} className="bg-blue-600 text-white border-0 px-3 py-1 flex items-center gap-1.5">
                                                    <Tag className="w-3 h-3" /> {tag}
                                                </Badge>
                                            ))}
                                            {(item.searchKeywords || []).map(tag => (
                                                <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-600 border-0 px-3 py-1">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                        {item.notes && (
                                            <div className="bg-yellow-50/50 p-4 rounded-2xl border border-yellow-100">
                                                <p className="text-xs text-yellow-800 leading-relaxed italic">
                                                    "{item.notes}"
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Notes History */}
                                <section>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Discussion History</h3>
                                        <Button variant="ghost" size="sm" onClick={() => setIsNoteExpanded(!isNoteExpanded)} className="text-blue-600">
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add Note
                                        </Button>
                                    </div>

                                    {isNoteExpanded && (
                                        <form onSubmit={handleAddNote} className="mb-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                                            <textarea 
                                                className="w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 transition-all min-h-[80px]"
                                                placeholder="What did you discuss? Price change? New product sample?"
                                                value={note}
                                                onChange={(e) => setNote(e.target.value)}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => setIsNoteExpanded(false)}>Cancel</Button>
                                                <Button type="submit" size="sm" className="bg-gray-900 text-white">Save Note</Button>
                                            </div>
                                        </form>
                                    )}

                                    <div className="space-y-4">
                                        {(!Array.isArray(item.notesHistory) || item.notesHistory.length === 0) ? (
                                            <p className="text-center py-8 text-gray-400 text-xs italic border-2 border-dashed rounded-2xl">No recorded discussions yet.</p>
                                        ) : item.notesHistory.slice().reverse().map((h, i) => (
                                            <div key={i} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5" />
                                                    {i !== (item.notesHistory || []).length - 1 && <div className="w-0.5 flex-1 bg-gray-100 my-1" />}
                                                </div>
                                                <div className="flex-1 pb-4">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-black text-gray-900">{h.user?.name || 'Admin'}</span>
                                                        <span className="text-[10px] text-gray-400">{h.date ? format(new Date(h.date), 'dd MMM yyyy') : '--'}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-600">{h.note}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="links" className="mt-0">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                                    {isContact ? 'WeChat Groups this person is in' : 'Individual contacts in this group'}
                                </h3>
                                {(isContact ? item.groupIds : item.memberIds)?.length > 0 ? (
                                    (isContact ? item.groupIds : item.memberIds).map(link => (
                                        <div key={link._id || link} className="flex items-center justify-between p-3 border rounded-xl mb-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${isContact ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                                    {isContact ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900">
                                                        {isContact ? link.groupName : link.weChatDisplayName}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 font-hindi">
                                                        {isContact ? (link.chineseGroupName || link.groupAlias) : link.chineseName}
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-300" />
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed">
                                        <LinkIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        <p className="text-xs text-gray-400">No active links found.</p>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="files" className="mt-0">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sourcing Documentation</h3>
                                    <label className="cursor-pointer">
                                        <input type="file" className="hidden" onChange={(e) => onUpload(item._id, e.target.files[0])} />
                                        <Badge className="bg-gray-900 text-white border-0 py-1 cursor-pointer">
                                            <Plus className="w-3 h-3 mr-1" /> Add File
                                        </Badge>
                                    </label>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    {(Array.isArray(item.attachments) && item.attachments.length > 0) ? (
                                        item.attachments.map((file, idx) => (
                                            <Card key={idx} className="p-3 border-2 hover:border-gray-900 transition-all cursor-pointer group">
                                                <div className="flex items-start gap-3">
                                                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                                                        {file.mimetype?.startsWith('image') ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[11px] font-bold text-gray-900 truncate" title={file.filename}>{file.filename}</p>
                                                        <p className="text-[9px] text-gray-400 uppercase mt-0.5">{file.type || 'Document'}</p>
                                                        <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <a href={file.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                                                                <Download className="w-3 h-3" /> View
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))
                                    ) : (
                                        <div className="col-span-full text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed">
                                            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-xs text-gray-400">No catalogs or screenshots uploaded.</p>
                                        </div>
                                    )}
                                </div>

                                {item.attachments?.some(a => a.type === 'Screenshot') && (
                                    <div className="mt-8">
                                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <ImageIcon className="w-3.5 h-3.5" /> Visual Verification (Screenshots)
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(item.attachments || []).filter(a => a.type === 'Screenshot').map((ss, i) => (
                                                <div key={i} className="aspect-video rounded-2xl overflow-hidden border-2 border-gray-100 shadow-sm relative group bg-gray-100">
                                                    <img src={ss.url} alt="Proof" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <a href={ss.url} target="_blank" rel="noreferrer" className="bg-white p-2 rounded-full shadow-lg">
                                                            <ExternalLink className="w-4 h-4 text-gray-900" />
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <Calendar className="w-3 h-3" /> Created: {format(new Date(item.createdAt), 'dd MMM yyyy')}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WechatDetailsView;
