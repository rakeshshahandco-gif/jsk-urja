import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../services/notificationApi';
import { authService } from '../services/auth.service';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import toast from 'react-hot-toast';
import { Bell, X, ExternalLink } from 'lucide-react';
import { showBrowserNotification } from '@/utils/browserNotification';

// Generate a WhatsApp-style "ting" without external assets
const playTingSound = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
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
                } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 ${borderColor}`}
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
            >
                <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 pt-0.5">
                            {notification.actor?.avatar ? (
                                <img
                                    className={`h-12 w-12 rounded-full ring-2 ${ringColor} object-cover`}
                                    src={notification.actor.avatar}
                                    alt={notification.actor.name}
                                />
                            ) : (
                                <div className={`h-12 w-12 rounded-full ${bgColor} flex items-center justify-center ${iconColor} font-bold border-2`}>
                                    {notification.actor?.name?.charAt(0).toUpperCase() || <Bell size={20} />}
                                </div>
                            )}
                        </div>
                        <div className="ml-4 flex-1">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                                {notification.title || 'New Notification'}
                                {notification.type === 'REMINDER' && <span className="ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-red-100 text-red-600 rounded">Due Now</span>}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                {notification.message}
                            </p>
                            {notification.task && (
                                <div className="mt-2 text-xs font-medium text-primary-600 flex items-center gap-1">
                                    <span className="bg-primary-50 px-2 py-0.5 rounded-full border border-primary-100">
                                        Ref: {notification.task.title}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col border-l border-gray-100">
                    <button
                        onClick={() => {
                            toast.dismiss(t.id);
                            const dest = notification.link || (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : null);
                            if (dest) {
                                window.location.href = dest;
                            }
                        }}
                        className={`w-full border border-transparent rounded-none flex items-center justify-center text-sm font-semibold h-1/2 px-4 hover:bg-gray-50 focus:outline-none ${iconColor}`}
                    >
                        <ExternalLink size={16} className="mr-2" />
                        View
                    </button>
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="w-full border border-transparent rounded-none flex items-center justify-center text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none h-1/2 px-4"
                    >
                        <X size={16} className="mr-2" />
                        Close
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
                            url: notification.link || (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : '/'),
                            tag: notification._id
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

                return () => {
                    socket.off('notification:new', handleNewNotification);
                    socket.off('notification:sync', handleNotificationSync);
                    socket.off('connect', handleConnect);
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

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllRead,
        loading,
        preferences,
        updatePreferences
    }), [notifications, unreadCount, fetchNotifications, loading, preferences]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
