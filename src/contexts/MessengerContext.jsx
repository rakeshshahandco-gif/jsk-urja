import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import * as messengerApi from '../services/messengerApi';
import toast from 'react-hot-toast';
import { MessageSquare, X, ExternalLink } from 'lucide-react';
import { showBrowserNotification } from '@/utils/browserNotification';

const MessengerContext = createContext();

export const useMessenger = () => useContext(MessengerContext);

export const MessengerProvider = ({ children }) => {
    const { user, token } = useAuth();
    const { socket } = useSocket();
    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);
    const [messages, setMessages] = useState([]);
    const [unreadTotal, setUnreadTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [typingUsers, setTypingUsers] = useState({}); // { threadId: [userIds] }
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    
    // ── Actions ──────────────────────────────────────────────
    const showMessageToast = useCallback((message, title = 'New Message') => {
        toast.custom((t) => (
            <div
                className={`${
                    t.visible ? 'animate-enter' : 'animate-leave'
                } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 border-green-500`}
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
            >
                <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 pt-0.5">
                            {message.sender?.avatar ? (
                                <img
                                    className="h-12 w-12 rounded-full ring-2 ring-green-100 object-cover"
                                    src={message.sender.avatar}
                                    alt={message.sender.name}
                                />
                            ) : (
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold border-2 border-green-200">
                                    {message.sender?.name?.charAt(0).toUpperCase() || <MessageSquare size={20} />}
                                </div>
                            )}
                        </div>
                        <div className="ml-4 flex-1">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                                {title}: {message.sender?.name || 'User'}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                {message.content}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col border-l border-gray-100">
                    <button
                        onClick={() => {
                            toast.dismiss(t.id);
                            window.location.href = `/messenger`;
                        }}
                        className="w-full border border-transparent rounded-none flex items-center justify-center text-sm font-semibold text-green-600 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 h-1/2 px-4"
                    >
                        <ExternalLink size={16} className="mr-2" />
                        Reply
                    </button>
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="w-full border border-transparent rounded-none flex items-center justify-center text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 h-1/2 px-4"
                    >
                        <X size={16} className="mr-2" />
                        Close
                    </button>
                </div>
            </div>
        ), {
            duration: 5000,
            position: 'top-right',
        });
    }, []);

    // ── Fetch Initial Data ──────────────────────────────────────
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

    const activeThreadRef = useRef(activeThread);
    useEffect(() => {
        activeThreadRef.current = activeThread;
    }, [activeThread]);

    // ── Socket.IO Event Listeners ──────────────────────────────
    useEffect(() => {
        if (socket && user) {
                const handleChatMessage = ({ threadId, message }) => {
                    const currentActive = activeThreadRef.current;
                    
                    setThreads(prev => {
                        const index = prev.findIndex(t => t._id === threadId);
                        if (index === -1) {
                             fetchThreads();
                             return prev;
                        }
                        const updatedThreads = [...prev];
                        const thread = { ...updatedThreads[index] };
                        thread.lastMessage = {
                            content: message.content,
                            sender: message.sender,
                            timestamp: message.createdAt
                        };
                        if (!currentActive || currentActive._id !== threadId) {
                            thread.unreadCount = (thread.unreadCount || 0) + 1;
                            setUnreadTotal(t => t + 1);
                        }
                        
                        updatedThreads.splice(index, 1);
                        updatedThreads.unshift(thread);
                        return updatedThreads;
                    });

                    if (currentActive && currentActive._id === threadId) {
                        setMessages(prev => [...prev, message]);
                        messengerApi.markThreadRead(threadId).catch(console.error);
                    }
                };

                socket.on('messenger:new_message', handleChatMessage);
                socket.on('chat:message', handleChatMessage);
                
                socket.on('messenger:message_deleted', ({ threadId, messageId }) => {
                    const currentActive = activeThreadRef.current;
                    if (currentActive && currentActive._id === threadId) {
                        setMessages(prev => prev.filter(m => m._id !== messageId));
                    }
                });

            socket.on('messenger:thread_created', ({ thread, message }) => {
                setThreads(prev => [thread, ...prev]);
                if (message.sender._id !== user._id) {
                    setUnreadTotal(t => t + 1);
                }
            });

            socket.on('messenger:message_seen', ({ threadId, userId }) => {
                const currentActive = activeThreadRef.current;
                if (currentActive && currentActive._id === threadId) {
                    setMessages(prev => prev.map(m => {
                        if (m.sender._id !== userId && !m.readBy?.some(r => r.user === userId)) {
                             return { ...m, readBy: [...(m.readBy || []), { user: userId, readAt: new Date() }] };
                        }
                        return m;
                    }));
                }
            });

            socket.on('messenger:unread_update', ({ total }) => {
                setUnreadTotal(total);
            });

            socket.on('messenger:typing', ({ threadId, userId }) => {
                setTypingUsers(prev => {
                    const users = prev[threadId] || [];
                    if (!users.includes(userId)) {
                        return { ...prev, [threadId]: [...users, userId] };
                    }
                    return prev;
                });
            });

            socket.on('messenger:stop_typing', ({ threadId, userId }) => {
                setTypingUsers(prev => {
                    const users = prev[threadId] || [];
                    return { ...prev, [threadId]: users.filter(id => id !== userId) };
                });
            });

            socket.on('messenger:user_online', ({ userId }) => {
                setOnlineUsers(prev => new Set([...prev, userId]));
            });

            socket.on('messenger:user_online', ({ userId }) => {
                setOnlineUsers(prev => new Set([...prev, userId]));
            });

            socket.on('messenger:user_offline', ({ userId }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(userId);
                    return next;
                });
            });

            return () => {
                socket.off('messenger:new_message');
                socket.off('chat:message');
                socket.off('messenger:thread_created');
                socket.off('messenger:message_seen');
                socket.off('messenger:unread_update');
                socket.off('messenger:message_deleted');
                socket.off('messenger:typing');
                socket.off('messenger:stop_typing');
                socket.off('messenger:user_online');
                socket.off('messenger:user_offline');
            };
        }
    }, [socket, user, fetchThreads, fetchUnreadTotal]);

    // Initial load and 1-second silent sync fallback
    useEffect(() => {
        if (!user) return;
        
        // Initial fetch
        fetchThreads();
        fetchUnreadTotal();

        // 1-second interval
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
                
                // If active thread, sync messages
                const currentActive = activeThreadRef.current;
                if (currentActive) {
                    const msgData = await messengerApi.getMessages(currentActive._id);
                    if (msgData?.messages) {
                        setMessages(prev => JSON.stringify(prev) === JSON.stringify(msgData.messages) ? prev : msgData.messages);
                    }
                }
            } catch (e) {
                // silently ignore fallback errors
            }
        }, 1000);
        
        return () => clearInterval(intervalId);
    }, [user, fetchThreads, fetchUnreadTotal]);

    // ── Actions ──────────────────────────────────────────────
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
        try {
            // For now, we still use the standard sendMessage API. 
            // In a real scenario, we would handle attachments here too.
            const msg = await messengerApi.sendMessage(activeThread._id, { 
                content: content.trim(), 
                replyTo: replyTo || null 
            });
             // Local update (optional since socket will also trigger it, but improves perceived performance)
             // setMessages(prev => [...prev, msg]); 
        } catch (error) {
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
