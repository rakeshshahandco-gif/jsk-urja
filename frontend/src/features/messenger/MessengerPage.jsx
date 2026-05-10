import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMessenger } from '@/contexts/MessengerContext';
import { useAuth } from '@/hooks/useAuth';
import { ThreadList } from './components/ThreadList';
import { ChatWindow } from './components/ChatWindow';
import { NewThreadModal } from './components/NewThreadModal';
import { 
    MessageSquare, 
    Users, 
    MoreVertical,
    Search,
    PlusCircle,
    ArrowLeft
} from 'lucide-react';
import { ContactList } from './components/ContactList';
import styles from './MessengerPage.module.scss';
import clsx from 'clsx';

const MessengerPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user: currentUser } = useAuth();
    const { threads, activeThread, selectThread, loading } = useMessenger();
    const [isNewThreadModalOpen, setIsNewThreadModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [autoOpenDone, setAutoOpenDone] = useState(false);

    // Auto-open thread from popup click (?thread=<threadId>)
    useEffect(() => {
        if (autoOpenDone) return;
        const targetThreadId = searchParams.get('thread');
        if (!targetThreadId || threads.length === 0) return;
        const thread = threads.find(t => t._id === targetThreadId);
        if (thread) {
            selectThread(thread);
            setAutoOpenDone(true);
            // Clean up the URL
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, threads, selectThread, autoOpenDone, setSearchParams]);


    return (
        <div className={styles.container}>
            {/* Sidebar / Thread List Section */}
            <aside className={styles.sidebar}>
                {/* Sidebar Header */}
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarIcons}>
                        <div className={styles.actions}>
                             <button onClick={() => navigate('/')} className={styles.backBtn} title="Back to Dashboard">
                                 <ArrowLeft size={22} strokeWidth={2.5} />
                             </button>
                             <div className={styles.profile}>
                                 {/* User Initials or Avatar */}
                                 {currentUser?.name?.[0].toUpperCase() || 'U'}
                             </div>
                        </div>
                        <div className={styles.actions}>
                            <button onClick={() => setIsNewThreadModalOpen(true)} title="New Chat">
                                <PlusCircle size={22} strokeWidth={1.5} />
                            </button>
                            <button title="Menu">
                                <MoreVertical size={22} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>

                    {/* Search Area */}
                    <div className={styles.searchArea}>
                        <div className={styles.searchWrapper}>
                            <Search size={18} className={styles.searchIcon} strokeWidth={1.5} />
                            <input 
                                type="text" 
                                placeholder="Search or start new chat" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className={styles.filterTabs}>
                        {['all', 'unread', 'groups', 'broadcast', 'contacts'].map(filter => (
                            <button 
                                key={filter}
                                className={clsx(styles.tab, activeFilter === filter && styles.active)}
                                onClick={() => setActiveFilter(filter)}
                            >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Thread List Area */}
                <div className={styles.threadListArea}>
                    {activeFilter === 'contacts' ? (
                        <ContactList searchQuery={searchQuery} />
                    ) : (
                        <ThreadList 
                            searchQuery={searchQuery} 
                            filter={activeFilter} 
                        />
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className={styles.mainContent}>
                {activeThread ? (
                    <ChatWindow />
                ) : (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <MessageSquare size={80} strokeWidth={0.5} />
                        </div>
                        <h3>JSK Urja Messenger</h3>
                        <p>
                            Send and receive messages to your team members and groups in real-time. 
                            Select a chat to start messaging.
                        </p>
                        <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '8px', color: '#8696a0', fontSize: '12px' }}>
                           <Users size={14} />
                           <span>End-to-end encrypted</span>
                        </div>
                    </div>
                )}
            </main>

            {/* Modals */}
            {isNewThreadModalOpen && (
                <NewThreadModal onClose={() => setIsNewThreadModalOpen(false)} />
            )}
        </div>
    );
};

export default MessengerPage;
