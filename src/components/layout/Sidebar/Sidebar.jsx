import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { menuConfig, ROLES } from '@/config/menu.config';
import { MENU_FEATURE_BY_ID, MENU_FEATURE_ALWAYS_VISIBLE } from '@/config/menuFeatureMap';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { SidebarItem } from './SidebarItem';
import { getCompanyProfile } from '@/services/settingsApi';
import { useSidebar } from '@/context/SidebarContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { CompanySwitcher } from '../CompanySwitcher';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import styles from './Sidebar.module.scss';
import clsx from 'clsx';

export const Sidebar = () => {
    const { user, hasPermission } = useAuth();
    const { selectedCompany } = useCompany();
    const isTextileCo = isTextileIndustryCompany(selectedCompany);
    const { isFeatureEnabled } = useFeatureSettings();
    const { isMenuItemEnabled } = useModuleGuard();
    const { enabled: uiEnabled, preferences: uiPrefs } = useUiPreferences();
    const { isCollapsed, isHoverOpen, isMobileLayout, isMobileMenuOpen, setIsHovered, toggleSidebar } = useSidebar();
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
        // System Admin / Superadmin bypass - they see everything
        const isAdmin = ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(userRole?.toLowerCase());

        return items.filter(item => {
            if (item.textileOnly && !isTextileCo) return false;
            if (item.electronicsOnly && isTextileCo) return false;
            if (!isMenuItemEnabled(item.id)) return false;

            if (MENU_FEATURE_ALWAYS_VISIBLE.has(item.id)) {
                // still apply permission below for non-admin
            } else {
                const featurePath = MENU_FEATURE_BY_ID[item.id];
                if (featurePath && !isFeatureEnabled(featurePath)) return false;
            }

            if (isAdmin) return true;

            if (item.permission) {
                return hasPermission(item.permission);
            } else if (item.roles) {
                return item.roles.includes(userRole);
            }
            return true; // No restriction
        }).map(item => {
            if (item.children) {
                const filteredChildren = filterItems(item.children);
                return { ...item, children: filteredChildren };
            }
            return item;
        }).filter((item) => {
            if (item.children && item.children.length === 0) return false;
            return true;
        });
    }, [hasPermission, userRole, isFeatureEnabled, isTextileCo, isMenuItemEnabled]);

    const visibleMenuItems = React.useMemo(() => {
        const items = filterItems(menuConfig);

        // Phase 8b: apply per-user sidebar layout (hide + reorder top-level).
        // ONLY when the master UI customization feature is enabled. With it
        // off, we return the original filtered list untouched.
        if (!uiEnabled) return items;
        const layout = uiPrefs?.sidebarLayout || {};
        const hidden = new Set(Array.isArray(layout.hiddenIds) ? layout.hiddenIds : []);
        const order = Array.isArray(layout.orderIds) ? layout.orderIds : [];

        const afterHide = hidden.size > 0
            ? items.filter((it) => !hidden.has(it.id))
            : items;

        if (order.length === 0) return afterHide;

        // Stable sort: items present in `order` come first in that order;
        // any other items keep their original menuConfig order behind them.
        const orderIndex = new Map(order.map((id, i) => [id, i]));
        const known = [];
        const unknown = [];
        afterHide.forEach((it) => {
            if (orderIndex.has(it.id)) known.push(it);
            else unknown.push(it);
        });
        known.sort((a, b) => orderIndex.get(a.id) - orderIndex.get(b.id));
        return [...known, ...unknown];
    }, [filterItems, uiEnabled, uiPrefs]);

    const { financialYears, selectedFY, setSelectedFY } = useFinancialYear();

    // Effective state for rendering labels
    const showingFull = isMobileLayout ? true : (!isCollapsed || isHoverOpen);

    return (
        <aside 
            id="app-sidebar"
            className={clsx(styles.sidebar, {
                [styles.collapsed]: !isMobileLayout && isCollapsed && !isHoverOpen,
                [styles.hoverOpen]: !isMobileLayout && isHoverOpen
            }, 'no-print')}
            onMouseEnter={() => !isMobileLayout && isCollapsed && setIsHovered(true)}
            onMouseLeave={() => !isMobileLayout && isCollapsed && setIsHovered(false)}
            data-jsk-ui-component="sidebar"
            data-mobile-open={isMobileLayout && isMobileMenuOpen ? 'true' : 'false'}
            data-jsk-ui-sidebar-state={
                isCollapsed && !isHoverOpen
                    ? 'collapsed'
                    : isHoverOpen
                        ? 'hoverOpen'
                        : 'expanded'
            }
        >
            <div className={styles.header}>
                <div className={styles.brand}>
                    <div className={styles.logoWrapper}>
                        {logoUrl && showingFull ? (
                            <img
                                src={logoUrl}
                                alt="Logo"
                                className={styles.logoImage}
                                style={{ maxHeight: `${logoHeight}px` }}
                                crossOrigin="anonymous"
                                onError={() => setLogoUrl(null)}
                            />
                        ) : showingFull ? (
                            <div className={styles.brandText}>
                                <span className={styles.focus}>JSK <span className={styles.one}>URJA</span></span>
                                <span className={styles.tagline}>CRM/ERP SYSTEM</span>
                            </div>
                        ) : (
                            <div className={styles.collapsedLogo} title="JSK URJA CRM/ERP">
                                <div className={styles.juText}>JU</div>
                            </div>
                        )}
                    </div>
                </div>

                {showingFull && (
                    <div className={styles.sidebarSelectors}>
                        <div className={styles.selectorGroup}>
                            <CompanySwitcher />
                        </div>
                        
                        <div className={styles.fySelectorContainer}>
                            <div className={styles.fyHeader}>
                                <Calendar size={13} className={styles.fyIcon} />
                                <span className={styles.fyLabel}>Active F.Y.</span>
                            </div>
                            <select 
                                className={styles.fySelect}
                                value={selectedFY || ''}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                title="Switch Financial Year"
                            >
                                {(!financialYears || financialYears.length === 0) && (
                                    <option value="">Loading F.Y…</option>
                                )}
                                {financialYears && financialYears.map(fy => (
                                    <option key={fy._id} value={fy.name}>
                                        {fy.name}{fy.isCurrent ? ' ✓' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
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

