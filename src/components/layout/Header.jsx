import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModal } from '@/components/ui';
import { LogOut, KeyRound, ChevronDown } from 'lucide-react';
import { ROLE_CONFIG } from '@/utils/permissions';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import styles from './Header.module.scss';

export const Header = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { openModal } = useModal();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const menuRef = useRef(null);

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
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    const roleConfig = ROLE_CONFIG[user.role] || {};

    return (
        <header className={styles.header}>
            <div className={styles.content}>
                <div className={styles.branding}>
                    <h1 className={styles.companyName}>JSK URJA</h1>
                    <span className={styles.appSubtitle}>CRM Application</span>
                </div>

                <div className={styles.userSection}>
                    <div className={styles.userMenu} ref={menuRef}>
                        <button
                            className={styles.userMenuButton}
                            onClick={() => setShowUserMenu(!showUserMenu)}
                        >
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>{user.name}</span>
                                <span
                                    className={styles.roleBadge}
                                    style={{ backgroundColor: roleConfig.color }}
                                >
                                    {roleConfig.badge} {roleConfig.label}
                                </span>
                            </div>
                            <ChevronDown size={16} className={styles.chevron} />
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
