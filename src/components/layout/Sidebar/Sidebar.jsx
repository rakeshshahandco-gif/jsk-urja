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

    // Initial state based on current location
    useEffect(() => {
        const activeParent = menuConfig.find(item =>
            item.children?.some(child => location.pathname.startsWith(child.path))
        );
        if (activeParent) {
            setExpandedMenuId(activeParent.id);
        }
    }, [location.pathname]);

    const handleToggle = (id) => {
        setExpandedMenuId(prevId => prevId === id ? null : id);
    };

    // Filter items based on user role and permissions
    const filterItems = (items) => {
        return items.filter(item => {
            // Superadmin bypass
            if (userRole === 'superadmin' || userRole === ROLES.SUPERADMIN || userRole === 'superadmin' || user?.roleName === 'superadmin') {
                return true;
            }

            // Check Role
            if (item.roles && !item.roles.includes(userRole)) {
                return false;
            }

            // Check Permission
            if (item.permission && !hasPermission(item.permission)) {
                return false;
            }

            return true;
        }).map(item => {
            if (item.children) {
                const filteredChildren = filterItems(item.children);
                if (filteredChildren.length === 0 && item.children.length > 0) {
                    return null; // Hide parent if all children are hidden
                }
                return { ...item, children: filteredChildren };
            }
            return item;
        }).filter(Boolean); // Filter out nulls from map (hidden parents)
    };

    const visibleMenuItems = filterItems(menuConfig);

    return (
        <aside className={`${styles.sidebar} no-print`}>

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
