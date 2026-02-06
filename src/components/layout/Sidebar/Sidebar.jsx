import React, { useState } from 'react';
import { menuConfig, ROLES } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

export const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { user, hasPermission } = useAuth();
    const userRole = user?.role || ROLES.VIEWER;

    // console.log('Sidebar Debug:', { userRole, permissions: user?.permissions });
    console.log('Sidebar Debug:', { userRole, permissions: user?.permissions });

    // Filter items based on user role and permissions
    const filterItems = (items) => {
        return items.filter(item => {
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
                // If item has children but all are filtered out, should we hide the parent?
                // For now, let's keep it if it has a title, unless we want to hide empty groups.
                // A common pattern is to hide groups if they have no visible children.
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
        <aside className={clsx(styles.sidebar, { [styles.collapsed]: collapsed })}>
            <div className={styles.header}>
                <span className={styles.logo}>{!collapsed ? 'CRM App' : 'C'}</span>
                <button
                    className={styles.toggleBtn}
                    onClick={() => setCollapsed(!collapsed)}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? '»' : '«'}
                </button>
            </div>

            <nav className={styles.nav}>
                <ul className={styles.menuList}>
                    {visibleMenuItems.map(item => (
                        <SidebarItem key={item.id} item={item} collapsed={collapsed} />
                    ))}
                </ul>
            </nav>

            {/* Footer / User Profile could go here using same pattern */}
        </aside>
    );
};
