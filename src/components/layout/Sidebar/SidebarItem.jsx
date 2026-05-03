import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
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
    Folder,
    Globe
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
    '💬': MessageCircle,
};

const IconRenderer = ({ name, title }) => {
    const Icon = iconMap[name] || (title?.includes('Report') || title?.includes('Master') ? FileText : Folder);
    return <Icon size={18} strokeWidth={2.2} />;
};

export const SidebarItem = ({ item, collapsed }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Helper to find module home path
    const getModuleHomePath = (it) => {
        const id = it.id?.toUpperCase().replace(/-/g, '_');
        
        // Special mappings for IDs that don't match PATHS keys exactly
        const specialMappings = {
            'CRM': PATHS.CRM?.HOME,
            'ACCOUNT_MASTER_PARENT': PATHS.ACCOUNT_MASTER?.HOME,
            'GST_MENU': PATHS.GST?.HOME,
            'MIS_REPORTS': PATHS.MIS?.HOME,
            'FIXED_ASSETS_PARENT': PATHS.FIXED_ASSETS?.HOME,
            'CHINA_SUPPLIER': PATHS.CHINA_SUPPLIER?.HOME,
            'RD_SAMPLES': PATHS.RD_SAMPLES?.HOME,
        };

        if (specialMappings[id]) return specialMappings[id];
        
        // Try direct match in PATHS
        if (PATHS[id] && PATHS[id].HOME) return PATHS[id].HOME;
        
        return null;
    };

    const hasChildren = item.children && item.children.length > 0;
    const homePath = getModuleHomePath(item);
    const targetPath = item.path || homePath;

    const isItemActive = React.useCallback((it) => {
        if (it.path && location.pathname === it.path) return true;
        if (it.path && location.pathname.startsWith(it.path) && it.path !== '/') return true;
        if (it.children) return it.children.some(child => isItemActive(child));
        return false;
    }, [location.pathname]);

    const isActive = isItemActive(item);

    const handleClick = (e) => {
        if (targetPath && location.pathname !== targetPath) {
            navigate(targetPath);
        }
    };

    return (
        <li className={styles.menuItem} title={collapsed ? item.title : ''}>
            <div
                className={clsx(styles.link, { [styles.active]: isActive })}
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
            >
                <span className={styles.icon}>
                    <IconRenderer name={item.icon} title={item.title} />
                </span>
                {!collapsed && <span className={styles.label}>{item.title}</span>}
            </div>
        </li>
    );
};
