import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../services/notificationApi';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from './SocketContext';
import toast from 'react-hot-toast';
import { Bell, X, ExternalLink } from 'lucide-react';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
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
        toast.custom((t) => (
            <div
                className={`${
                    t.visible ? 'animate-enter' : 'animate-leave'
                } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 border-primary-600`}
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
                                    className="h-12 w-12 rounded-full ring-2 ring-primary-100 object-cover"
                                    src={notification.actor.avatar}
                                    alt={notification.actor.name}
                                />
                            ) : (
                                <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border-2 border-primary-200">
                                    {notification.actor?.name?.charAt(0).toUpperCase() || <Bell size={20} />}
                                </div>
                            )}
                        </div>
                        <div className="ml-4 flex-1">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                                {notification.title || 'New Notification'}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                {notification.message}
                            </p>
                            {notification.task && (
                                <div className="mt-2 text-xs font-medium text-primary-600 flex items-center gap-1">
                                    <span className="bg-primary-50 px-2 py-0.5 rounded-full border border-primary-100">
                                        Task: {notification.task.title}
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
                            // Navigate if needed - adding window.location or similar would go here
                            if (notification.task) {
                                window.location.href = `/tasks/list`;
                            }
                        }}
                        className="w-full border border-transparent rounded-none flex items-center justify-center text-sm font-semibold text-primary-600 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 h-1/2 px-4"
                    >
                        <ExternalLink size={16} className="mr-2" />
                        View
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
            duration: 6000,
            position: 'top-right',
        });
    }, []);

    // Initial load and socket listener
    useEffect(() => {
        if (user) {
            fetchNotifications();

            if (socket) {
                const handleNewNotification = (notification) => {
                    console.log('📬 Real-time Notification Received:', notification);
                    setNotifications(prev => [notification, ...prev]);
                    setUnreadCount(prev => prev + 1);
                    showNotificationToast(notification);
                };

                socket.on('notification:new', handleNewNotification);

                return () => {
                    socket.off('notification:new', handleNewNotification);
                };
            }
        }
    }, [user, socket, fetchNotifications, showNotificationToast]);

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
        loading
    }), [notifications, unreadCount, fetchNotifications, loading]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
