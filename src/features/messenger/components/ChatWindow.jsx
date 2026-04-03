import React, { useRef, useEffect, useMemo } from 'react';
import { useMessenger } from '@/contexts/MessengerContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { useAuth } from '@/hooks/useAuth';
import { MoreVertical, Search, Users, UserPlus } from 'lucide-react';
import { isToday, isYesterday, format, isSameDay } from 'date-fns';
import clsx from 'clsx';
import styles from '../MessengerPage.module.scss';

export const ChatWindow = () => {
    const { activeThread, messages, loading, typingUsers, onlineUsers } = useMessenger();
    const { user: currentUser } = useAuth();
    const scrollRef = useRef(null);
    const prevThreadIdRef = useRef(activeThread?._id);
    const [showNewMsgBubble, setShowNewMsgBubble] = useState(false);

    // Smart auto-scroll logic
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const isThreadChanged = prevThreadIdRef.current !== activeThread?._id;
        prevThreadIdRef.current = activeThread?._id;

        // If thread changed, always scroll to bottom
        if (isThreadChanged) {
            el.scrollTop = el.scrollHeight;
            setShowNewMsgBubble(false);
            return;
        }

        // For new messages, see if we are already at bottom (within 100px)
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        
        if (isAtBottom) {
            el.scrollTop = el.scrollHeight;
            setShowNewMsgBubble(false);
        } else {
            // User is scrolling up, show indicator
            setShowNewMsgBubble(true);
        }
    }, [messages, activeThread]);

    const handleScroll = (e) => {
        const el = e.target;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        if (isAtBottom && showNewMsgBubble) {
            setShowNewMsgBubble(false);
        }
    };

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setShowNewMsgBubble(false);
        }
    };

    const isDirect = activeThread?.type === 'direct';
    const otherUser = isDirect 
        ? activeThread.participants.find(p => p._id !== currentUser._id) 
        : null;
    
    const displayName = isDirect 
        ? (otherUser?.name || 'User') 
        : (activeThread.name || 'Group Chat');

    const initials = displayName
        .split(' ')
        .filter(n => n)
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

    const isTyping = typingUsers[activeThread?._id]?.length > 0;
    const isOnline = isDirect && otherUser && onlineUsers.has(otherUser._id);

    const statusText = useMemo(() => {
        if (isTyping) {
            if (isDirect) return "typing...";
            const typistId = typingUsers[activeThread._id][0];
            const typist = activeThread.participants.find(p => p._id === typistId);
            return `${typist?.name || 'Someone'} is typing...`;
        }
        if (isDirect) {
            return isOnline ? "online" : (otherUser?.designation || "Click here for contact info");
        }
        return `${activeThread.participants?.length || 0} participants`;
    }, [isTyping, isDirect, activeThread, otherUser, isOnline, typingUsers]);

    const messageGroups = useMemo(() => {
        const groups = [];
        messages.forEach((msg, idx) => {
            const msgDate = new Date(msg.createdAt);
            const prevMsg = messages[idx - 1];
            const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null;

            if (!prevDate || !isSameDay(msgDate, prevDate)) {
                let dateLabel = format(msgDate, 'dd MMMM yyyy');
                if (isToday(msgDate)) dateLabel = 'TODAY';
                else if (isYesterday(msgDate)) dateLabel = 'YESTERDAY';
                
                groups.push({ type: 'date', label: dateLabel });
            }
            groups.push({ type: 'message', data: msg });
        });
        return groups;
    }, [messages]);

    return (
        <div className={styles.mainContent}>
            {/* WhatsApp Style Header */}
            <header className={styles.chatHeader}>
                <div className={styles.chatInfo}>
                    <div className={styles.avatar}>
                        {isDirect ? initials : <Users size={20} />}
                    </div>
                    <div className={styles.details}>
                        <h3>{displayName}</h3>
                        <span className={clsx(isTyping && styles.typing)}>{statusText}</span>
                    </div>
                </div>
                <div className={styles.actions}>
                    <button><Search size={20} /></button>
                    {!isDirect && (
                        <button title="Add Participants">
                            <UserPlus size={20} />
                        </button>
                    )}
                    <button><MoreVertical size={20} /></button>
                </div>
            </header>

            {/* Message Area */}
            <div ref={scrollRef} className={styles.messageArea} onScroll={handleScroll}>
                {loading && (
                    <div style={{ textAlign: 'center', margin: '10px 0' }}>
                        <span style={{ fontSize: '11px', color: '#667781', background: '#fff9c2', padding: '4px 10px', borderRadius: '4px' }}>
                            Loading messages...
                        </span>
                    </div>
                )}
                
                {messageGroups.map((item, idx) => (
                    item.type === 'date' ? (
                        <div key={`date-${idx}`} style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                            <span style={{ background: '#fff', fontSize: '12px', padding: '5px 12px', borderRadius: '8px', color: '#54656f', boxShadow: '0 1px 0.5px rgba(0,0,0,0.1)' }}>
                                {item.label}
                            </span>
                        </div>
                    ) : (
                        <MessageBubble 
                            key={item.data._id} 
                            message={item.data} 
                            isOwn={item.data.sender._id === currentUser._id || item.data.sender === currentUser._id}
                            showSenderName={!isDirect && item.data.sender?._id !== currentUser._id}
                        />
                    )
                ))}
            </div>

            {/* Float to Bottom Indicator */}
            {showNewMsgBubble && (
                <div style={{ position: 'absolute', bottom: '80px', right: '30px', zIndex: 10 }}>
                    <button 
                        onClick={scrollToBottom}
                        style={{ background: '#25d366', color: '#fff', border: 'none', borderRadius: '20px', padding: '8px 16px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                    >
                        New messages ↓
                    </button>
                </div>
            )}

            {/* Bottom Composer Area */}
            <MessageComposer />
        </div>
    );
};
