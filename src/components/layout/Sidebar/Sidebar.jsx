import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { menuConfig, ROLES } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import { getCompanyProfile } from '@/services/settingsApi';
import styles from './Sidebar.module.scss';

export const Sidebar = () => {
    const { user, hasPermission } = useAuth();
    const location = useLocation();
    const userRole = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name) || ROLES.VIEWER;

    const [expandedMenuId, setExpandedMenuId] = useState(null);
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoHeight, setLogoHeight] = useState(65);

    useEffect(() => {
        getCompanyProfile()
            .then(res => {
                if (res.data?.logoUrl) {
                    setLogoUrl(res.data.logoUrl);
                }
                if (res.data?.logoHeight) {
                    setLogoHeight(res.data.logoHeight);
                }
            })
            .catch(() => { });
    }, []);

    const handleToggle = (id) => {
        setExpandedMenuId(prevId => prevId === id ? null : id);
    };

    // Filter items based on user role and permissions
    const filterItems = React.useCallback((items) => {
        return items.filter(item => {
            // First check by permissions - if an item dictates a permission, it MUST be obeyed.
            if (item.permission) {
                return hasPermission(item.permission);
            }

            // Fallback for older items that only have roles but no permission mapping
            if (item.roles && item.roles.includes(userRole)) {
                return true;
            }

            return false;
        }).map(item => {
            if (item.children) {
                const filteredChildren = filterItems(item.children);
                if (filteredChildren.length === 0 && item.children.length > 0) {
                    return null;
                }
                return { ...item, children: filteredChildren };
            }
            return item;
        }).filter(Boolean);
    }, [hasPermission, userRole, user?.additionalPermissions]);

    const visibleMenuItems = React.useMemo(() => 
        filterItems(menuConfig),
    [filterItems]);

    // Initial state based on current location
    useEffect(() => {
        const isItemActive = (it) => {
            if (it.path && location.pathname.startsWith(it.path)) return true;
            if (it.children) return it.children.some(child => isItemActive(child));
            return false;
        };

        const activeParent = menuConfig.find(item => isItemActive(item));
        if (activeParent) {
            setExpandedMenuId(activeParent.id);
        }
        // Only run on mount or when URL changes
    }, [location.pathname]);
    const isMessenger = location.pathname.startsWith('/messenger');

    return (
        <aside className={`${styles.sidebar} ${isMessenger ? styles.collapsed : ''} no-print`}>

            <div className={styles.header}>
                <div className={styles.brand}>
                    <div className={styles.logoWrapper}>
                        {logoUrl && !logoUrl.toLowerCase().endsWith('.pdf') && (
                            <img
                                src={logoUrl}
                                alt="Logo"
                                className={styles.logoImage}
                                style={{ maxHeight: `${logoHeight}px` }}
                                crossOrigin="anonymous"
                                onError={() => setLogoUrl(null)}
                            />
                        )}
                        <div className={styles.brandText}>
                            <span className={styles.focus}>JSK <span className={styles.one}>URJA</span></span>
                            <span className={styles.tagline}>CRM Application</span>
                        </div>
                    </div>
                </div>
            </div>

            <nav className={styles.nav}>
                <ul className={styles.menuList}>
                    {visibleMenuItems.map(item => (
                        <SidebarItem
                            key={item.id}
                            item={item}
                            isOpen={expandedMenuId === item.id}
                            onToggle={() => handleToggle(item.id)}
                        />
                    ))}
                </ul>
            </nav>

            {/* Footer / User Profile could go here using same pattern */}
        </aside>
    );
};
