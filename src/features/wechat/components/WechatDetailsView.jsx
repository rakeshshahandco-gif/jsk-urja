import { 
    X, User, Users, Building2, Tag, 
    MessageCircle, Star, Phone, Mail, 
    Globe, FileText, Image as ImageIcon, History, 
    Plus, Download, ExternalLink, Calendar,
    ChevronDown, ChevronUp, Link as LinkIcon,
    Package, MapPin, Hash, ShieldCheck, Clock,
    ChevronRight, Info
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/Tabs';
import { format } from 'date-fns';
import { cn } from '../../../lib/utils';
import React, { useState } from 'react';

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
        <div className="fixed inset-y-0 right-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-md transition-all duration-300 w-full">
            <div className="bg-white w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl h-full shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.2)] flex flex-col animate-in slide-in-from-right duration-500 ease-out border-l border-slate-100 relative">
                {/* ── PREMIUM HEADER ── */}
                <div className={cn(
                    "p-10 text-white relative overflow-hidden transition-all duration-500",
                    isContact ? "bg-gradient-to-br from-emerald-600 to-emerald-800" : "bg-gradient-to-br from-blue-700 to-blue-900"
                )}>
                    {/* Background Decoration */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-20 blur-2xl" />

                    <div className="flex justify-between items-start relative z-10 mb-8">
                        <div className="p-4 bg-white/10 rounded-[1.5rem] backdrop-blur-xl border border-white/20 shadow-xl">
                            {isContact ? <User className="w-10 h-10" /> : <Users className="w-10 h-10" />}
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-3 hover:bg-white/10 rounded-2xl text-white transition-all hover:rotate-90"
                        >
                            <X className="w-8 h-8" />
                        </button>
                    </div>

                    <div className="flex justify-between items-end relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-4">
                                <h1 className="text-4xl font-black tracking-tighter drop-shadow-sm">{name}</h1>
                                {item.isFavorite && (
                                    <div className="bg-amber-400 p-2 rounded-xl shadow-lg shadow-amber-950/20">
                                        <Star className="w-4 h-4 fill-white text-white" />
                                    </div>
                                )}
                            </div>
                            <p className="text-white/70 font-black text-sm uppercase tracking-[0.2em]">{subName}</p>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-md py-2 px-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-inner">
                                {isContact ? (item.contactType || 'Individual Account') : 'Intelligence Group'}
                            </Badge>
                            <span className="text-[10px] text-white/40 font-black uppercase">Established {format(new Date(item.createdAt), 'MMM yyyy')}</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="px-10 border-b border-slate-100 rounded-none bg-white h-20 gap-10">
                            <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:border-emerald-600 border-b-4 border-transparent rounded-none h-full text-sm font-black uppercase tracking-widest text-slate-400 transition-all flex items-center gap-2">
                                <Info size={16} /> Overview
                            </TabsTrigger>
                            <TabsTrigger value="links" className="data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:border-emerald-600 border-b-4 border-transparent rounded-none h-full text-sm font-black uppercase tracking-widest text-slate-400 transition-all flex items-center gap-2">
                                <LinkIcon size={16} /> {isContact ? 'Membership' : 'Inventory'}
                            </TabsTrigger>
                            <TabsTrigger value="files" className="data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:border-emerald-600 border-b-4 border-transparent rounded-none h-full text-sm font-black uppercase tracking-widest text-slate-400 transition-all flex items-center gap-2">
                                <FileText size={16} /> Attachments <span className="ml-1 opacity-40">({item.attachments?.length || 0})</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50/30">
                            <TabsContent value="info" className="space-y-8 mt-0">
                                {/* Core Details */}
                                <section className="space-y-6">
                                    <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> Core Business Registry
                                    </h3>
                                    <div className="grid grid-cols-2 gap-8 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                            <Building2 size={80} className="text-slate-400" />
                                        </div>
                                        
                                        <div className="space-y-1 relative z-10">
                                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5"><Hash className="w-3" /> Entry Cipher</p>
                                            <p className="text-xl font-black text-slate-900">{item.entryNo}</p>
                                        </div>
                                        {item.companyName && (
                                            <div className="space-y-1 relative z-10">
                                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5"><Building2 className="w-3" /> Organization</p>
                                                <p className="text-lg font-black text-slate-700 flex items-center gap-2">
                                                     {item.companyName}
                                                </p>
                                            </div>
                                        )}
                                        {isContact && item.mobile && (
                                            <div className="space-y-1 relative z-10">
                                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5"><Phone className="w-3" /> Primary Line</p>
                                                <p className="text-lg font-black text-slate-700 flex items-center gap-2 truncate">
                                                    {item.mobile}
                                                </p>
                                            </div>
                                        )}
                                        {isContact && item.weChatId && (
                                            <div className="space-y-1 relative z-10">
                                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5"><MessageCircle className="w-3 text-emerald-600" /> WeChat Handle</p>
                                                <p className="text-lg font-mono font-black text-slate-700 truncate">{item.weChatId}</p>
                                            </div>
                                        )}
                                        {isContact && item.region && (
                                            <div className="space-y-1 relative z-10 col-span-2 mt-4 pt-4 border-t border-slate-50">
                                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5"><MapPin className="w-3" /> Geographic Logic</p>
                                                <p className="text-base font-black text-slate-700">{item.region} · {item.country || 'China'}</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Keywords & Tags */}
                                <section className="space-y-6">
                                    <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Package className="w-4 h-4 text-blue-600" /> Sourcing Intelligence
                                    </h3>
                                    <div className="space-y-8">
                                        <div className="flex flex-wrap gap-3">
                                            {[...(item.productKeywords || []), ...(item.relatedItems || [])].map(tag => (
                                                <Badge key={tag} className="bg-blue-600 text-white border-0 px-5 py-2.5 flex items-center gap-2 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-100">
                                                    <Package className="w-3 h-3" /> {tag}
                                                </Badge>
                                            ))}
                                            {(item.searchKeywords || []).map(tag => (
                                                <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600 border-2 border-slate-200 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                        {item.notes && (
                                            <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border-2 border-emerald-100 border-dashed relative overflow-hidden">
                                                <div className="absolute top-4 right-4 text-emerald-100 opacity-20"><FileText size={80} /></div>
                                                <p className="text-lg font-bold text-emerald-800 leading-relaxed italic relative z-10">
                                                    "{item.notes}"
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <div className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl border border-slate-200">
                                        <h3 className="text-[12px] font-black text-slate-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <History size={16} /> Discussion Timeline
                                        </h3>
                                        <button 
                                            onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                                            className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest py-2 px-6 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        >
                                            Add Intelligence Point
                                        </button>
                                    </div>

                                    {isNoteExpanded && (
                                        <form onSubmit={handleAddNote} className="space-y-4 animate-in fade-in slide-in-from-top-4 bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl">
                                            <textarea 
                                                className="w-full border-2 border-slate-100 rounded-3xl p-6 text-base font-bold text-slate-700 bg-slate-50 focus:bg-white focus:border-emerald-500 transition-all min-h-[120px] outline-none"
                                                placeholder="Document price trends, technical feasibility, or meeting outcomes..."
                                                value={note}
                                                onChange={(e) => setNote(e.target.value)}
                                            />
                                            <div className="flex justify-end gap-4">
                                                <button type="button" className="text-sm font-black text-slate-400 uppercase" onClick={() => setIsNoteExpanded(false)}>Discard</button>
                                                <Button type="submit" className="bg-emerald-600 text-white rounded-xl px-10 h-12 font-black">Archive Note</Button>
                                            </div>
                                        </form>
                                    )}

                                    <div className="space-y-6 pl-2">
                                        {(!Array.isArray(item.notesHistory) || item.notesHistory.length === 0) ? (
                                            <div className="text-center py-20 bg-slate-100/50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                                                <MessageCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Digital Archive Empty</p>
                                            </div>
                                        ) : item.notesHistory.slice().reverse().map((h, i) => (
                                            <div key={i} className="flex gap-8 group">
                                                <div className="flex flex-col items-center">
                                                    <div className="w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center text-slate-700 shadow-sm transition-all group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-700">
                                                        <FileText size={18} />
                                                    </div>
                                                    {i !== (item.notesHistory || []).length - 1 && <div className="w-1 flex-1 bg-slate-100 my-2 rounded-full" />}
                                                </div>
                                                <div className="flex-1 pb-8">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{h.user?.name || 'Systems Admin'}</span>
                                                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 uppercase tracking-tighter">
                                                                <Clock size={10} /> {h.date ? format(new Date(h.date), 'dd MMM yyyy') : '--'}
                                                            </span>
                                                        </div>
                                                        <Badge variant="ghost" className="text-[9px] bg-slate-100 text-slate-400 font-black tracking-widest">ARCHIVE v2</Badge>
                                                    </div>
                                                    <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm group-hover:shadow-md transition-all">
                                                        <p className="text-sm font-bold text-slate-600 leading-relaxed">{h.note}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </TabsContent>

                            <TabsContent value="links" className="mt-0">
                                <section className="space-y-8">
                                    <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <LinkIcon size={16} className="text-emerald-500" /> Relational Mapping Intelligence
                                    </h3>
                                    {(isContact ? item.groupIds : item.memberIds)?.length > 0 ? (
                                        (isContact ? item.groupIds : item.memberIds).map(link => (
                                            <div key={link._id || link} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all duration-300 group cursor-pointer">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-4 rounded-2xl transition-all group-hover:scale-110 ${isContact ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white shadow-lg'}`}>
                                                            {isContact ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-lg font-black text-slate-900 tracking-tight">
                                                                {isContact ? link.groupName : link.weChatDisplayName}
                                                            </p>
                                                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">
                                                                Alias: {isContact ? (link.chineseGroupName || link.groupAlias || 'DEFAULT GROUP') : (link.chineseName || 'INDIVIDUAL')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-50 p-3 rounded-xl transition-all group-hover:bg-emerald-50 group-hover:text-emerald-600">
                                                        <ChevronRight className="w-6 h-6" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                                            <LinkIcon className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                                            <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">No Digital Bindings Established</p>
                                        </div>
                                    )}
                                </section>
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
