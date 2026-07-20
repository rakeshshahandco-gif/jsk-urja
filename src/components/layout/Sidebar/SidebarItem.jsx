import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';
import { useSidebar } from '@/context/SidebarContext';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';

import { 
    ChevronDown, 
    ChevronRight,
    LayoutDashboard,
    Users,
    BarChart3,
    ClipboardList,
    Package,
    Factory,
    ShoppingCart,
    ShoppingBag,
    Settings,
    FlaskConical,
    UserCheck,
    Wallet,
    LineChart,
    Building2,
    MessageCircle,
    FileText,
    Folder,
    Globe,
    Receipt,
    Lock,
} from 'lucide-react';

const iconMap = {
    'BusinessIcon': LayoutDashboard,
    'PeopleIcon': Users,
    'BarChartIcon': BarChart3,
    'AssignmentIcon': ClipboardList,
    'InventoryIcon': Package,
    'FactoryIcon': Factory,
    'ShoppingCartIcon': ShoppingCart,
    'ShoppingBagIcon': ShoppingBag,
    'SettingsIcon': Settings,
    'ScienceIcon': FlaskConical,
    'BadgeIcon': UserCheck,
    'AccountBalanceWalletIcon': Wallet,
    'AssessmentIcon': LineChart,
    'AccountBalanceIcon': Building2,
    'ChatIcon': MessageCircle,
    'VoucherIcon': FileText,
    'GlobeIcon': Globe,
    'ReceiptLongIcon': Receipt,
    'DocumentIcon': FileText,
    '💬': MessageCircle,
};

const IconRenderer = ({ name, title }) => {
    const Icon = iconMap[name] || (title?.includes('Report') || title?.includes('Master') ? FileText : Folder);
    return <Icon size={18} strokeWidth={2.2} />;
};

export const SidebarItem = ({ item, collapsed, level = 1 }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { closeMobileMenu } = useSidebar();
    const { getMenuLockInfo } = useModuleGuard();
    const lockInfo = getMenuLockInfo?.(item.id) || null;

    // Helper to find module home path
    const getModuleHomePath = (it) => {
        const id = it.id?.toUpperCase().replace(/-/g, '_');
        const specialMappings = {
            'CRM': PATHS.CRM?.HOME,
            'ACCOUNT_MASTER_PARENT': PATHS.ACCOUNT_MASTER?.HOME,
            'GST_MENU': PATHS.GST?.HOME,
            'TDS': PATHS.TDS?.HOME,
            'TCS': PATHS.TCS?.HOME,
            'MIS_REPORTS': PATHS.MIS?.HOME,
            'FIXED_ASSETS_PARENT': PATHS.FIXED_ASSETS?.HOME,
            'CHINA_SUPPLIER': PATHS.CHINA_SUPPLIER?.HOME,
            'RD_SAMPLES': PATHS.RD_SAMPLES?.HOME,
        };
        if (specialMappings[id]) return specialMappings[id];
        if (PATHS[id] && PATHS[id].HOME) return PATHS[id].HOME;
        return null;
    };

    const isItemActive = React.useCallback((it) => {
        if (it.path && location.pathname === it.path) return true;
        if (it.path && location.pathname.startsWith(it.path) && it.path !== '/') return true;
        if (it.children) return it.children.some(child => isItemActive(child));
        return false;
    }, [location.pathname]);

    const isActive = isItemActive(item);
    const hasChildren = item.children && item.children.length > 0;

    const homePath = getModuleHomePath(item);
    const targetPath = item.path || homePath;

    // Expansion state for nested children. Auto-expand on mount if any
    // descendant matches the current route. After the user manually toggles
    // we stop overriding their choice so it never re-opens itself.
    const [isExpanded, setIsExpanded] = useState(
        (isActive && hasChildren)
        || ((item.id === 'admin' || item.id === 'communication-bulk-group' || item.id === 'textile-foundation') && hasChildren),
    );
    const userToggledRef = useRef(false);

    useEffect(() => {
        if (!userToggledRef.current && isActive && hasChildren && !isExpanded) {
            setIsExpanded(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, hasChildren]);

    // External expand request (e.g. user clicks the matching item in the Top Menu Bar).
    // Restores the original behavior where parent modules open inline in the LEFT sidebar.
    useEffect(() => {
        if (!hasChildren) return undefined;
        const onExpandRequest = (e) => {
            if (e?.detail?.id === item.id) {
                setIsExpanded(true);
            }
        };
        window.addEventListener('jsk-sidebar-expand', onExpandRequest);
        return () => window.removeEventListener('jsk-sidebar-expand', onExpandRequest);
    }, [item.id, hasChildren]);

    // Original-UI behaviour: top-level parents must NOT expand inline in the
    // sidebar. Clicking them navigates to the module home (rendered as boxes
    // in the main area on the right). Nested groups (level > 1) keep the
    // legacy expand-on-click behaviour — they are not rendered inside the
    // sidebar tree anyway because of the children-render guard below, but
    // we preserve their handler for any future use.
    /** Top-level groups that expand inline (bulk/email utilities + Handloom testing hub). */
    const inlineTopLevelGroup = item.id === 'admin' || item.id === 'super-admin' || item.id === 'communication-bulk-group' || item.id === 'textile-foundation';
    const isTopLevelParent = level === 1 && hasChildren && !inlineTopLevelGroup;
    const alwaysShowChildren = inlineTopLevelGroup;

    const handleClick = () => {
        if (isTopLevelParent) {
            const dest = homePath
                || item.path
                || (item.children && item.children.find((c) => c.path)?.path)
                || null;
            if (dest && location.pathname !== dest) {
                navigate(dest);
                closeMobileMenu();
            }
            return;
        }
        if (hasChildren) {
            userToggledRef.current = true;
            setIsExpanded((v) => !v);
            return;
        }
        if (targetPath && location.pathname !== targetPath) {
            navigate(targetPath);
            closeMobileMenu();
        }
    };

    return (
        <li
            className={styles.menuItem}
            title={collapsed && level === 1 ? item.title : ''}
            data-jsk-ui-component="sidebar-item"
            data-jsk-ui-level={level}
        >
            <div
                className={clsx(styles.link, { [styles.active]: isActive })}
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
                data-jsk-ui-component="sidebar-link"
            >
                <span className={styles.icon} data-jsk-ui-component="sidebar-icon">
                    <IconRenderer name={item.icon} title={item.title} />
                </span>
                {!collapsed && (
                    <span className={styles.label} data-jsk-ui-component="sidebar-label">
                        {item.title}
                        {lockInfo ? (
                            <Lock
                                size={12}
                                strokeWidth={2.4}
                                style={{ marginLeft: 6, verticalAlign: 'middle', color: '#c2410c' }}
                                title={lockInfo.lockReason || `Locked (${lockInfo.lockMode || 'LOCKED'})`}
                                aria-label="Module locked"
                            />
                        ) : null}
                    </span>
                )}
                {!collapsed && hasChildren && !isTopLevelParent && (
                    <span
                        className={styles.arrow}
                        data-jsk-ui-component="sidebar-arrow"
                        aria-hidden="true"
                    >
                        {isExpanded ? (
                            <ChevronDown size={14} strokeWidth={2.4} />
                        ) : (
                            <ChevronRight size={14} strokeWidth={2.4} />
                        )}
                    </span>
                )}
            </div>
            {!collapsed && hasChildren && isExpanded && (!isTopLevelParent || alwaysShowChildren) && (
                <div className={styles.subMenuContainer}>
                    <ul className={styles.subMenu}>
                        {item.children.map((child) => (
                            <SidebarItem
                                key={child.id}
                                item={child}
                                collapsed={collapsed}
                                level={level + 1}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </li>
    );
};

