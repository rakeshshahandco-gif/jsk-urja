import React from 'react';
import { useMessenger } from '@/contexts/MessengerContext';
import { ThreadListItem } from './ThreadListItem';
import { Coffee, MessageSquareDashed } from 'lucide-react';

export const ThreadList = ({ searchQuery, filter }) => {
    const { threads, activeThread, selectThread } = useMessenger();

    const filteredThreads = threads.filter(thread => {
        // 1. Tab filtering
        const normalizedFilter = filter.toLowerCase();
        if (normalizedFilter === 'unread' && (thread.unreadCount || 0) <= 0) return false;
        if (normalizedFilter === 'groups' && thread.type !== 'group') return false;
        if (normalizedFilter === 'broadcast' && thread.type !== 'broadcast') return false;

        // 2. Search filtering
        if (!searchQuery) return true;
        const search = searchQuery.toLowerCase();
        
        // Search by thread name (if group/broadcast)
        if (thread.name && thread.name.toLowerCase().includes(search)) return true;
        
        // Search by participant names
        return thread.participants.some(p => 
            p.name?.toLowerCase().includes(search)
        );
    });

    if (filteredThreads.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', textAlign: 'center', color: '#8696a0' }}>
                <MessageSquareDashed size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.3 }} />
                <p style={{ fontSize: '15px', fontWeight: '300', margin: 0 }}>No conversations found</p>
                <p style={{ fontSize: '13px', opacity: 0.7, margin: 0 }}>Try searching for something else</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '80px' }}>
            {filteredThreads.map(thread => (
                <ThreadListItem 
                    key={thread._id}
                    thread={thread}
                    isActive={activeThread?._id === thread._id}
                    onClick={() => selectThread(thread)}
                />
            ))}
        </div>
    );
};
