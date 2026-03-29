import React, { useState, useEffect, useMemo } from 'react';
import { useMessenger } from '@/contexts/MessengerContext';
import { getUsers } from '@/services/userApi';
import { Modal, Button } from '@/components/ui';
import { Search, ArrowLeft, Users, Megaphone, Check, Plus, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export const NewThreadModal = ({ onClose }) => {
    const { createNewThread } = useMessenger();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [mode, setMode] = useState('single'); // 'single', 'group', 'broadcast'
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await getUsers();
                setUsers(data?.users || []);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            }
        };
        fetchUsers();
    }, []);

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const searchLower = searchTerm.toLowerCase();
            return u.name.toLowerCase().includes(searchLower) || 
                   (u.department?.name || '').toLowerCase().includes(searchLower);
        });
    }, [users, searchTerm]);

    const handleSelectUser = async (user) => {
        if (mode !== 'single') {
            const isSelected = selectedUsers.find(u => u._id === user._id);
            if (isSelected) {
                setSelectedUsers(prev => prev.filter(u => u._id !== user._id));
            } else {
                setSelectedUsers(prev => [...prev, user]);
            }
            return;
        }

        // Single Select: Create/Open Thread Immediately
        setLoading(true);
        try {
            await createNewThread({
                type: 'direct',
                participantIds: [user._id],
                firstMessage: `Hello ${user.name}!` 
            });
            onClose();
        } catch (error) {
            toast.error('Failed to start chat');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateThread = async () => {
        if (selectedUsers.length === 0) return;
        if (mode === 'group' && !groupName.trim()) {
            toast.error('Please enter a group name');
            return;
        }

        setLoading(true);
        try {
            const isBroadcast = mode === 'broadcast';
            await createNewThread({
                type: isBroadcast ? 'broadcast' : 'group',
                name: isBroadcast ? (groupName || 'New Broadcast') : groupName,
                participantIds: selectedUsers.map(u => u._id),
                firstMessage: isBroadcast ? 'Broadcast List Created' : 'Group Created'
            });
            onClose();
        } catch (error) {
            toast.error('Failed to create chat');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={true} 
            onClose={onClose} 
            title={false} // Custom header
            size="md"
            padding="0"
        >
            <div className="flex flex-col h-[600px] bg-white rounded-lg overflow-hidden">
                {/* Custom Header */}
                <div className="bg-[#008069] text-white px-5 py-6 flex items-center gap-6 shrink-0 h-[108px] relative overflow-hidden">
                    <button onClick={mode !== 'single' ? () => setMode('single') : onClose} className="hover:bg-black/10 p-1 rounded-full transition-colors active:scale-95 z-10">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1 z-10">
                        <h2 className="text-[19px] font-medium leading-none mb-1">
                            {mode === 'single' ? 'New chat' : (mode === 'group' ? 'Add group participants' : 'New broadcast')}
                        </h2>
                        <span className="text-[14px] opacity-80">
                            {mode === 'single' ? `${users.length} contacts` : `${selectedUsers.length} selected`}
                        </span>
                    </div>
                </div>

                {/* Search Bar / Group Name */}
                <div className="p-3 bg-white border-b border-slate-100 shadow-sm z-10">
                    {mode !== 'single' && (
                        <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-[#f0f2f5] rounded-lg border border-transparent focus-within:border-[#00a884] focus-within:bg-white transition-all">
                             <Hash size={18} className="text-[#54656f]" />
                             <input 
                                className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-[#8696a0]"
                                placeholder={mode === 'group' ? "Group name (required)" : "Broadcast name (optional)"}
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                autoFocus
                            />
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-2 rounded-lg border border-transparent focus-within:border-[#00a884] focus-within:bg-white transition-all">
                        <Search size={18} className="text-[#54656f]" />
                        <input 
                            className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-[#8696a0]"
                            placeholder="Search name or department"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    {/* Fixed Options */}
                    {mode === 'single' && !searchTerm && (
                        <div className="p-1">
                            <button 
                                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[#f5f6f6] rounded-xl transition-all text-left group"
                                onClick={() => setMode('group')}
                            >
                                <div className="w-11 h-11 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform">
                                    <Users size={22} strokeWidth={2.5} />
                                </div>
                                <span className="text-[16px] font-medium text-[#111b21] group-hover:text-[#00a884]">New group</span>
                            </button>
                            <button 
                                 className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[#f5f6f6] rounded-xl transition-all text-left group"
                                 onClick={() => setMode('broadcast')}
                            >
                                <div className="w-11 h-11 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform">
                                    <Megaphone size={20} strokeWidth={2.5} />
                                </div>
                                <span className="text-[16px] font-medium text-[#111b21] group-hover:text-[#00a884]">New broadcast</span>
                            </button>
                        </div>
                    )}

                    <div className="px-5 py-4 text-[13px] font-semibold text-[#00a884] uppercase tracking-[0.1em] bg-[#f9fafb]/50 border-y border-[#f0f2f5]">
                        Contacts on CRM
                    </div>

                    {filteredUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 text-[#8696a0]">
                             <Users size={48} strokeWidth={1} className="mb-4 opacity-20" />
                             <p className="text-[15px] italic">No contacts found</p>
                        </div>
                    ) : (
                        <div className="pb-4">
                            {filteredUsers.map(u => (
                                <div 
                                    key={u._id} 
                                    className={clsx(
                                        "flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors border-b border-[#f5f6f6] relative h-[72px]",
                                        selectedUsers.find(item => item._id === u._id) ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"
                                    )}
                                    onClick={() => handleSelectUser(u)}
                                >
                                    <div className="w-12 h-12 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#54656f] font-semibold text-base shrink-0 border border-slate-100">
                                        {u.name[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[16px] font-normal text-[#111b21] truncate leading-tight">{u.name}</p>
                                        <p className="text-[13.5px] text-[#667781] truncate mt-0.5">{u.department?.name || 'Staff member'}</p>
                                    </div>
                                    {mode !== 'single' && (
                                        <div className={clsx(
                                            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                                            selectedUsers.find(item => item._id === u._id) 
                                                ? "bg-[#00a884] border-[#00a884] text-white" 
                                                : "border-slate-300"
                                        )}>
                                            {selectedUsers.find(item => item._id === u._id) && <Check size={14} strokeWidth={3} />}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action Footer */}
                {mode !== 'single' && selectedUsers.length > 0 && (
                     <div className="absolute bottom-6 right-6 p-0 z-20 animate-in zoom-in-50 duration-200">
                        <button 
                            className="w-16 h-16 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-[#008f72] transition-transform active:scale-90"
                            onClick={handleCreateThread}
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Check size={32} strokeWidth={2.5} />
                            )}
                        </button>
                     </div>
                )}
            </div>
        </Modal>
    );
};
