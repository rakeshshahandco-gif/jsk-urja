import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModal } from '@/components/ui';
import { LogOut, KeyRound, ChevronDown, Bell, MessageSquare, ChevronLeft, Menu } from 'lucide-react';
import { useSidebar } from '@/context/SidebarContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useMessenger } from '@/contexts/MessengerContext';
import { NotificationPanel } from './NotificationPanel';

import { ROLE_CONFIG } from '@/utils/permissions';
import { GlobalSearch } from './GlobalSearch';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { NotificationSettingsForm } from './NotificationSettingsForm';
import { menuConfig } from '@/config/menu.config';
import { PATHS } from '@/routes/paths';
import { Monitor, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { getNotificationPermission, requestNotificationPermission, isNotificationSupported } from '@/utils/browserNotification';
import styles from './Header.module.scss';

export const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { openModal } = useModal();
    const { unreadCount } = useNotification();
    const { unreadTotal } = useMessenger();
    const { isMobileLayout, toggleMobileMenu } = useSidebar();
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


    // Dynamic breadcrumb logic
    const breadcrumb = useMemo(() => {
        const path = location.pathname;
        
        // Helper to get module home path
        const getModuleHomePath = (it) => {
            const id = it.id?.toUpperCase().replace(/-/g, '_');
            const specialMappings = {
                'CRM': PATHS.CRM?.HOME,
                'ACCOUNT_MASTER_PARENT': PATHS.ACCOUNT_MASTER?.HOME,
                'GST_MENU': PATHS.GST?.HOME,
                'MIS_REPORTS': PATHS.MIS?.HOME,
                'FIXED_ASSETS_PARENT': PATHS.FIXED_ASSETS?.HOME,
                'CHINA_SUPPLIER': PATHS.CHINA_SUPPLIER?.HOME,
                'RD_SAMPLES': PATHS.RD_SAMPLES?.HOME,
            };
            if (specialMappings[id]) return specialMappings[id];
            if (PATHS[id] && PATHS[id].HOME) return PATHS[id].HOME;
            return null;
        };

        const findBreadcrumb = (items, parent = null) => {
            for (const item of items) {
                if (item.path === path) {
                    return {
                        title: item.title,
                        parentTitle: parent ? parent.title : null,
                        parentPath: parent ? getModuleHomePath(parent) : null
                    };
                }
                if (item.children) {
                    const result = findBreadcrumb(item.children, parent || item);
                    if (result) return result;
                }
            }
            return null;
        };

        const result = findBreadcrumb(menuConfig);
        
        // Handle module home pages
        if (!result && path.endsWith('/home')) {
            const parentItem = menuConfig.find(item => getModuleHomePath(item) === path);
            if (parentItem) {
                return {
                    title: `${parentItem.title} - Home`,
                    parentTitle: null,
                    parentPath: null
                };
            }
        }

        return result || { title: 'Home', parentTitle: null, parentPath: null };
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
        <header className={`${styles.header} no-print`} data-jsk-ui-component="header">

            <div className={styles.content}>
                <div className={styles.pageHeader}>
                    {isMobileLayout ? (
                        <button
                            type="button"
                            className="jsk-mobile-menu-btn"
                            onClick={toggleMobileMenu}
                            title="Open menu"
                            aria-label="Open menu"
                        >
                            <Menu size={20} />
                        </button>
                    ) : null}
                    {location.pathname !== '/' && (
                        <button
                            type="button"
                            className={styles.backToDashboard}
                            onClick={() => navigate(breadcrumb.parentPath || -1)}
                            title={breadcrumb.parentTitle ? `Back to ${breadcrumb.parentTitle}` : 'Back'}
                            aria-label={breadcrumb.parentTitle ? `Back to ${breadcrumb.parentTitle}` : 'Back'}
                        >
                            <ChevronLeft size={18} />
                            <span className={styles.backLabel}>Back</span>
                        </button>
                    )}
                    <h2 className={styles.pageTitle}>
                        {breadcrumb.parentTitle ? (
                            <>
                                <span className={styles.parentTitle}>{breadcrumb.parentTitle}</span>
                                <span className={styles.separator}> / </span>
                                <span>{breadcrumb.title}</span>
                            </>
                        ) : (
                            <span>{breadcrumb.title}</span>
                        )}
                    </h2>
                </div>

                <GlobalSearch />

                <div className={styles.userSection}>

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
