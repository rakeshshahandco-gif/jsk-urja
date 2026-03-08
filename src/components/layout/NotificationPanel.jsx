import React, { useRef, useEffect } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { Bell, Check, X, MessageSquare, UserPlus, ToggleLeft, CheckCircle } from 'lucide-react';
import styles from './NotificationPanel.module.scss';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const NotificationPanel = ({ onClose }) => {
    const { notifications, markAsRead, markAllRead, unreadCount } = useNotification();
    const panelRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleNotificationClick = (notification) => {
        if (!notification.isRead) {
            markAsRead(notification._id);
        }

        // Navigate based on task type or specific logic
        if (notification.task) {
            navigate(`/tasks/list`); // Or a specific task detail page if available
        }
        onClose();
    };

    const getIcon = (type) => {
        switch (type) {
            case 'ASSIGNED': return <UserPlus size={16} className={styles.iconAssign} />;
            case 'COMMENT': return <MessageSquare size={16} className={styles.iconComment} />;
            case 'STATUS_CHANGE': return <ToggleLeft size={16} className={styles.iconStatus} />;
            case 'COMPLETED': return <CheckCircle size={16} className={styles.iconComplete} />;
            default: return <Bell size={16} />;
        }
    };

    return (
        <div className={styles.notificationPanel} ref={panelRef}>
            <div className={styles.header}>
                <h3>Notifications {unreadCount > 0 && <span>({unreadCount})</span>}</h3>
                <div className={styles.actions}>
                    {unreadCount > 0 && (
                        <button onClick={markAllRead} className={styles.markAllBtn} title="Mark all as read">
                            <Check size={16} />
                        </button>
                    )}
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.list}>
                {notifications.length === 0 ? (
                    <div className={styles.empty}>No notifications</div>
                ) : (
                    notifications.map((n) => (
                        <div
                            key={n._id}
                            className={`${styles.item} ${!n.isRead ? styles.unread : ''}`}
                            onClick={() => handleNotificationClick(n)}
                        >
                            <div className={styles.iconWrapper}>
                                {getIcon(n.type)}
                            </div>
                            <div className={styles.content}>
                                <div className={styles.title}>{n.title}</div>
                                <div className={styles.message}>{n.message}</div>
                                <div className={styles.time}>
                                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                </div>
                            </div>
                            {!n.isRead && <div className={styles.dot} />}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
