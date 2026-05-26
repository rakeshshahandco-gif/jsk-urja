import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { getMyUiPreferences, updateMyUiPreferences, resetMyUiPreferences } from '@/services/userUiPreferencesApi';

/**
 * Default per-user UI preferences. This is the SHAPE the frontend understands.
 * Adding new keys here is forward-compatible: existing DB docs without those
 * keys just fall back to these defaults. Phases beyond #1 will extend this.
 *
 * IMPORTANT: every default below represents "no customization" — applying
 * these values must produce the exact same visual result as not applying
 * anything at all. The CSS-vars applier therefore is a strict no-op until the
 * user changes something.
 */
export const DEFAULT_UI_PREFERENCES = {
    // Phase 2: sidebar customization. Every value defaults to "" (string) or
    // false (boolean) which represents "no customization" — the CSS applier
    // below only writes a variable + guard attribute when the value is truthy,
    // so leaving things empty means the existing Sidebar.module.scss styles
    // continue to apply unchanged.
    sidebar: {
        bg: '',          // hex / rgb / rgba — sidebar background
        text: '',        // link label color (non-active)
        icon: '',        // icon color (non-active)
        activeBg: '',    // active row background
        activeText: '',  // active row text + icon color
        hoverBg: '',     // hover background
        width: '',       // '' | 'compact' | 'normal' | 'wide'
        iconOnly: false, // hides labels in expanded sidebar (Phase 9a)
        glass: false,    // translucent + backdrop blur
    },
    // Phase 8b: per-user sidebar layout (hide / reorder top-level menu items).
    // Empty arrays = identity behaviour (no change from menuConfig).
    sidebarLayout: {
        hiddenIds: [],   // top-level menu item ids the user wants hidden
        orderIds: [],    // desired order; missing ids fall through in their original order
    },
    header: {
        style: '',      // '' | 'white' | 'dark' | 'gradient' | 'brand' | 'transparent'
    },
    dashboard: {
        theme: '',      // '' | 'professional' | 'colorful' | 'minimal' | 'flat' | 'modernDark'
        // Phase 8 (stub for now) - per-user dashboard layout:
        // shape will be { order: string[], hidden: string[], shortcuts: string[] }
        layout: null,
    },
    menuLayout: '',     // Phase 9 stub: '' | 'sidebar' | 'topbar' | 'hybrid'
    mode: '',           // '' | 'light' | 'dark' | 'auto'
    compact: false,
    fontSize: '',       // '' | 'small' | 'normal' | 'large' | 'xlarge'
    // Optional master brand colour. When set, it auto-tints the sidebar
    // active row (only if the user hasn't picked a custom sidebar.activeBg)
    // and the header in 'brand' style. Empty string = no effect.
    brand: {
        color: '',      // hex / rgb / rgba — single source of brand tint
    },
};

function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = { ...base };
    for (const key of Object.keys(patch)) {
        const pv = patch[key];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) && base[key] && typeof base[key] === 'object') {
            out[key] = deepMerge(base[key], pv);
        } else if (pv !== undefined) {
            out[key] = pv;
        }
    }
    return out;
}

const UiPreferencesContext = createContext(null);

/**
 * UI Preferences Provider.
 *
 * KILL-SWITCH: if the company feature flag `ui.advancedCustomizationEnabled`
 * is OFF (default), this provider does ZERO work:
 *   - no API call to fetch the user's prefs
 *   - no CSS variables applied to :root
 *   - no side effects on the DOM
 *   - the context is still mounted (so consumers don't crash) but it always
 *     reports `enabled: false` and an empty preferences object.
 *
 * The existing CRM UI therefore renders byte-identical to today when the
 * master toggle is OFF.
 */
export function UiPreferencesProvider({ children }) {
    const { isFeatureEnabled, loading: featureLoading } = useFeatureSettings();
    const { user } = useAuth() || {};
    const enabled = isFeatureEnabled('ui.advancedCustomizationEnabled');

    const [preferences, setPreferences] = useState(DEFAULT_UI_PREFERENCES);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const appliedRef = useRef(false);

    const load = useCallback(async () => {
        if (!enabled || !user?._id) return;
        setLoading(true);
        setError('');
        try {
            const result = await getMyUiPreferences();
            setPreferences(deepMerge(DEFAULT_UI_PREFERENCES, result?.preferences || {}));
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load UI preferences');
            setPreferences(DEFAULT_UI_PREFERENCES);
        } finally {
            setLoading(false);
        }
    }, [enabled, user?._id]);

    // Load only when enabled and user is known. When disabled, this hook is a no-op.
    useEffect(() => {
        if (featureLoading) return;
        if (enabled) {
            load();
        } else {
            setPreferences(DEFAULT_UI_PREFERENCES);
        }
    }, [enabled, featureLoading, load]);

    // ---------------------------------------------------------------------
    // CSS applier. Writes namespaced --jsk-ui-* variables to :root and a
    // per-property guard attribute (e.g. data-jsk-ui-sidebar-bg-set="1") so
    // jskUiCustomization.css can conditionally activate each rule.
    //
    // Safety contract:
    //   - We only write a variable when the user has chosen a value (truthy).
    //     If the user clears a value, we REMOVE both the var and the guard,
    //     restoring the original SCSS behaviour.
    //   - When the master flag flips OFF we wipe every attribute/var we own.
    //   - Every attribute and variable we touch is namespaced jsk-ui-* so we
    //     can never collide with existing app styles.
    // ---------------------------------------------------------------------

    // List of all per-property guard attributes this layer owns. Adding new
    // ones in future phases? Append here so the OFF-cleanup keeps working.
    const OWNED_GUARD_ATTRS = useMemo(() => ([
        'data-jsk-ui-sidebar-bg-set',
        'data-jsk-ui-sidebar-text-set',
        'data-jsk-ui-sidebar-icon-set',
        'data-jsk-ui-sidebar-active-bg-set',
        'data-jsk-ui-sidebar-active-text-set',
        'data-jsk-ui-sidebar-hover-bg-set',
        'data-jsk-ui-sidebar-width',
        'data-jsk-ui-sidebar-glass',
        // Phase 3: theme mode
        'data-jsk-ui-mode',
        // Phase 4-7, 9 additions
        'data-jsk-ui-compact',
        'data-jsk-ui-font-size',
        'data-jsk-ui-header-style',
        'data-jsk-ui-dashboard-theme',
        'data-jsk-ui-sidebar-icon-only',
        // Phase 9b: menu layout
        'data-jsk-ui-menu-layout',
        // Phase 11: master brand colour
        'data-jsk-ui-brand-set',
    ]), []);

    const OWNED_VARS = useMemo(() => ([
        '--jsk-ui-sidebar-bg',
        '--jsk-ui-sidebar-text',
        '--jsk-ui-sidebar-icon',
        '--jsk-ui-sidebar-active-bg',
        '--jsk-ui-sidebar-active-text',
        '--jsk-ui-sidebar-hover-bg',
        '--jsk-ui-brand',
    ]), []);

    useEffect(() => {
        const root = document.documentElement;

        const setVarAndGuard = (varName, attrName, value) => {
            if (value && typeof value === 'string') {
                root.style.setProperty(varName, value);
                root.setAttribute(attrName, '1');
            } else {
                root.style.removeProperty(varName);
                root.removeAttribute(attrName);
            }
        };

        const wipeAll = () => {
            root.removeAttribute('data-jsk-ui');
            for (const a of OWNED_GUARD_ATTRS) root.removeAttribute(a);
            for (const v of OWNED_VARS) root.style.removeProperty(v);
        };

        if (!enabled) {
            if (appliedRef.current) {
                wipeAll();
                appliedRef.current = false;
            }
            return;
        }

        // Master marker — every CSS rule in jskUiCustomization.css requires it.
        root.setAttribute('data-jsk-ui', 'on');
        appliedRef.current = true;

        const s = preferences.sidebar || {};

        // Colors — only applied when the user has set a value.
        setVarAndGuard('--jsk-ui-sidebar-bg',          'data-jsk-ui-sidebar-bg-set',          s.bg);
        setVarAndGuard('--jsk-ui-sidebar-text',        'data-jsk-ui-sidebar-text-set',        s.text);
        setVarAndGuard('--jsk-ui-sidebar-icon',        'data-jsk-ui-sidebar-icon-set',        s.icon);
        setVarAndGuard('--jsk-ui-sidebar-active-bg',   'data-jsk-ui-sidebar-active-bg-set',   s.activeBg);
        setVarAndGuard('--jsk-ui-sidebar-active-text', 'data-jsk-ui-sidebar-active-text-set', s.activeText);
        setVarAndGuard('--jsk-ui-sidebar-hover-bg',    'data-jsk-ui-sidebar-hover-bg-set',    s.hoverBg);

        // Width preset — enum attribute. "normal" / empty / unknown all clear.
        if (s.width === 'compact' || s.width === 'wide') {
            root.setAttribute('data-jsk-ui-sidebar-width', s.width);
        } else {
            root.removeAttribute('data-jsk-ui-sidebar-width');
        }

        // Glass effect — boolean attribute.
        if (s.glass) {
            root.setAttribute('data-jsk-ui-sidebar-glass', '1');
        } else {
            root.removeAttribute('data-jsk-ui-sidebar-glass');
        }

        // ---------------- Phase 3: theme mode ----------------
        // Resolve "auto" by reading the OS preference. "" / unknown clears.
        const resolveMode = (raw) => {
            if (raw === 'light' || raw === 'dark') return raw;
            if (raw === 'auto') {
                if (typeof window !== 'undefined' && window.matchMedia) {
                    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                return 'light';
            }
            return '';
        };

        const resolvedMode = resolveMode(preferences.mode);
        if (resolvedMode) {
            root.setAttribute('data-jsk-ui-mode', resolvedMode);
        } else {
            root.removeAttribute('data-jsk-ui-mode');
        }

        // ---------------- Phase 4: compact mode ----------------
        if (preferences.compact === true) {
            root.setAttribute('data-jsk-ui-compact', '1');
        } else {
            root.removeAttribute('data-jsk-ui-compact');
        }

        // ---------------- Phase 5: font size ----------------
        const fsAllowed = ['small', 'normal', 'large', 'xlarge'];
        if (fsAllowed.includes(preferences.fontSize)) {
            root.setAttribute('data-jsk-ui-font-size', preferences.fontSize);
        } else {
            root.removeAttribute('data-jsk-ui-font-size');
        }

        // ---------------- Phase 6: header style ----------------
        const headerAllowed = ['white', 'dark', 'gradient', 'brand', 'transparent'];
        const headerStyle = preferences.header?.style;
        if (headerAllowed.includes(headerStyle)) {
            root.setAttribute('data-jsk-ui-header-style', headerStyle);
        } else {
            root.removeAttribute('data-jsk-ui-header-style');
        }

        // ---------------- Phase 7: dashboard theme ----------------
        const dashAllowed = ['professional', 'colorful', 'minimal', 'flat', 'modernDark'];
        const dashTheme = preferences.dashboard?.theme;
        if (dashAllowed.includes(dashTheme)) {
            root.setAttribute('data-jsk-ui-dashboard-theme', dashTheme);
        } else {
            root.removeAttribute('data-jsk-ui-dashboard-theme');
        }

        // ---------------- Phase 9a: sidebar icon-only ----------------
        if (s.iconOnly === true) {
            root.setAttribute('data-jsk-ui-sidebar-icon-only', '1');
        } else {
            root.removeAttribute('data-jsk-ui-sidebar-icon-only');
        }

        // ---------------- Phase 9b: menu layout ----------------
        // 'topbar' shows the horizontal menu and hides the sidebar. Any other
        // value (including '', 'sidebar', or unknown) clears the attribute and
        // falls back to the original sidebar layout.
        const menuLayoutAllowed = ['topbar'];
        if (menuLayoutAllowed.includes(preferences.menuLayout)) {
            root.setAttribute('data-jsk-ui-menu-layout', preferences.menuLayout);
        } else {
            root.removeAttribute('data-jsk-ui-menu-layout');
        }

        // ---------------- Phase 11: master brand colour ----------------
        // Single colour that auto-tints multiple visible elements (currently
        // sidebar active row + 'brand' header style). Per-control values
        // continue to win if the user has set them, because the CSS uses
        // `:not([data-jsk-ui-sidebar-active-bg-set="1"])` style guards.
        setVarAndGuard('--jsk-ui-brand', 'data-jsk-ui-brand-set', preferences.brand?.color);
    }, [enabled, preferences, OWNED_GUARD_ATTRS, OWNED_VARS]);

    // ---------------------------------------------------------------------
    // Phase 3: when the user picks "auto", listen to the OS color-scheme
    // change so the app re-themes live without a reload. Listener is created
    // only when needed and torn down on mode change / disable.
    // ---------------------------------------------------------------------
    useEffect(() => {
        if (!enabled) return undefined;
        if (preferences.mode !== 'auto') return undefined;
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            document.documentElement.setAttribute(
                'data-jsk-ui-mode',
                mq.matches ? 'dark' : 'light',
            );
        };
        // Apply once now in case the OS theme flipped between renders.
        apply();
        // addEventListener is the modern API; addListener is the deprecated
        // fallback for Safari < 14.
        if (mq.addEventListener) {
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }
        mq.addListener(apply);
        return () => mq.removeListener(apply);
    }, [enabled, preferences.mode]);

    const update = useCallback(async (patch) => {
        if (!enabled) return preferences;
        // Optimistic local merge so the UI feels instant.
        const next = deepMerge(preferences, patch || {});
        setPreferences(next);
        try {
            const result = await updateMyUiPreferences(patch || {});
            const merged = deepMerge(DEFAULT_UI_PREFERENCES, result?.preferences || {});
            setPreferences(merged);
            return merged;
        } catch (e) {
            // Rollback on failure.
            setPreferences(preferences);
            setError(e.response?.data?.message || e.message || 'Failed to save UI preferences');
            throw e;
        }
    }, [enabled, preferences]);

    const reset = useCallback(async () => {
        if (!enabled) return DEFAULT_UI_PREFERENCES;
        try {
            await resetMyUiPreferences();
            setPreferences(DEFAULT_UI_PREFERENCES);
            return DEFAULT_UI_PREFERENCES;
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to reset UI preferences');
            throw e;
        }
    }, [enabled]);

    const value = useMemo(() => ({
        enabled,
        loading,
        error,
        preferences,
        update,
        reset,
        reload: load,
    }), [enabled, loading, error, preferences, update, reset, load]);

    return (
        <UiPreferencesContext.Provider value={value}>
            {children}
        </UiPreferencesContext.Provider>
    );
}

export function useUiPreferences() {
    const ctx = useContext(UiPreferencesContext);
    if (!ctx) {
        // Safe no-op fallback if anything renders outside the provider.
        return {
            enabled: false,
            loading: false,
            error: '',
            preferences: DEFAULT_UI_PREFERENCES,
            update: async () => DEFAULT_UI_PREFERENCES,
            reset: async () => DEFAULT_UI_PREFERENCES,
            reload: async () => {},
        };
    }
    return ctx;
}

export default UiPreferencesProvider;
