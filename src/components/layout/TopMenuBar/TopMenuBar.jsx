import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { menuConfig, ROLES } from '@/config/menu.config';
import { MENU_FEATURE_BY_ID, MENU_FEATURE_ALWAYS_VISIBLE } from '@/config/menuFeatureMap';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { PATHS } from '@/routes/paths';

/* ---------------- styles ---------------- */
const barWrap = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    background: '#fff',
    borderBottom: '1px solid #E2E8F0',
    fontFamily: 'Outfit, system-ui, sans-serif',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
};

const itemBtn = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    fontSize: '13.5px',
    fontWeight: 600,
    background: active ? '#EFF6FF' : 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    color: active ? '#2563EB' : '#475569',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
});

const dropdownPanel = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    background: '#fff',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)',
    minWidth: '220px',
    maxHeight: '70vh',
    overflowY: 'auto',
    padding: '8px',
    zIndex: 100,
};

const sectionHdr = {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '8px 10px 4px 10px',
};

const dropdownItem = (active) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '13px',
    fontWeight: active ? 700 : 500,
    background: active ? '#EFF6FF' : 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: active ? '#2563EB' : '#1E293B',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

/* ---------------- helpers ---------------- */
const getModuleHomePath = (it) => {
    const id = it.id?.toUpperCase().replace(/-/g, '_');
    const specialMappings = {
        CRM: PATHS.CRM?.HOME,
        ACCOUNT_MASTER_PARENT: PATHS.ACCOUNT_MASTER?.HOME,
        GST_MENU: PATHS.GST?.HOME,
        TDS: PATHS.TDS?.HOME,
        TCS: PATHS.TCS?.HOME,
        MIS_REPORTS: PATHS.MIS?.HOME,
        FIXED_ASSETS_PARENT: PATHS.FIXED_ASSETS?.HOME,
        CHINA_SUPPLIER: PATHS.CHINA_SUPPLIER?.HOME,
        RD_SAMPLES: PATHS.RD_SAMPLES?.HOME,
    };
    if (specialMappings[id]) return specialMappings[id];
    if (PATHS[id] && PATHS[id].HOME) return PATHS[id].HOME;
    return null;
};

/**
 * Walk children recursively and emit either:
 *  - { type: 'section', title, items: [...] } when a child has its own children
 *  - { type: 'item',    item }                when a leaf
 * Flattened to a depth of 2 to avoid deep nesting in the dropdown.
 */
const buildDropdownGroups = (children) => {
    const groups = [];
    for (const child of (children || [])) {
        if (child.children && child.children.length > 0) {
            const flatLeaves = [];
            const collect = (arr) => {
                for (const c of arr) {
                    if (c.children && c.children.length > 0) collect(c.children);
                    else flatLeaves.push(c);
                }
            };
            collect(child.children);
            groups.push({ type: 'section', title: child.title, items: flatLeaves });
        } else {
            groups.push({ type: 'item', item: child });
        }
    }
    return groups;
};

export const TopMenuBar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, hasPermission } = useAuth();
    const { isFeatureEnabled } = useFeatureSettings();
    const { enabled: uiEnabled, preferences: uiPrefs } = useUiPreferences();
    const [openId, setOpenId] = useState(null);
    const wrapperRef = useRef(null);

    const userRole = user?.roleName
        || (typeof user?.role === 'string' ? user.role : user?.role?.name)
        || ROLES.VIEWER;

    /* Filter by role + permission + feature; recurse into children first (matches Sidebar). */
    const filterItems = useCallback((items) => {
        const isAdmin = ['admin', 'superadmin', 'system admin', 'systemadmin']
            .includes(String(userRole).toLowerCase());

        const process = (list) => list.map((item) => {
            const children = item.children ? process(item.children).filter(Boolean) : undefined;
            const hasVisibleChildren = Boolean(children?.length);

            if (!MENU_FEATURE_ALWAYS_VISIBLE.has(item.id)) {
                const featurePath = MENU_FEATURE_BY_ID[item.id];
                if (featurePath && !isFeatureEnabled(featurePath)) return null;
            }

            if (!isAdmin) {
                const hasPerm = item.permission ? hasPermission(item.permission) : false;
                if (item.permission && !hasPerm) return null;
                if (item.roles && !item.roles.includes(userRole) && !hasPerm && !hasVisibleChildren) {
                    return null;
                }
            }

            if (children) {
                if (!children.length) return null;
                return { ...item, children };
            }
            return item;
        }).filter(Boolean);

        return process(items);
    }, [hasPermission, userRole, isFeatureEnabled]);

    /* Apply user's hide/reorder layout (same logic as Sidebar). */
    const items = useMemo(() => {
        const filtered = filterItems(menuConfig);
        if (!uiEnabled) return filtered;
        const layout = uiPrefs?.sidebarLayout || {};
        const hidden = new Set(Array.isArray(layout.hiddenIds) ? layout.hiddenIds : []);
        const order = Array.isArray(layout.orderIds) ? layout.orderIds : [];

        const afterHide = hidden.size > 0
            ? filtered.filter((it) => !hidden.has(it.id))
            : filtered;
        if (order.length === 0) return afterHide;

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

    const isPathActive = useCallback((path) => {
        if (!path) return false;
        if (location.pathname === path) return true;
        if (path !== '/' && location.pathname.startsWith(path)) return true;
        return false;
    }, [location.pathname]);

    const isItemActive = useCallback((it) => {
        if (isPathActive(it.path)) return true;
        if (it.children) return it.children.some(isItemActive);
        return false;
    }, [isPathActive]);

    /* Close dropdown when clicking outside or pressing Escape. */
    useEffect(() => {
        if (!openId) return undefined;
        const onMouseDown = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpenId(null);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpenId(null);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [openId]);

    /* Close dropdown on route change. */
    useEffect(() => {
        setOpenId(null);
    }, [location.pathname]);

    const handleTopClick = (item) => {
        const hasChildren = item.children && item.children.length > 0;
        if (hasChildren) {
            // Original UI behavior: do NOT open a dropdown under the top bar.
            // Instead, ask the LEFT sidebar to expand the matching parent item
            // inline so the user picks the child from there.
            setOpenId(null);
            try {
                window.dispatchEvent(new CustomEvent('jsk-sidebar-expand', { detail: { id: item.id } }));
            } catch { /* CustomEvent unavailable — silently no-op */ }
            return;
        }
        const target = item.path || getModuleHomePath(item);
        if (target && location.pathname !== target) navigate(target);
    };

    const handleLeafClick = (path) => {
        if (path && location.pathname !== path) navigate(path);
        setOpenId(null);
    };

    return (
        <div
            ref={wrapperRef}
            style={barWrap}
            className="no-print"
            data-jsk-ui-component="top-menu-bar"
            role="navigation"
            aria-label="Primary"
        >
            {items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const active = isItemActive(item);
                const isOpen = openId === item.id;
                return (
                    <div key={item.id} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            style={itemBtn(active)}
                            onClick={() => handleTopClick(item)}
                            aria-haspopup={hasChildren || undefined}
                            aria-expanded={hasChildren ? isOpen : undefined}
                        >
                            <span>{item.title}</span>
                            {hasChildren && (
                                <ChevronDown
                                    size={14}
                                    style={{
                                        transform: isOpen ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.15s ease',
                                    }}
                                />
                            )}
                        </button>
                        {isOpen && hasChildren && (
                            <div
                                style={dropdownPanel}
                                role="menu"
                                data-jsk-ui-component="top-menu-dropdown"
                            >
                                {buildDropdownGroups(item.children).map((g, gi) => {
                                    if (g.type === 'section') {
                                        return (
                                            <div key={`s-${gi}`}>
                                                <div
                                                    style={sectionHdr}
                                                    data-jsk-ui-component="top-menu-section-header"
                                                >
                                                    {g.title}
                                                </div>
                                                {g.items.map((leaf) => {
                                                    const active = isPathActive(leaf.path);
                                                    return (
                                                        <button
                                                            key={leaf.id}
                                                            type="button"
                                                            role="menuitem"
                                                            style={dropdownItem(active)}
                                                            onClick={() => handleLeafClick(leaf.path)}
                                                            data-jsk-ui-component="top-menu-item"
                                                            data-jsk-ui-active={active ? '1' : undefined}
                                                        >
                                                            {leaf.title}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    }
                                    const active = isPathActive(g.item.path);
                                    return (
                                        <button
                                            key={g.item.id}
                                            type="button"
                                            role="menuitem"
                                            style={dropdownItem(active)}
                                            onClick={() => handleLeafClick(g.item.path)}
                                            data-jsk-ui-component="top-menu-item"
                                            data-jsk-ui-active={active ? '1' : undefined}
                                        >
                                            {g.item.title}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TopMenuBar;
