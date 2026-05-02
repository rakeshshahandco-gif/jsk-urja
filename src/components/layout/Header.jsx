import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModal } from '@/components/ui';
import { LogOut, KeyRound, ChevronDown, Bell, MessageSquare, LayoutDashboard } from 'lucide-react';
import { useNotification } from '@/contexts/NotificationContext';
import { useMessenger } from '@/contexts/MessengerContext';
import { NotificationPanel } from './NotificationPanel';

import { ROLE_CONFIG } from '@/utils/permissions';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { NotificationSettingsForm } from './NotificationSettingsForm';
import { menuConfig } from '@/config/menu.config';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { Calendar, Monitor, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { getNotificationPermission, requestNotificationPermission, isNotificationSupported } from '@/utils/browserNotification';
import styles from './Header.module.scss';

export const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { openModal } = useModal();
    const { unreadCount } = useNotification();
    const { unreadTotal } = useMessenger();
    const { financialYears, selectedFY, setSelectedFY } = useFinancialYear();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
    const menuRef = useRef(null);
    const bellRef = useRef(null);

    useEffect(() => {
        if (isNotificationSupported()) {
            setNotificationPermission(getNotificationPermission());
        }
    }, []);

    const handleEnableNotifications = async () => {
        const permission = await requestNotificationPermission();
        setNotificationPermission(permission);
    };


    // Dynamic page title logic
    const pageTitle = useMemo(() => {
        const path = location.pathname;
        let title = '';

        const findTitle = (items) => {
            for (const item of items) {
                if (item.path === path) return item.title;
                if (item.children) {
                    const childTitle = findTitle(item.children);
                    if (childTitle) return childTitle;
                }
            }
            return null;
        };

        title = findTitle(menuConfig);
        return title || 'Home';
    }, [location.pathname]);

    // User initials for avatar
    const initials = user?.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        : '??';

    const handleLogout = async () => {
        const result = await logout();
        if (result.success) {
            navigate('/login');
        }
    };

    const handleChangePassword = () => {
        setShowUserMenu(false);
        openModal(ChangePasswordForm, {
            title: 'Change Password',
            size: 'md'
        });
    };

    const handleNotificationSettings = () => {
        setShowUserMenu(false);
        openModal(NotificationSettingsForm, {
            title: 'Notification Settings',
            size: 'md'
        });
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
            if (bellRef.current && !bellRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);

    }, []);

    if (!user) return null;

    const userRoleIdent = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name);
    const roleConfig = ROLE_CONFIG[userRoleIdent] || {};

    return (
        <header className={`${styles.header} no-print`}>

            <div className={styles.content}>
                <div className={styles.pageHeader}>
                    {location.pathname !== '/' && (
                        <button 
                            className={styles.backToDashboard} 
                            onClick={() => navigate('/')}
                            title="Back to Home"
                        >
                            <LayoutDashboard size={18} />
                        </button>
                    )}
                    <h2 className={styles.pageTitle}>{pageTitle}</h2>
                </div>

                <div className={styles.userSection}>
                    <div className={styles.fySelectorContainer}>
                        <Calendar size={14} className={styles.fyIcon} />
                        <div className={styles.fyLabelGroup}>
                            <span className={styles.fyLabel}>F.Y.</span>
                            <select 
                                className={styles.fySelect}
                                value={selectedFY}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                title="Switch Financial Year — affects accounting entries only (Sales, Purchase, Ledger). Does not affect Customers, Tasks, or Follow-ups."
                            >
                                {financialYears && financialYears.map(fy => (
                                    <option key={fy._id} value={fy.name}>
                                        {fy.name}{fy.isCurrent ? ' ✓' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {financialYears.find(f => f.name === selectedFY)?.isCurrent && (
                            <span className={styles.fyActiveDot} title="Current Active Year" />
                        )}
                    </div>

                    {isNotificationSupported() && (
                        <div className={styles.browserNotifyContainer}>
                            {notificationPermission === 'default' && (
                                <button 
                                    className={styles.enableNotifyBtn} 
                                    onClick={handleEnableNotifications}
                                    title="Click to enable desktop notifications for messages and tasks"
                                >
                                    <Monitor size={14} />
                                    Enable Notifications
                                </button>
                            )}
                            {notificationPermission === 'granted' && (
                                <div className={styles.notifyStatusActive}>
                                    <div className={styles.statusInfo} title="Desktop Notifications are Enabled">
                                        <CheckCircle size={14} />
                                        <span className={styles.statusText}>Live Alerts</span>
                                    </div>
                                </div>
                            )}
                            {notificationPermission === 'denied' && (
                                <div className={styles.notifyStatusDenied} title="Notifications are blocked. Please enable them in your browser settings (click the lock icon in the URL bar).">
                                    <AlertCircle size={14} />
                                    <span className={styles.statusText}>Alerts Blocked</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.notificationWrapper} ref={bellRef}>
                        <button
                            className={styles.bellButton}
                            onClick={() => setShowNotifications(!showNotifications)}
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className={styles.badge}>{unreadCount}</span>
                            )}
                        </button>
                        {showNotifications && (
                            <NotificationPanel onClose={() => setShowNotifications(false)} />
                        )}
                    </div>

                    <div className={styles.notificationWrapper}>
                        <button
                            className={styles.bellButton}
                            onClick={() => navigate('/messenger')}
                            title="Messenger"
                        >
                            <MessageSquare size={20} />
                            {unreadTotal > 0 && (
                                <span className={styles.badge} style={{ backgroundColor: '#25D366' }}>
                                    {unreadTotal}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className={styles.userMenu} ref={menuRef}>

                        <button
                            className={styles.userMenuButton}
                            onClick={() => setShowUserMenu(!showUserMenu)}
                        >
                            <div className={styles.avatar}>
                                {initials}
                            </div>
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>{user.name}</span>
                                <span
                                    className={styles.roleBadge}
                                    style={{ color: roleConfig.color }}
                                >
                                    {roleConfig.label}
                                </span>
                            </div>
                            <ChevronDown size={14} className={styles.chevron} />
                        </button>

                        {showUserMenu && (
                            <div className={styles.userDropdown}>
                                <button
                                    className={styles.menuItem}
                                    onClick={handleChangePassword}
                                >
                                    <KeyRound size={16} />
                                    <span>Change Password</span>
                                </button>
                                <button
                                    className={styles.menuItem}
                                    onClick={handleNotificationSettings}
                                >
                                    <Settings size={16} />
                                    <span>Notification Settings</span>
                                </button>
                                <div className={styles.menuDivider} />
                                <button
                                    className={styles.menuItem}
                                    onClick={handleLogout}
                                >
                                    <LogOut size={16} />
                                    <span>Logout</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
