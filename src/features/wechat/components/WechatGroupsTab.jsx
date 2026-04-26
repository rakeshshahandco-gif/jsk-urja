import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users, Shield, MessageSquare, ChevronRight, Package, Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getWeChatGroups, api } from '../../../services/weChatApi';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { BrandedLoader } from '../../../components/ui/BrandedLoading';

const WechatGroupsTab = ({ onSelectGroup }) => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const res = await getWeChatGroups({ search: searchTerm });
            setGroups(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load groups');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGroup = async (e, groupId) => {
        e.stopPropagation();
        if (!window.confirm('Delete this group?')) return;
        try {
            await api.delete(`/wechat/groups/${groupId}`);
            toast.success('Group deleted');
            fetchGroups();
        } catch (err) {
            toast.error('Failed to delete group');
        }
    };

    return (
        <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">WeChat Groups</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Track multi-member supplier groups and technical chats</p>
                </div>
                <Button onClick={() => navigate('/china-supplier/groups/new')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 px-6 shadow-lg shadow-emerald-100 transition-all active:scale-95">
                    <Plus size={20} /> New Group (Deep Sync)
                </Button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex gap-4 items-center shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search group name, alias or purpose..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchGroups()}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-xl font-bold outline-none transition-all"
                    />
                </div>
                <Button variant="ghost" onClick={fetchGroups} className="rounded-xl font-bold px-8 h-12">Search</Button>
            </div>

            {/* Groups Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-64"><BrandedLoader size={100} /></div>
                ) : groups.length === 0 ? (
                    <div className="bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 h-64 flex flex-col items-center justify-center text-slate-400">
                        <Users size={48} className="mb-4 opacity-20" />
                        <p className="font-bold tracking-widest uppercase text-xs">No groups found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groups.map(group => (
                            <div 
                                key={group._id} 
                                onClick={() => navigate(`/china-supplier/groups/edit/${group._id}`)}
                                className="bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:shadow-2xl hover:border-emerald-400 transition-all cursor-pointer group relative overflow-hidden flex flex-col h-full"
                            >
                                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); navigate(`/china-supplier/groups/edit/${group._id}`); }}
                                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <button 
                                        onClick={(e) => handleDeleteGroup(e, group._id)}
                                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-5 mb-6">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center text-emerald-600 font-black text-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                                        {group.groupName?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <Badge className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 border-0 mb-1">
                                            {group.category || 'General'}
                                        </Badge>
                                        <h4 className="text-2xl font-black text-slate-800 leading-tight truncate">{group.groupName}</h4>
                                    </div>
                                </div>
                                <div className="space-y-3 flex-1">
                                    <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                                        <Shield size={16} className="text-slate-300 flex-shrink-0" />
                                        <span className="truncate">Alias: {group.groupAlias || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                                        <Package size={16} className="text-slate-300 flex-shrink-0" />
                                        <span className="truncate">{group.purpose || 'No Purpose Defined'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                                        <MessageSquare size={16} className="text-slate-300 flex-shrink-0" />
                                        <span>Click to <span className="text-emerald-600 font-black italic">Manage Sync</span></span>
                                    </div>
                                </div>
                                <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <Badge variant="outline" className="text-[10px] font-black uppercase border-slate-100 text-slate-400 bg-slate-50">{group.groupSource}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ImageIcon size={18} className="text-slate-200" />
                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Master Synced</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WechatGroupsTab;
