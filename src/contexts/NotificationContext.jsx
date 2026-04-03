import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../services/notificationApi';
import { authService } from '../services/auth.service';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import toast from 'react-hot-toast';
import { Bell, X, ExternalLink, MessageSquare } from 'lucide-react';
import { showBrowserNotification } from '@/utils/browserNotification';
import { env } from '@/config/env';

// Generate a WhatsApp-style crisp alert sound
const playTingSound = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
        osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.05); // D6 note (crisp)
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
        console.warn('Audio play failed', e);
    }
};

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    
    const [preferences, setPreferences] = useState({
        inApp: true,
        desktop: true,
        sound: true,
        taskAlerts: true,
        messageAlerts: true,
        reminderAlerts: true
    });
    
    useEffect(() => {
        if (user?.notificationPreferences) {
            setPreferences(prev => ({ ...prev, ...user.notificationPreferences }));
        }
        
        // Request browser notification permission properly
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Browser notification permission:', permission);
            });
        }
    }, [user]);

    const updatePreferences = async (newPrefs) => {
        try {
            const updated = await authService.updateNotificationSettings(newPrefs);
            if (updated.success) {
                setPreferences(prev => ({ ...prev, ...updated.data }));
            }
        } catch (error) {
            console.error('Failed to update preferences', error);
        }
    };

    const pollingInterval = useRef(null);

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const data = await getNotifications();
            if (data) {
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    }, [user]);

    // Custom Toast for Premium Experience
    const showNotificationToast = useCallback((notification) => {
        // Determine type-specific styling
        let borderColor = 'border-primary-600';
        let bgColor = 'bg-primary-50';
        let iconColor = 'text-primary-700';
        let ringColor = 'ring-primary-100';

        if (notification.type === 'REMINDER') {
            borderColor = 'border-red-500';
            bgColor = 'bg-red-50';
            iconColor = 'text-red-700';
            ringColor = 'ring-red-100';
        } else if (notification.type === 'MESSENGER' || notification.threadId) {
            borderColor = 'border-green-500';
            bgColor = 'bg-green-50';
            iconColor = 'text-green-700';
            ringColor = 'ring-green-100';
        }

        toast.custom((t) => (
            <div
                className={`${
                    t.visible ? 'animate-enter' : 'animate-leave'
                } max-w-sm w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex flex-col ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 ${borderColor}`}
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    transform: 'translateY(-10px)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                <div 
                    className="p-4 cursor-pointer hover:bg-gray-50 flex-1"
                    onClick={() => {
                        toast.dismiss(t.id);
                        const dest = notification.link || (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : (notification.metadata?.threadId ? '/messenger' : null));
                        if (dest) window.location.href = dest;
                    }}
                >
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            {notification.actor?.avatar ? (
                                <img
                                    className={`h-11 w-11 rounded-full ring-2 ${ringColor} object-cover shadow-sm`}
                                    src={notification.actor.avatar.startsWith('http') ? notification.actor.avatar : `${env.SOCKET_URL.replace(/\/$/, '')}/${notification.actor.avatar.replace(/^\//, '')}`}
                                    alt={notification.actor.name}
                                />
                            ) : (
                                <div className={`h-11 w-11 rounded-full ${bgColor} flex items-center justify-center ${iconColor} font-bold border-2`}>
                                    {notification.actor?.name?.charAt(0).toUpperCase() || <Bell size={18} />}
                                </div>
                            )}
                            <div className="relative -mt-3 -mr-1 flex justify-end">
                                <div className={`p-1 rounded-full ${bgColor} ring-2 ring-white`}>
                                    {notification.type === 'MESSENGER' ? <MessageSquare size={10} className={iconColor} /> : <Bell size={10} className={iconColor} />}
                                </div>
                            </div>
                        </div>
                        <div className="ml-4 flex-1">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-gray-400 tracking-wider uppercase">
                                    {notification.type === 'MESSENGER' ? 'Messenger' : (notification.type === 'ASSIGNED' ? 'Task Assigned' : 'New Update')}
                                </p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
                                    className="text-gray-300 hover:text-gray-500 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            <p className="text-sm font-bold text-gray-900 mt-0.5 line-clamp-1">
                                {notification.title || (notification.actor?.name || 'Notification')}
                                {notification.type === 'REMINDER' && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-black uppercase">Due</span>}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 line-clamp-2 leading-relaxed">
                                {notification.message}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50 border-t border-gray-100">
                    <span className="text-[10px] text-gray-400 font-medium">Just now</span>
                    <button 
                         onClick={() => {
                            toast.dismiss(t.id);
                            const dest = notification.link || (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : null);
                            if (dest) window.location.href = dest;
                        }}
                        className={`text-[11px] font-bold ${iconColor} hover:underline flex items-center gap-1`}
                    >
                        View Details <ExternalLink size={10} />
                    </button>
                </div>
            </div>
        ), {
            duration: 6000,
            position: 'bottom-right',
        });
    }, []);

    // Initial load and socket listener
    useEffect(() => {
        if (user) {
            fetchNotifications();

            if (socket) {
                const handleNewNotification = (notification) => {
                    console.log('📬 Real-time Notification Received:', notification);
                    
                    // Filter based on user preferences
                    if (!preferences.taskAlerts && (notification.task || notification.type === 'TASK')) return;
                    if (!preferences.messageAlerts && notification.type === 'MESSENGER') return;
                    if (!preferences.reminderAlerts && notification.type === 'REMINDER') return;
                    if (!preferences.taskAlerts && notification.type === 'APPROVAL') return;

                    // Update notifications list
                    setNotifications(prev => {
                        if (prev.some(n => n._id === notification._id)) return prev;
                        return [notification, ...prev];
                    });
                    
                    // Instant count update from event or local increment
                    if (notification.unreadCount !== undefined) {
                        setUnreadCount(notification.unreadCount);
                    } else {
                        setUnreadCount(prev => prev + 1);
                    }
                    
                    if (preferences.inApp) {
                        showNotificationToast(notification);
                        if (preferences.sound) {
                            playTingSound();
                        }
                    }

                    if (preferences.desktop) {
                        // Browser Notification
                        showBrowserNotification({
                            title: notification.title || 'CRM Alert',
                            body: notification.message,
                            icon: notification.actor?.avatar || null,
                            backendUrl: env.SOCKET_URL,
                            url: notification.link || (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : '/'),
                            tag: notification.type || 'crm-default'
                        });
                    }
                };

                // Sync count across tabs
                const handleNotificationSync = ({ unreadCount: count }) => {
                    if (count !== undefined) setUnreadCount(count);
                };

                // Fetch missed notifications on offline/reconnect
                const handleConnect = () => {
                    fetchNotifications();
                };

                socket.on('notification:new', handleNewNotification);
                socket.on('notification:sync', handleNotificationSync);
                socket.on('connect', handleConnect);
                
                // Specific listeners as requested (only messaging and reminders are legacy here)
                socket.on('chat:message', handleNewNotification);
                socket.on('reminder:new', handleNewNotification);

                return () => {
                    socket.off('notification:new', handleNewNotification);
                    socket.off('notification:sync', handleNotificationSync);
                    socket.off('connect', handleConnect);
                    socket.off('chat:message', handleNewNotification);
                    socket.off('reminder:new', handleNewNotification);
                };
            }
        }
    }, [user, socket, fetchNotifications, showNotificationToast, preferences]);

    // Background refresh (polling) - reduced frequency since we have sockets
    useEffect(() => {
        if (user) {
            pollingInterval.current = setInterval(fetchNotifications, 300000); // 5 mins
        }
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, [user, fetchNotifications]);

    const markAsRead = async (id) => {
        try {
            await markNotificationAsRead(id);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const markAllRead = async () => {
        try {
            await markAllNotificationsAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    };

    const sendTestNotification = () => {
        const testNotif = {
            _id: 'test-' + Date.now(),
            title: 'Test Notification',
            message: 'This is a test of the premium alert system. Both desktop and in-app pop-ups are working!',
            type: 'MESSENGER',
            actor: { name: 'System Admin', avatar: null },
            createdAt: new Date().toISOString()
        };
        
        if (preferences.inApp) {
            showNotificationToast(testNotif);
            if (preferences.sound) playTingSound();
        }
        
        if (preferences.desktop) {
            showBrowserNotification({
                title: testNotif.title,
                body: testNotif.message,
                backendUrl: env.SOCKET_URL,
                tag: 'crm-test'
            });
        }
    };

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllRead,
        loading,
        preferences,
        updatePreferences,
        sendTestNotification
    }), [notifications, unreadCount, fetchNotifications, loading, preferences]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
