import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { menuConfig, ROLES } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { SidebarItem } from './SidebarItem';
import { getCompanyProfile } from '@/services/settingsApi';
import { useSidebar } from '@/context/SidebarContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

export const Sidebar = () => {
    const { user, hasPermission } = useAuth();
    const { isCollapsed, isHoverOpen, setIsHovered, toggleSidebar } = useSidebar();
    const location = useLocation();
    const userRole = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name) || ROLES.VIEWER;

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

    // Filter items based on user role and permissions
    const filterItems = React.useCallback((items) => {
        return items.filter(item => {
            if (item.permission) {
                return hasPermission(item.permission);
            }
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

    // Effective state for rendering labels
    const showingFull = !isCollapsed || isHoverOpen;

    return (
        <aside 
            className={clsx(styles.sidebar, {
                [styles.collapsed]: isCollapsed && !isHoverOpen,
                [styles.hoverOpen]: isHoverOpen
            }, 'no-print')}
            onMouseEnter={() => isCollapsed && setIsHovered(true)}
            onMouseLeave={() => isCollapsed && setIsHovered(false)}
        >
            <div className={styles.header}>
                <div className={styles.brand}>
                    <div className={styles.logoWrapper}>
                        {logoUrl && showingFull && !logoUrl.toLowerCase().endsWith('.pdf') && (
                            <img
                                src={logoUrl}
                                alt="Logo"
                                className={styles.logoImage}
                                style={{ maxHeight: `${logoHeight}px` }}
                                crossOrigin="anonymous"
                                onError={() => setLogoUrl(null)}
                            />
                        )}
                        {showingFull ? (
                            <div className={styles.brandText}>
                                <span className={styles.focus}>JSK <span className={styles.one}>URJA</span></span>
                                <span className={styles.tagline}>CRM/ERP</span>
                            </div>
                        ) : (
                            <div className={styles.collapsedLogo} title="JSK URJA CRM/ERP">
                                <div className={styles.juText}>JU</div>
                                <div className={styles.collapsedTagline}>CRM/ERP</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <nav className={styles.nav}>
                <ul className={styles.menuList}>
                    {visibleMenuItems.map(item => (
                        <SidebarItem
                            key={item.id}
                            item={item}
                            collapsed={!showingFull}
                        />
                    ))}
                </ul>
            </nav>

            <div className={styles.footer}>
                <button 
                    onClick={toggleSidebar}
                    className={styles.collapseBtn}
                    title={isCollapsed ? "Expand Menu" : "Collapse Menu"}
                >
                    {isCollapsed && !isHoverOpen ? <ChevronRight size={20} /> : <div className="flex items-center gap-2"><ChevronLeft size={20} /> <span>Collapse</span></div>}
                </button>
            </div>
        </aside>
    );
};
