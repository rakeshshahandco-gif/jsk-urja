/**
 * LiveNotificationPopup.jsx
 *
 * A premium, WhatsApp Web / Gmail-style global notification popup system.
 * Renders a fixed bottom-right stack of popups that:
 *  - Auto-dismiss after 6 seconds (paused on hover)
 *  - Can be manually closed
 *  - Show max 5 at once (oldest auto-pops when limit exceeded)
 *  - Distinguish Task from Messenger notifications with type-specific styling
 *  - Click navigates to the correct page / chat thread
 *  - Stacks vertically with smooth enter/exit CSS animations
 */

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X,
    CheckSquare,
    MessageSquare,
    Bell,
    AlertTriangle,
    ExternalLink,
    Clock,
    User,
    CalendarDays,
} from 'lucide-react';

// ─── Context ──────────────────────────────────────────────────────────────────
const LiveNotificationContext = createContext(null);

export const useLiveNotification = () => useContext(LiveNotificationContext);

// ─── MAX visible at once ───────────────────────────────────────────────────────
const MAX_VISIBLE = 5;
const AUTO_DISMISS_MS = 6000;

// ─── Priority colour map ───────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
    CRITICAL: { label: 'Critical', bg: '#fee2e2', color: '#b91c1c' },
    URGENT:   { label: 'Urgent',   bg: '#fef3c7', color: '#b45309' },
    HIGH:     { label: 'High',     bg: '#ede9fe', color: '#7c3aed' },
    MEDIUM:   { label: 'Medium',   bg: '#dbeafe', color: '#1d4ed8' },
    LOW:      { label: 'Low',      bg: '#d1fae5', color: '#047857' },
};

// ─── Type-specific colours ─────────────────────────────────────────────────────
const typeConfig = (type) => {
    switch (type) {
        case 'MESSENGER':
        case 'CHAT':
            return { accent: '#25D366', iconBg: '#d1fae5', iconColor: '#065f46', Icon: MessageSquare, label: 'New Message' };
        case 'ASSIGNED':
            return { accent: '#3b82f6', iconBg: '#dbeafe', iconColor: '#1d4ed8', Icon: CheckSquare, label: 'Task Assigned' };
        case 'STATUS_CHANGE':
            return { accent: '#f59e0b', iconBg: '#fef3c7', iconColor: '#b45309', Icon: CheckSquare, label: 'Task Updated' };
        case 'COMPLETED':
            return { accent: '#10b981', iconBg: '#d1fae5', iconColor: '#047857', Icon: CheckSquare, label: 'Task Completed' };
        case 'REMINDER':
            return { accent: '#ef4444', iconBg: '#fee2e2', iconColor: '#b91c1c', Icon: AlertTriangle, label: 'Reminder' };
        default:
            return { accent: '#6366f1', iconBg: '#ede9fe', iconColor: '#4338ca', Icon: Bell, label: 'Notification' };
    }
};

// ─── Format relative time ─────────────────────────────────────────────────────
const formatTime = (iso) => {
    try {
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return d.toLocaleDateString();
    } catch { return ''; }
};

// ─── Format date ─────────────────────────────────────────────────────────────
const formatDate = (iso) => {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return null; }
};

// ─── Single Popup Card ─────────────────────────────────────────────────────────
const PopupCard = ({ popup, onClose }) => {
    const navigate = useNavigate();
    const timerRef = useRef(null);
    const progressRef = useRef(null);
    const [entering, setEntering] = useState(true);
    const [visible, setVisible] = useState(true);

    const { accent, iconBg, iconColor, Icon, label } = typeConfig(popup.type);
    const priorityCfg = popup.priority ? PRIORITY_CONFIG[popup.priority] : null;
    const dueDate = formatDate(popup.dueDate || popup.task?.dueDate);
    const timeLabel = formatTime(popup.createdAt || new Date());

    const startTimer = useCallback(() => {
        if (progressRef.current) {
            progressRef.current.style.transition = `width ${AUTO_DISMISS_MS}ms linear`;
            progressRef.current.style.width = '0%';
        }
        timerRef.current = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onClose(popup.id), 350);
        }, AUTO_DISMISS_MS);
    }, [onClose, popup.id]);

    const pauseTimer = useCallback(() => {
        clearTimeout(timerRef.current);
        if (progressRef.current) {
            const computed = getComputedStyle(progressRef.current).width;
            const parent = progressRef.current.parentElement;
            const pct = parent ? (parseFloat(computed) / parent.offsetWidth) * 100 : 0;
            progressRef.current.style.transition = 'none';
            progressRef.current.style.width = `${pct}%`;
        }
    }, []);

    useEffect(() => {
        // Trigger enter animation
        const t = setTimeout(() => setEntering(false), 10);
        startTimer();
        return () => {
            clearTimeout(t);
            clearTimeout(timerRef.current);
        };
    }, [startTimer]);

    const handleClick = () => {
        clearTimeout(timerRef.current);
        setVisible(false);
        setTimeout(() => {
            onClose(popup.id);
            const dest = popup.navigateTo;
            if (dest) navigate(dest);
        }, 200);
    };

    const handleClose = (e) => {
        e.stopPropagation();
        clearTimeout(timerRef.current);
        setVisible(false);
        setTimeout(() => onClose(popup.id), 350);
    };

    return (
        <div
            onMouseEnter={pauseTimer}
            onMouseLeave={startTimer}
            style={{
                width: '360px',
                maxWidth: 'calc(100vw - 32px)',
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(20px)',
                borderRadius: '16px',
                boxShadow: '0 20px 60px -10px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)',
                borderLeft: `4px solid ${accent}`,
                overflow: 'hidden',
                cursor: 'pointer',
                transform: entering || !visible ? 'translateX(110%)' : 'translateX(0)',
                opacity: entering || !visible ? 0 : 1,
                transition: 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease',
                marginBottom: '10px',
                position: 'relative',
            }}
            onClick={handleClick}
        >
            {/* Progress bar */}
            <div style={{ height: '3px', background: `${accent}22`, position: 'absolute', top: 0, left: 0, right: 0 }}>
                <div
                    ref={progressRef}
                    style={{ height: '100%', width: '100%', background: accent, borderRadius: '2px' }}
                />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Icon size={12} color={iconColor} strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {label}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 500 }}>{timeLabel}</span>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '4px 14px 10px' }}>
                {/* Actor / Sender */}
                {popup.actorName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: `${iconBg}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 700, color: iconColor,
                            border: `1.5px solid ${accent}44`
                        }}>
                            {popup.actorAvatar ? (
                                <img src={popup.actorAvatar} alt={popup.actorName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                popup.actorName[0]?.toUpperCase()
                            )}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{popup.actorName}</span>
                    </div>
                )}

                {/* Title */}
                <p style={{
                    fontSize: '13px', fontWeight: 800, color: '#111827',
                    margin: '0 0 4px', lineHeight: 1.35,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                }}>
                    {popup.title}
                </p>

                {/* Message / Body text */}
                <p style={{
                    fontSize: '12px', color: '#6b7280', margin: '0 0 6px', lineHeight: 1.45,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                }}>
                    {popup.message}
                </p>

                {/* Task meta pills  */}
                {(priorityCfg || dueDate || popup.groupName) && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        {priorityCfg && (
                            <span style={{
                                fontSize: '9px', fontWeight: 800, padding: '2px 7px',
                                borderRadius: '99px', background: priorityCfg.bg, color: priorityCfg.color,
                                letterSpacing: '0.06em', textTransform: 'uppercase'
                            }}>
                                {priorityCfg.label}
                            </span>
                        )}
                        {dueDate && (
                            <span style={{
                                fontSize: '10px', fontWeight: 600, color: '#6b7280',
                                display: 'flex', alignItems: 'center', gap: '3px'
                            }}>
                                <CalendarDays size={10} /> {dueDate}
                            </span>
                        )}
                        {popup.groupName && (
                            <span style={{
                                fontSize: '10px', fontWeight: 600, color: accent,
                                display: 'flex', alignItems: 'center', gap: '3px'
                            }}>
                                <User size={10} /> {popup.groupName}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid #f3f4f6',
                padding: '7px 14px',
                background: '#fafafa',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end'
            }}>
                <span style={{
                    fontSize: '11px', fontWeight: 700, color: accent,
                    display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                    {popup.type === 'MESSENGER' || popup.type === 'CHAT' ? 'Open Chat' : 'View Details'}
                    <ExternalLink size={10} />
                </span>
            </div>
        </div>
    );
};

// ─── Popup Stack Container ─────────────────────────────────────────────────────
const PopupStack = ({ popups, onClose }) => {
    return (
        <div
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 999999,
                display: 'flex',
                flexDirection: 'column-reverse',
                alignItems: 'flex-end',
                pointerEvents: 'none',
            }}
        >
            {popups.map((popup) => (
                <div key={popup.id} style={{ pointerEvents: 'auto' }}>
                    <PopupCard popup={popup} onClose={onClose} />
                </div>
            ))}
        </div>
    );
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const LiveNotificationProvider = ({ children }) => {
    const [popups, setPopups] = useState([]);
    const seenIds = useRef(new Set());

    /**
     * Show a popup notification.
     * @param {Object} opts
     * @param {string} opts.id          - Unique ID (notification._id or message._id). Used for dedup.
     * @param {string} opts.type        - 'ASSIGNED' | 'STATUS_CHANGE' | 'COMPLETED' | 'REMINDER' | 'MESSENGER' | 'CHAT'
     * @param {string} opts.title       - Bold headline
     * @param {string} opts.message     - Body text / preview
     * @param {string} [opts.actorName] - Sender / assigner name
     * @param {string} [opts.actorAvatar] - Avatar URL
     * @param {string} [opts.priority]  - Task priority
     * @param {string} [opts.dueDate]   - ISO date string
     * @param {string} [opts.groupName] - Chat / group name
     * @param {string} [opts.navigateTo] - React Router path to navigate to on click
     * @param {string} [opts.createdAt] - ISO timestamp
     */
    const showPopup = useCallback((opts) => {
        const dedupKey = opts.id || `${opts.type}-${opts.title}-${Date.now()}`;
        if (seenIds.current.has(dedupKey)) return;
        seenIds.current.add(dedupKey);

        // Expire old dedup keys after 30s to allow recycling
        setTimeout(() => seenIds.current.delete(dedupKey), 30000);

        setPopups(prev => {
            const newPopup = { ...opts, id: dedupKey, createdAt: opts.createdAt || new Date().toISOString() };
            const updated = [...prev, newPopup];
            // Keep max MAX_VISIBLE
            if (updated.length > MAX_VISIBLE) return updated.slice(updated.length - MAX_VISIBLE);
            return updated;
        });
    }, []);

    const closePopup = useCallback((id) => {
        setPopups(prev => prev.filter(p => p.id !== id));
    }, []);

    return (
        <LiveNotificationContext.Provider value={{ showPopup }}>
            {children}
            <PopupStack popups={popups} onClose={closePopup} />
        </LiveNotificationContext.Provider>
    );
};

export default LiveNotificationProvider;
