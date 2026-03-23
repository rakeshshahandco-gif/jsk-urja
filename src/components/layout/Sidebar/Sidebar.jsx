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
            // Admin & Superadmin bypass: hasPermission() handles this
            // Custom roles (sales, accounts, etc.): rely on additionalPermissions
            // Standard roles (manager, staff, viewer): fall back to item.roles list

            // 1. If item has a permission key, check it first
            if (item.permission) {
                // hasPermission returns true for admin/superadmin automatically
                // For custom roles (sales etc.), it checks additionalPermissions
                const allowed = hasPermission(item.permission);
                if (allowed) return true;

                // Permission check failed. Check if user has an explicit entry for this module.
                // If yes, the admin explicitly configured access - honor the denial.
                const moduleName = item.permission.split('.')[0];
                const hasExplicitEntry = user?.additionalPermissions && 
                    user.additionalPermissions[moduleName] !== undefined;
                
                if (hasExplicitEntry) {
                    // Explicit entry found but permission is false → deny
                    return false;
                }
                // No explicit entry → fall through to role check below
            }

            // 2. Role-based fallback (for standard roles: admin, manager, staff, viewer)
            if (item.roles && item.roles.includes(userRole)) {
                return true;
            }

            return false;
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
