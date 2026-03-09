import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

// Placeholder icons - in real app would map to generic Icon component
const IconPlaceholder = ({ name }) => <span>Build</span>; // Fallback

export const SidebarItem = ({ item, collapsed, isOpen, onToggle }) => {
    const location = useLocation();

    // Check if item has children
    const hasChildren = item.children && item.children.length > 0;

    // Check if current path matches item path
    // For parent items, check if any child is active
    const isChildActive = hasChildren && item.children.some(child => location.pathname.startsWith(child.path));

    if (hasChildren) {
        return (
            <li className={clsx(styles.menuItem, { [styles.subMenuContainer]: isOpen && !collapsed })}>
                <div
                    className={clsx(styles.link, {
                        [styles.active]: isChildActive,
                        [styles.subMenuHeader]: isOpen && !collapsed
                    })}
                    onClick={onToggle}
                >
                    <span className={styles.icon}>
                        📝
                    </span>
                    <span className={styles.label}>{item.title}</span>
                    {!collapsed && (
                        <span className={clsx(styles.arrow, { [styles.expanded]: isOpen })}>
                            ▼
                        </span>
                    )}
                </div>

                {isOpen && !collapsed && (
                    <ul className={styles.subMenu}>
                        {item.children.map(child => (
                            <SidebarItem key={child.id} item={child} collapsed={collapsed} />
                        ))}
                    </ul>
                )}
            </li>
        );
    }

    return (
        <li className={styles.menuItem}>
            <NavLink
                to={item.path}
                className={({ isActive }) => clsx(styles.link, { [styles.active]: isActive })}
            >
                <span className={styles.icon}>
                    📄
                </span>
                <span className={styles.label}>{item.title}</span>
            </NavLink>
        </li>
    );
};
