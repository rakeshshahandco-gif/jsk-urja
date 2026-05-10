import React, { useState, useEffect, useMemo } from 'react';
import { useMessenger } from '@/contexts/MessengerContext';
import { getUsers } from '@/services/userApi';
import { useAuth } from '@/hooks/useAuth';
import { 
    Users, 
    UserPlus, 
    Megaphone, 
    Check, 
    Search,
    Loader2,
    MessageSquare
} from 'lucide-react';
import styles from '../MessengerPage.module.scss';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const AVATAR_COLORS = [
    '#FF8A8A', '#8AEEFF', '#B08AFF', '#FFAE8A', 
    '#9BFF8A', '#FF8AFB', '#8A96FF', '#FFD88A'
];

const getAvatarColor = (name = '') => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const ContactList = ({ searchQuery }) => {
    const { createNewThread, threads, selectThread } = useMessenger();
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [multiSelectMode, setMultiSelectMode] = useState(null); // null, 'group', 'broadcast'
    const [selectedUserIds, setSelectedUserIds] = useState(new Set());

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await getUsers();
                // Filter out current user
                const filtered = (data?.users || []).filter(u => u._id !== currentUser._id);
                setUsers(filtered);
            } catch (error) {
                console.error('Failed to fetch users:', error);
                toast.error('Failed to load contacts');
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, [currentUser._id]);

    const filteredUsers = useMemo(() => {
        if (!searchQuery) return users;
        const s = searchQuery.toLowerCase();
        return users.filter(u => 
            u.name.toLowerCase().includes(s) || 
            (u.department?.name || '').toLowerCase().includes(s)
        );
    }, [users, searchQuery]);

    const handleUserClick = async (user) => {
        if (multiSelectMode) {
            const next = new Set(selectedUserIds);
            if (next.has(user._id)) next.delete(user._id);
            else next.add(user._id);
            setSelectedUserIds(next);
            return;
        }

        // Check if thread already exists
        const existingThread = threads.find(t => 
            t.type === 'direct' && 
            t.participants.some(p => p._id === user._id)
        );

        if (existingThread) {
            selectThread(existingThread);
            return;
        }

        // Create new thread
        try {
            await createNewThread({
                type: 'direct',
                participantIds: [user._id],
                firstMessage: `Hi ${user.name}!`
            });
        } catch (error) {
            // Error handled in context
        }
    };

    const handleActionClick = async () => {
        if (selectedUserIds.size === 0) return;
        
        const type = multiSelectMode === 'group' ? 'group' : 'broadcast';
        const name = multiSelectMode === 'group' ? prompt('Enter Group Name:') : 'New Broadcast';
        
        if (multiSelectMode === 'group' && !name) return;

        try {
            await createNewThread({
                type,
                name,
                participantIds: Array.from(selectedUserIds),
                firstMessage: type === 'group' ? 'Group created' : 'Broadcast list created'
            });
            setMultiSelectMode(null);
            setSelectedUserIds(new Set());
        } catch (error) {
            // Error handled in context
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-[#8696a0]">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>Loading contacts...</p>
            </div>
        );
    }

    return (
        <div className={styles.contactList}>
            {/* Quick Actions */}
            {!searchQuery && !multiSelectMode && (
                <div className={styles.quickActions}>
                    <div 
                        className={styles.actionItem}
                        onClick={() => setMultiSelectMode('group')}
                    >
                        <div className={clsx(styles.actionIcon, styles.bgGroup)}>
                            <Users size={24} />
                        </div>
                        <div className={styles.actionInfo}>
                            <h4>New group</h4>
                        </div>
                    </div>
                    <div 
                        className={styles.actionItem}
                        onClick={() => setMultiSelectMode('broadcast')}
                    >
                        <div className={clsx(styles.actionIcon, styles.bgBroadcast)}>
                            <Megaphone size={22} />
                        </div>
                        <div className={styles.actionInfo}>
                            <h4>New broadcast</h4>
                        </div>
                    </div>
                </div>
            )}

            {multiSelectMode && (
                <div className="px-4 py-3 bg-[#f0f2f5] flex items-center justify-between border-b">
                    <span className="text-[14px] font-medium text-[#008069]">
                        {multiSelectMode === 'group' ? 'Select group participants' : 'Select broadcast recipients'}
                        ({selectedUserIds.size} selected)
                    </span>
                    <button 
                        onClick={() => { setMultiSelectMode(null); setSelectedUserIds(new Set()); }}
                        className="text-[13px] text-[#54656f] hover:underline"
                    >
                        Cancel
                    </button>
                </div>
            )}

            <div className={styles.contactSectionHeader}>
                Contacts on CRM
            </div>

            {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[#8696a0]">
                    <MessageSquare size={40} strokeWidth={1} className="opacity-20 mb-2" />
                    <p className="text-sm">No contacts found</p>
                </div>
            ) : (
                filteredUsers.map(u => (
                    <div 
                        key={u._id} 
                        className={styles.contactItem}
                        onClick={() => handleUserClick(u)}
                    >
                        <div 
                            className={styles.contactAvatar}
                            style={{ backgroundColor: getAvatarColor(u.name) }}
                        >
                            {u.name[0].toUpperCase()}
                        </div>
                        <div className={styles.contactInfo}>
                            <h4>{u.name}</h4>
                            <p>{u.department?.name || 'Contact on CRM'}</p>
                        </div>
                        {multiSelectMode && (
                            <div className={clsx(
                                styles.multiSelectBadge,
                                selectedUserIds.has(u._id) && styles.selected
                            )}>
                                {selectedUserIds.has(u._id) && <Check size={14} />}
                            </div>
                        )}
                    </div>
                ))
            )}

            {multiSelectMode && selectedUserIds.size > 0 && (
                <div className={styles.multiSelectActions}>
                    <button onClick={handleActionClick}>
                        <Check size={28} />
                    </button>
                </div>
            )}
        </div>
    );
};
