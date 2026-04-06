import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import * as messengerApi from '../services/messengerApi';
import toast from 'react-hot-toast';
import { useLiveNotification } from '@/components/ui/LiveNotificationPopup';
import { showBrowserNotification } from '@/utils/browserNotification';
import { env } from '@/config/env';

const MessengerContext = createContext();
export const useMessenger = () => useContext(MessengerContext);

export const MessengerProvider = ({ children }) => {
    const { user, token } = useAuth();
    const { socket } = useSocket();
    const { showPopup } = useLiveNotification();

    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);
    const [messages, setMessages] = useState([]);
    const [unreadTotal, setUnreadTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    // Dedup guard for message popups
    const seenMsgIds = useRef(new Set());

    // ── Keep active thread ref in sync ────────────────────────────────────
    const activeThreadRef = useRef(activeThread);
    useEffect(() => {
        activeThreadRef.current = activeThread;
    }, [activeThread]);

    // ── Initial Data Fetch ────────────────────────────────────────────────
    const fetchThreads = useCallback(async () => {
        if (!user) return;
        try {
            const data = await messengerApi.getMyThreads();
            setThreads(data || []);
        } catch (error) {
            console.error('Failed to fetch threads:', error);
        }
    }, [user]);

    const fetchUnreadTotal = useCallback(async () => {
        if (!user) return;
        try {
            const data = await messengerApi.getUnreadSummary();
            setUnreadTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch unread total:', error);
        }
    }, [user]);

    // ── Initial Load ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        fetchThreads();
        fetchUnreadTotal();
    }, [user, fetchThreads, fetchUnreadTotal]);

    // ── Socket.IO Event Listeners ─────────────────────────────────────────
    useEffect(() => {
        if (!socket || !user) return;

        const handleChatMessage = ({ threadId, message }) => {
            const currentActive = activeThreadRef.current;

            // If sender is the current user, skip popup
            const senderIdStr = message?.sender?._id?.toString() || message?.sender?.toString();
            const myIdStr = user._id?.toString();
            const isMine = senderIdStr && myIdStr && senderIdStr === myIdStr;

            // ── Update threads list ──────────────────────────────────────
            setThreads(prev => {
                const index = prev.findIndex(t => t._id === threadId);
                if (index === -1) {
                    fetchThreads(); // new thread not yet in local state
                    return prev;
                }
                const updatedThreads = [...prev];
                const thread = { ...updatedThreads[index] };
                thread.lastMessage = {
                    content: message.content,
                    sender: message.sender,
                    timestamp: message.createdAt
                };
                // Increment unread only if not viewing this thread AND not sender
                if ((!currentActive || currentActive._id !== threadId) && !isMine) {
                    thread.unreadCount = (thread.unreadCount || 0) + 1;
                    setUnreadTotal(t => t + 1);
                }
                updatedThreads.splice(index, 1);
                updatedThreads.unshift(thread);
                return updatedThreads;
            });

            // ── Append to active window ──────────────────────────────────
            if (currentActive && currentActive._id?.toString() === threadId?.toString()) {
                setMessages(prev => {
                    // Dedup by message _id
                    if (message._id && prev.some(m => m._id === message._id)) return prev;
                    return [...prev, message];
                });
                if (!isMine) {
                    messengerApi.markThreadRead(threadId).catch(console.error);
                }
                return; // In view — no popup needed
            }

            // ── Show popup to receiving user (not sender) ─────────────────
            if (!isMine) {
                const msgId = message._id || `msg-${Date.now()}`;

                // Dedup guard
                if (seenMsgIds.current.has(msgId)) return;
                seenMsgIds.current.add(msgId);
                setTimeout(() => seenMsgIds.current.delete(msgId), 30000);

                // Find thread info for group name
                const threadInfo = threads.find(t => t._id === threadId) || {};
                const isGroup = threadInfo.type === 'group' || threadInfo.type === 'broadcast';
                const groupName = isGroup ? (threadInfo.name || 'Group Chat') : null;
                const senderName = message.sender?.name || 'Someone';

                showPopup({
                    id: msgId,
                    type: 'MESSENGER',
                    title: senderName,
                    message: message.content,
                    actorName: senderName,
                    actorAvatar: null,
                    groupName,
                    navigateTo: `/messenger?thread=${threadId}`,
                    createdAt: message.createdAt,
                });

                // Browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    showBrowserNotification({
                        title: `💬 ${senderName}${groupName ? ` · ${groupName}` : ''}`,
                        body: message.content,
                        url: `/messenger?thread=${threadId}`,
                        tag: `crm-msg-${threadId}`,
                        backendUrl: env.SOCKET_URL,
                    });
                }
            }
        };

        const handleMessageDeleted = ({ threadId, messageId }) => {
            const currentActive = activeThreadRef.current;
            if (currentActive && currentActive._id === threadId) {
                setMessages(prev => prev.filter(m => m._id !== messageId));
            }
        };

        const handleThreadCreated = ({ thread, message }) => {
            setThreads(prev => {
                if (prev.some(t => t._id === thread._id)) return prev; // already known
                return [thread, ...prev];
            });
            // If I'm not the sender, also trigger a message event
            const senderIdStr = message?.sender?._id?.toString() || message?.sender?.toString();
            const myIdStr = user._id?.toString();
            if (senderIdStr !== myIdStr) {
                // Trigger the chat message handler to show popup
                handleChatMessage({ threadId: thread._id, message });
            }
        };

        const handleMessageSeen = ({ threadId, userId }) => {
            const currentActive = activeThreadRef.current;
            if (currentActive && currentActive._id === threadId) {
                setMessages(prev => prev.map(m => {
                    if (m.sender._id !== userId && !m.readBy?.some(r => r.user === userId)) {
                        return { ...m, readBy: [...(m.readBy || []), { user: userId, readAt: new Date() }] };
                    }
                    return m;
                }));
            }
        };

        const handleUnreadUpdate = ({ total }) => {
            setUnreadTotal(total);
        };

        const handleTyping = ({ threadId, userId }) => {
            setTypingUsers(prev => {
                const users = prev[threadId] || [];
                if (!users.includes(userId)) {
                    return { ...prev, [threadId]: [...users, userId] };
                }
                return prev;
            });
        };

        const handleStopTyping = ({ threadId, userId }) => {
            setTypingUsers(prev => {
                const users = prev[threadId] || [];
                return { ...prev, [threadId]: users.filter(id => id !== userId) };
            });
        };

        const handleUserOnline = ({ userId }) => {
            setOnlineUsers(prev => new Set([...prev, userId]));
        };

        const handleUserOffline = ({ userId }) => {
            setOnlineUsers(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        };

        // On reconnect: re-sync unread counts
        const handleConnect = () => {
            console.log('🔄 MessengerContext: Reconnected — syncing unread counts...');
            fetchUnreadTotal();
            fetchThreads();
        };

        socket.on('messenger:new_message', handleChatMessage);
        socket.on('chat:message', handleChatMessage);
        socket.on('messenger:message_deleted', handleMessageDeleted);
        socket.on('messenger:thread_created', handleThreadCreated);
        socket.on('messenger:message_seen', handleMessageSeen);
        socket.on('messenger:unread_update', handleUnreadUpdate);
        socket.on('messenger:typing', handleTyping);
        socket.on('messenger:stop_typing', handleStopTyping);
        socket.on('messenger:user_online', handleUserOnline);
        socket.on('messenger:user_offline', handleUserOffline);
        socket.on('connect', handleConnect);

        return () => {
            socket.off('messenger:new_message', handleChatMessage);
            socket.off('chat:message', handleChatMessage);
            socket.off('messenger:message_deleted', handleMessageDeleted);
            socket.off('messenger:thread_created', handleThreadCreated);
            socket.off('messenger:message_seen', handleMessageSeen);
            socket.off('messenger:unread_update', handleUnreadUpdate);
            socket.off('messenger:typing', handleTyping);
            socket.off('messenger:stop_typing', handleStopTyping);
            socket.off('messenger:user_online', handleUserOnline);
            socket.off('messenger:user_offline', handleUserOffline);
            socket.off('connect', handleConnect);
        };
    // NOTE: `threads` is intentionally omitted from deps to keep the handler stable
    // `activeThreadRef` is used for activeThread to avoid stale closure
    }, [socket, user, fetchThreads, fetchUnreadTotal, showPopup]);

    // ── Background polling (1-min safety net, replaces the 1-second aggressive poll) ──
    useEffect(() => {
        if (!user) return;

        const intervalId = setInterval(async () => {
            try {
                const threadData = await messengerApi.getMyThreads();
                if (threadData) {
                    setThreads(prev => JSON.stringify(prev) === JSON.stringify(threadData) ? prev : threadData);
                }
                const unreadData = await messengerApi.getUnreadSummary();
                if (unreadData) {
                    setUnreadTotal(prev => prev === unreadData.total ? prev : unreadData.total);
                }
                const currentActive = activeThreadRef.current;
                if (currentActive) {
                    const msgData = await messengerApi.getMessages(currentActive._id);
                    if (msgData?.messages) {
                        setMessages(prev => JSON.stringify(prev) === JSON.stringify(msgData.messages) ? prev : msgData.messages);
                    }
                }
            } catch (e) {
                // silent fallback
            }
        }, 60000); // 60 seconds instead of 1 second

        return () => clearInterval(intervalId);
    }, [user, fetchThreads, fetchUnreadTotal]);

    // ── Actions ───────────────────────────────────────────────────────────
    const selectThread = async (thread) => {
        setLoading(true);
        setActiveThread(thread);
        try {
            const data = await messengerApi.getMessages(thread._id);
            setMessages(data.messages || []);
            if (thread.unreadCount > 0) {
                await messengerApi.markThreadRead(thread._id);
                setThreads(prev => prev.map(t =>
                    t._id === thread._id ? { ...t, unreadCount: 0 } : t
                ));
                fetchUnreadTotal();
            }
        } catch (error) {
            toast.error('Failed to load messages');
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async (content, attachments = [], replyTo = null) => {
        if (!activeThread || (!content.trim() && attachments.length === 0)) return;
        
        const currentThreadId = activeThread._id;
        
        try {
            const returnedMessage = await messengerApi.sendMessage(currentThreadId, {
                content: content.trim(),
                replyTo: replyTo || null
            });
            
            // Eagerly append sent message to local state if we are still on the same thread
            if (returnedMessage) {
                setMessages(prev => {
                    if (prev.some(m => m._id === returnedMessage._id)) return prev;
                    return [...prev, returnedMessage];
                });

                setThreads(prev => {
                    const idx = prev.findIndex(t => t._id?.toString() === currentThreadId?.toString());
                    if (idx === -1) return prev;
                    const updated = [...prev];
                    const thread = { ...updated[idx] };
                    thread.lastMessage = {
                        content: returnedMessage.content,
                        sender: returnedMessage.sender,
                        timestamp: returnedMessage.createdAt
                    };
                    updated.splice(idx, 1);
                    updated.unshift(thread);
                    return updated;
                });
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('Failed to send message');
        }
    };

    const startTyping = () => {
        if (!activeThread || !socket) return;
        socket.emit('messenger:typing', {
            threadId: activeThread._id,
            participantIds: activeThread.participants.map(p => p._id),
        });
    };

    const stopTyping = () => {
        if (!activeThread || !socket) return;
        socket.emit('messenger:stop_typing', {
            threadId: activeThread._id,
            participantIds: activeThread.participants.map(p => p._id),
        });
    };

    const createNewThread = async (payload) => {
        try {
            const data = await messengerApi.createThread(payload);
            selectThread(data.thread);
            return data;
        } catch (error) {
            toast.error(error.message || 'Failed to create thread');
            throw error;
        }
    };

    return (
        <MessengerContext.Provider value={{
            threads,
            activeThread,
            messages,
            unreadTotal,
            loading,
            typingUsers,
            onlineUsers,
            selectThread,
            sendMessage,
            startTyping,
            stopTyping,
            createNewThread,
            fetchThreads
        }}>
            {children}
        </MessengerContext.Provider>
    );
};
