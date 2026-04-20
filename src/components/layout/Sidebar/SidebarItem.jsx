import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

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
    Folder
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
    '💬': MessageCircle,
};

const IconRenderer = ({ name, title }) => {
    const Icon = iconMap[name] || (title?.includes('Report') || title?.includes('Master') ? FileText : Folder);
    return <Icon size={18} strokeWidth={2.2} />;
};

export const SidebarItem = ({ item, collapsed, isOpen: externalIsOpen, onToggle: externalOnToggle }) => {
    const location = useLocation();
    const [internalIsOpen, setInternalIsOpen] = React.useState(false);

    // For top-level items, Sidebar manages expansion (one-at-a-time accordion).
    // For nested sub-menus, the item manages its own expansion state.
    const isOpen = externalOnToggle ? externalIsOpen : internalIsOpen;
    const onToggle = externalOnToggle ? externalOnToggle : () => setInternalIsOpen(!internalIsOpen);

    // Check if item has children
    const hasChildren = item.children && item.children.length > 0;

    const isItemActive = React.useCallback((it) => {
        if (it.path && location.pathname.startsWith(it.path)) return true;
        if (it.children) return it.children.some(child => isItemActive(child));
        return false;
    }, [location.pathname]);

    // Check if any child (including deeply nested ones) is active
    const isChildActive = React.useMemo(() => 
        hasChildren && item.children.some(child => isItemActive(child)),
    [hasChildren, item.children, isItemActive]);

    // Auto-expand nested sub-menus if an item inside them is active
    React.useEffect(() => {
        if (isChildActive && !externalOnToggle) {
            setInternalIsOpen(true);
        }
    }, [isChildActive, externalOnToggle]);

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
                        <IconRenderer name={item.icon} title={item.title} />
                    </span>
                    <span className={styles.label}>{item.title}</span>
                    {!collapsed && (
                        <span className={clsx(styles.arrow, { [styles.expanded]: isOpen })}>
                            <ChevronDown size={14} strokeWidth={3} />
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
                    <IconRenderer name={item.icon} title={item.title} />
                </span>
                <span className={styles.label}>{item.title}</span>
            </NavLink>
        </li>
    );
};
