import React from 'react';
import { menuConfig, ROLES } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import styles from './Sidebar.module.scss';

export const Sidebar = () => {
    const { user, hasPermission } = useAuth();
    const userRole = user?.role || ROLES.VIEWER;

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
        <aside className={styles.sidebar}>
            <div className={styles.header}>
                <div className={styles.brand}>
                    <div className={styles.logoWrapper}>
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
                        <SidebarItem key={item.id} item={item} />
                    ))}
                </ul>
            </nav>

            {/* Footer / User Profile could go here using same pattern */}
        </aside>
    );
};
