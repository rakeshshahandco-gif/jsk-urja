import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../services/notificationApi';
import { authService } from '../services/auth.service';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import { showBrowserNotification } from '@/utils/browserNotification';
import { env } from '@/config/env';
import { useLiveNotification } from '@/components/ui/LiveNotificationPopup';

// WhatsApp-style crisp alert sound
const playTingSound = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.05);
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
    const { showPopup } = useLiveNotification();

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

    // Dedup guard: track processed notification _ids to prevent double-popup
    const seenNotifIds = useRef(new Set());

    useEffect(() => {
        if (user?.notificationPreferences) {
            setPreferences(prev => ({ ...prev, ...user.notificationPreferences }));
        }
        // Request browser notification permission
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

    // ─── Socket listeners ────────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !socket) return;

        // Initial fetch
        fetchNotifications();

        const handleNewNotification = (notification) => {
            console.log('📬 Real-time Notification Received:', notification.type, notification._id);

            // ── Dedup guard ──────────────────────────────────────────────────
            const notifId = notification._id;
            if (notifId && seenNotifIds.current.has(notifId)) {
                console.log('📬 Skipping duplicate notification:', notifId);
                return;
            }
            if (notifId) {
                seenNotifIds.current.add(notifId);
                setTimeout(() => seenNotifIds.current.delete(notifId), 60000);
            }

            // ── Preference gates ─────────────────────────────────────────────
            if (!preferences.taskAlerts && (notification.task || ['ASSIGNED', 'STATUS_CHANGE', 'COMPLETED', 'APPROVAL'].includes(notification.type))) return;
            if (!preferences.messageAlerts && notification.type === 'MESSENGER') return;
            if (!preferences.reminderAlerts && notification.type === 'REMINDER') return;

            // Ensure valid notification (not raw chat payload)
            if (typeof notification.message === 'object') return;

            // ── Update notification list & badge ─────────────────────────────
            setNotifications(prev => {
                if (prev.some(n => n._id === notification._id)) return prev;
                return [notification, ...prev];
            });
            if (notification.unreadCount !== undefined) {
                setUnreadCount(notification.unreadCount);
            } else {
                setUnreadCount(prev => prev + 1);
            }

            // ── MESSENGER notifications: update count/list only ────────────
            // MessengerContext handles the visual popup for chat messages.
            // We only show the notification badge update here to avoid duplicates.
            if (notification.type === 'MESSENGER' || notification.type === 'CHAT') {
                // Still trigger browser notification if permitted
                if (preferences.desktop) {
                    showBrowserNotification({
                        title: notification.title || 'New Message',
                        body: notification.message,
                        icon: notification.actor?.avatar || null,
                        backendUrl: env.SOCKET_URL,
                        url: notification.link || '/messenger',
                        tag: `crm-messenger-${notification._id || Date.now()}`
                    });
                }
                return; // Skip in-app popup — MessengerContext shows it
            }

            // ── Non-MESSENGER: show premium in-app popup ───────────────────
            if (preferences.inApp) {
                // Build navigate destination
                const navigateTo = notification.link ||
                    (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : null);

                // Resolve task details for rich popup
                const taskObj = typeof notification.task === 'object' ? notification.task : null;

                showPopup({
                    id: notification._id || `notif-${Date.now()}`,
                    type: notification.type || 'NOTIFICATION',
                    title: notification.title || 'New Notification',
                    message: notification.message,
                    actorName: notification.actor?.name,
                    actorAvatar: notification.actor?.avatar
                        ? (notification.actor.avatar.startsWith('http')
                            ? notification.actor.avatar
                            : `${env.SOCKET_URL.replace(/\/$/, '')}/${notification.actor.avatar.replace(/^\//, '')}`)
                        : null,
                    priority: taskObj?.priority || null,
                    dueDate: taskObj?.dueDate || null,
                    navigateTo,
                    createdAt: notification.createdAt,
                });

                if (preferences.sound) playTingSound();
            }

            // ── Browser notification ──────────────────────────────────────
            if (preferences.desktop) {
                showBrowserNotification({
                    title: notification.title || 'CRM Alert',
                    body: notification.message,
                    icon: notification.actor?.avatar || null,
                    backendUrl: env.SOCKET_URL,
                    url: notification.link ||
                        (notification.task ? `/tasks/edit/${notification.task._id || notification.task}` : '/'),
                    tag: notification.type || 'crm-default'
                });
            }
        };

        // Sync unread count on reconnect / tab sync
        const handleNotificationSync = ({ unreadCount: count }) => {
            if (count !== undefined) setUnreadCount(count);
        };

        // Re-fetch missed notifications on reconnect
        const handleConnect = () => {
            console.log('🔄 NotificationContext: Reconnected — syncing missed notifications...');
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
    }, [user, socket, fetchNotifications, preferences, showPopup]);

    // Background polling safety net — 5 minutes
    useEffect(() => {
        if (user) {
            pollingInterval.current = setInterval(fetchNotifications, 300000);
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
        showPopup({
            id: `test-${Date.now()}`,
            type: 'ASSIGNED',
            title: '✅ Test: Task Assigned',
            message: 'This is a test of the premium live alert system. Both badge and popup are working!',
            actorName: 'System Admin',
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
            navigateTo: '/tasks/list',
            createdAt: new Date().toISOString(),
        });
        if (preferences.sound) playTingSound();

        if (preferences.desktop) {
            showBrowserNotification({
                title: 'Test Notification',
                body: 'This is a test of the premium live alert system. Pop-ups are working!',
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
    }), [notifications, unreadCount, fetchNotifications, loading, preferences, showPopup]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
