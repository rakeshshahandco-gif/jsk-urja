import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMessenger } from '@/contexts/MessengerContext';
import { isToday, isYesterday, format } from 'date-fns';
import { Users, Megaphone, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import styles from '../MessengerPage.module.scss';

export const ThreadListItem = ({ thread, isActive, onClick }) => {
    const { user: currentUser } = useAuth();
    const { typingUsers, onlineUsers } = useMessenger();
    
    const isDirect = thread.type === 'direct';
    const isBroadcast = thread.type === 'broadcast';
    
    const otherUser = isDirect 
        ? thread.participants.find(p => p._id !== currentUser._id) 
        : null;
    
    const displayName = isDirect 
        ? (otherUser?.name || 'User') 
        : (thread.name || (isBroadcast ? 'Broadcast List' : 'Group Chat'));
    
    const initials = displayName
        .split(' ')
        .filter(n => n)
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

    const lastMessage = thread.lastMessage;
    const time = lastMessage?.timestamp 
        ? (isToday(new Date(lastMessage.timestamp)) 
            ? format(new Date(lastMessage.timestamp), 'h:mm a') 
            : isYesterday(new Date(lastMessage.timestamp))
                ? 'Yesterday'
                : format(new Date(lastMessage.timestamp), 'dd/MM/yy'))
        : '';

    const isTyping = typingUsers[thread._id]?.length > 0;
    const isOnline = isDirect && otherUser && onlineUsers.has(otherUser._id);
    const isOutgoing = lastMessage?.sender?._id === currentUser._id || lastMessage?.sender === currentUser._id;
    const isRead = thread.unreadCount === 0;

    return (
        <div 
            className={clsx(styles.threadItem, isActive && styles.active)}
            onClick={onClick}
        >
            <div className={styles.avatarWrapper}>
                <div className={clsx(
                    styles.avatar,
                    isBroadcast ? styles.broadcast : (isDirect ? styles.direct : styles.group)
                )}>
                    {isDirect ? initials : (isBroadcast ? <Megaphone size={18} /> : <Users size={20} />)}
                </div>
                {isOnline && <div className={styles.onlineStatus}></div>}
            </div>

            <div className={styles.itemContent}>
                <div className={styles.itemTop}>
                    <h3>{displayName}</h3>
                    <span className={clsx(styles.time, !isRead && styles.unread)}>{time}</span>
                </div>
                
                <div className={styles.itemBottom}>
                    <div className={styles.previewWrapper}>
                        {isOutgoing && (
                             <span className={clsx(styles.statusIcon, isRead && styles.read)}>
                                <CheckCheck size={16} />
                             </span>
                        )}
                        <p className={clsx(
                            isTyping && styles.typing,
                            !isRead && styles.unread
                        )}>
                            {isTyping ? "typing..." : (lastMessage?.content || "No messages yet")}
                        </p>
                    </div>
                    
                    {!isRead && (
                        <span className={styles.unreadBadge}>{thread.unreadCount}</span>
                    )}
                </div>
            </div>
        </div>
    );
};
