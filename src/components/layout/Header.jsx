import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModal } from '@/components/ui';
import { LogOut, KeyRound, ChevronDown, Bell } from 'lucide-react';
import { useNotification } from '@/contexts/NotificationContext';
import { NotificationPanel } from './NotificationPanel';

import { ROLE_CONFIG } from '@/utils/permissions';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { menuConfig } from '@/config/menu.config';
import styles from './Header.module.scss';

export const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { openModal } = useModal();
    const { unreadCount } = useNotification();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const menuRef = useRef(null);
    const bellRef = useRef(null);


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
        return title || 'Dashboard';
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

    const roleConfig = ROLE_CONFIG[user.role] || {};

    return (
        <header className={`${styles.header} no-print`}>

            <div className={styles.content}>
                <div className={styles.pageHeader}>
                    <h2 className={styles.pageTitle}>{pageTitle}</h2>
                </div>

                <div className={styles.userSection}>
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
