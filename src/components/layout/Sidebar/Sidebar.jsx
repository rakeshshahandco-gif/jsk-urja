import React, { useState } from 'react';
import { menuConfig, ROLES } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

export const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { user } = useAuth();
    const userRole = user?.role || ROLES.VIEWER;

    // Filter items based on user role
    const filterByRole = (items) => {
        return items.filter(item => {
            // If no roles defined, it's public (or authorized for all authenticated)
            if (!item.roles) return true;
            return item.roles.includes(userRole);
        }).map(item => {
            if (item.children) {
                return { ...item, children: filterByRole(item.children) };
            }
            return item;
        });
    };

    const visibleMenuItems = filterByRole(menuConfig);

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
