import React, { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useAuth } from '@/hooks/useAuth';
import { menuConfig, ROLES } from '@/config/menu.config';
import { PATHS } from '@/routes/paths';
import { MENU_FEATURE_BY_ID, MENU_FEATURE_ALWAYS_VISIBLE } from '@/config/menuFeatureMap';

const page = {
    padding: '24px',
    maxWidth: '960px',
    margin: '0 auto',
    fontFamily: 'Outfit, system-ui, sans-serif',
};

const title = {
    fontSize: '22px',
    fontWeight: 700,
    color: '#0F172A',
    margin: 0,
};

const subtitle = {
    fontSize: '13px',
    color: '#64748B',
    marginTop: '4px',
};

const card = {
    background: '#fff',
    border: '1px solid #E2E8F0',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '20px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};

const sectionTitle = {
    fontSize: '15px',
    fontWeight: 700,
    color: '#0F172A',
    margin: '0 0 4px 0',
};

const sectionHint = {
    fontSize: '12px',
    color: '#64748B',
    marginBottom: '16px',
};

const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '14px',
};

const fieldLabel = {
    display: 'block',
    fontSize: '12px',
    color: '#475569',
    fontWeight: 600,
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
};

const colorRow = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
};

const colorSwatch = {
    width: '44px',
    height: '36px',
    padding: 0,
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    cursor: 'pointer',
    background: '#fff',
};

const textInput = {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    color: '#0F172A',
    outline: 'none',
    fontFamily: 'monospace',
};

const clearBtn = {
    padding: '8px 10px',
    fontSize: '12px',
    fontWeight: 600,
    background: '#F1F5F9',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    color: '#64748B',
    cursor: 'pointer',
};

const radioRow = {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
};

const radioBtn = (active) => ({
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    background: active ? '#EFF6FF' : '#fff',
    border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`,
    borderRadius: '10px',
    color: active ? '#2563EB' : '#475569',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
});

const toggleRow = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
};

const dangerBtn = {
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 700,
    background: '#fff',
    border: '1.5px solid #FCA5A5',
    borderRadius: '10px',
    color: '#DC2626',
    cursor: 'pointer',
};

const banner = {
    padding: '14px 18px',
    borderRadius: '12px',
    background: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#92400E',
    fontSize: '13px',
    lineHeight: 1.5,
    margin: '20px 0',
};

// ----------------------------------------------------------------------------
// Quick Presets
// One-click combos that fan out into the same `update(...)` call we already
// use for individual controls. Each payload explicitly sets every key it cares
// about so applying preset A then preset B always produces preset B (no leak).
// Adding a new preset? Just append below — no other file changes required.
// ----------------------------------------------------------------------------
const NEUTRAL_SIDEBAR = {
    bg: '',
    text: '',
    icon: '',
    activeBg: '',
    activeText: '',
    hoverBg: '',
    width: '',
    iconOnly: false,
    glass: false,
};

const QUICK_PRESETS = [
    {
        id: 'original',
        label: 'Original',
        hint: 'Earlier baseline look. Left sidebar only — no top menu, no theme tweaks.',
        chip: 'linear-gradient(135deg, #F1F5F9 0%, #FFFFFF 60%, #E2E8F0 100%)',
        payload: {
            mode: '',
            compact: false,
            fontSize: '',
            sidebar: { ...NEUTRAL_SIDEBAR },
            header: { style: '' },
            dashboard: { theme: '' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
    {
        id: 'corporate',
        label: 'Corporate Pro',
        hint: 'Clean, safe default. Best for daily use.',
        chip: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 60%, #DBEAFE 100%)',
        payload: {
            mode: '',
            compact: false,
            fontSize: '',
            sidebar: { ...NEUTRAL_SIDEBAR },
            header: { style: '' },
            dashboard: { theme: 'professional' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
    {
        id: 'dark',
        label: 'Modern Dark',
        hint: 'Easy on the eyes for long sessions.',
        chip: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #2563EB 100%)',
        payload: {
            mode: 'dark',
            compact: false,
            fontSize: '',
            sidebar: { ...NEUTRAL_SIDEBAR },
            header: { style: 'dark' },
            dashboard: { theme: 'modernDark' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
    {
        id: 'vibrant',
        label: 'Vibrant Gradient',
        hint: 'Lively. Great for owner & demo screens.',
        chip: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 50%, #FCE7F3 100%)',
        payload: {
            mode: '',
            compact: false,
            fontSize: '',
            sidebar: { ...NEUTRAL_SIDEBAR, width: 'wide' },
            header: { style: 'gradient' },
            dashboard: { theme: 'colorful' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
    {
        id: 'compact',
        label: 'Compact Power-user',
        hint: 'Dense layout. Best for finance / data entry.',
        chip: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 50%, #94A3B8 100%)',
        payload: {
            mode: '',
            compact: true,
            fontSize: 'small',
            sidebar: { ...NEUTRAL_SIDEBAR, width: 'compact', iconOnly: true },
            header: { style: 'white' },
            dashboard: { theme: 'minimal' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
    {
        id: 'glass',
        label: 'Glass Premium',
        hint: 'Frosted modern look with translucent sidebar.',
        chip: 'linear-gradient(135deg, #E0F2FE 0%, rgba(255,255,255,0.6) 50%, #C7D2FE 100%)',
        payload: {
            mode: '',
            compact: false,
            fontSize: '',
            sidebar: { ...NEUTRAL_SIDEBAR, glass: true, bg: 'rgba(255,255,255,0.55)' },
            header: { style: 'transparent' },
            dashboard: { theme: 'colorful' },
            menuLayout: '',
            brand: { color: '' },
        },
    },
];

// Small palette of common brand colours offered as quick chips on the
// Brand colour picker. Users can still pick any colour via the native picker.
const BRAND_SWATCHES = [
    { color: '#2563EB', label: 'Royal Blue (default)' },
    { color: '#7C3AED', label: 'Purple' },
    { color: '#0EA5E9', label: 'Sky' },
    { color: '#10B981', label: 'Emerald' },
    { color: '#F59E0B', label: 'Amber' },
    { color: '#EF4444', label: 'Red' },
    { color: '#0F172A', label: 'Charcoal' },
];

const presetGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
};

const presetCard = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: '#fff',
    border: '1.5px solid #E2E8F0',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
    fontFamily: 'inherit',
};

const presetChip = {
    height: '52px',
    borderRadius: '8px',
    border: '1px solid rgba(15,23,42,0.06)',
};

const presetLabel = {
    fontSize: '13px',
    fontWeight: 700,
    color: '#0F172A',
};

const presetHint = {
    fontSize: '11px',
    color: '#64748B',
    lineHeight: 1.35,
};

function ColorField({ label, value, onChange }) {
    return (
        <div>
            <label style={fieldLabel}>{label}</label>
            <div style={colorRow}>
                <input
                    type="color"
                    value={value || '#ffffff'}
                    onChange={(e) => onChange(e.target.value)}
                    style={colorSwatch}
                    title={value ? `Current: ${value}` : 'Not set — using default'}
                />
                <input
                    type="text"
                    value={value || ''}
                    placeholder="not set (default)"
                    onChange={(e) => onChange(e.target.value)}
                    style={textInput}
                />
                {value && (
                    <button
                        type="button"
                        style={clearBtn}
                        onClick={() => onChange('')}
                        title="Reset to default"
                    >
                        Reset
                    </button>
                )}
            </div>
        </div>
    );
}

export default function UiPreferencesPage() {
    const { enabled, loading, error, preferences, update, reset } = useUiPreferences();
    const { isFeatureEnabled, loading: featureLoading } = useFeatureSettings();
    const { user, hasPermission } = useAuth();

    const sidebar = preferences?.sidebar || {};
    const sidebarLayout = preferences?.sidebarLayout || { hiddenIds: [], orderIds: [] };

    // Visible top-level menu items for this user (mirrors the Sidebar's role +
    // permission + feature filter, but skips children since we only reorder /
    // hide top-level entries). Computed once per user/feature change.
    const visibleTopLevel = useMemo(() => {
        const userRole = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name) || ROLES.VIEWER;
        const isAdmin = ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(String(userRole).toLowerCase());
        return menuConfig.filter((item) => {
            if (!MENU_FEATURE_ALWAYS_VISIBLE.has(item.id)) {
                const featurePath = MENU_FEATURE_BY_ID[item.id];
                if (featurePath && !isFeatureEnabled(featurePath)) return false;
            }
            if (isAdmin) return true;
            if (item.permission) return hasPermission(item.permission);
            if (item.roles) return item.roles.includes(userRole);
            return true;
        });
    }, [user, hasPermission, isFeatureEnabled]);

    // Order to display in the layout-editor: user's order first, then any
    // visible items the user hasn't explicitly ordered yet.
    const orderedTopLevel = useMemo(() => {
        const visibleById = new Map(visibleTopLevel.map((it) => [it.id, it]));
        const seen = new Set();
        const out = [];
        for (const id of (sidebarLayout.orderIds || [])) {
            if (visibleById.has(id) && !seen.has(id)) {
                out.push(visibleById.get(id));
                seen.add(id);
            }
        }
        for (const it of visibleTopLevel) {
            if (!seen.has(it.id)) out.push(it);
        }
        return out;
    }, [visibleTopLevel, sidebarLayout.orderIds]);

    const hiddenSet = useMemo(
        () => new Set(Array.isArray(sidebarLayout.hiddenIds) ? sidebarLayout.hiddenIds : []),
        [sidebarLayout.hiddenIds],
    );

    const handleSidebarChange = async (patch) => {
        try {
            await update({ sidebar: { ...sidebar, ...patch } });
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || 'Failed to save');
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Reset all your UI customizations to defaults? This affects only your account.')) {
            return;
        }
        try {
            await reset();
            toast.success('UI preferences reset to defaults');
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || 'Failed to reset');
        }
    };

    const widthOptions = useMemo(() => ([
        { value: '', label: 'Default (280)' },
        { value: 'compact', label: 'Compact (220)' },
        { value: 'wide', label: 'Wide (320)' },
    ]), []);

    const modeOptions = useMemo(() => ([
        { value: '',      label: 'Default',      hint: 'Use the original CRM look' },
        { value: 'light', label: 'Light',        hint: 'Force light surfaces' },
        { value: 'dark',  label: 'Dark',         hint: 'Dark shell (beta)' },
        { value: 'auto',  label: 'Auto (system)', hint: 'Follow OS preference' },
    ]), []);

    const fontSizeOptions = useMemo(() => ([
        { value: '',       label: 'Default' },
        { value: 'small',  label: 'Small (13px)' },
        { value: 'normal', label: 'Normal (14px)' },
        { value: 'large',  label: 'Large (15px)' },
        { value: 'xlarge', label: 'X-Large (16px)' },
    ]), []);

    const headerStyleOptions = useMemo(() => ([
        { value: '',            label: 'Default' },
        { value: 'white',       label: 'White' },
        { value: 'dark',        label: 'Dark' },
        { value: 'gradient',    label: 'Gradient' },
        { value: 'brand',       label: 'Brand blue' },
        { value: 'transparent', label: 'Transparent' },
    ]), []);

    const dashboardThemeOptions = useMemo(() => ([
        { value: '',             label: 'Default' },
        { value: 'professional', label: 'Professional' },
        { value: 'colorful',     label: 'Colorful' },
        { value: 'minimal',      label: 'Minimal' },
        { value: 'flat',         label: 'Flat' },
        { value: 'modernDark',   label: 'Modern Dark' },
    ]), []);

    const safeUpdate = async (patch) => {
        try {
            await update(patch);
        } catch (e) {
            toast.error(e?.response?.data?.message || e.message || 'Failed to save');
        }
    };

    const handleModeChange = (value) => safeUpdate({ mode: value });

    // ---------------- Phase 8b: sidebar layout helpers ----------------
    const persistSidebarLayout = useCallback(async (next) => {
        // next: { hiddenIds, orderIds }
        await safeUpdate({ sidebarLayout: { ...sidebarLayout, ...next } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sidebarLayout]);

    const toggleHidden = useCallback((id) => {
        const cur = new Set(Array.isArray(sidebarLayout.hiddenIds) ? sidebarLayout.hiddenIds : []);
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
        persistSidebarLayout({ hiddenIds: Array.from(cur) });
    }, [sidebarLayout.hiddenIds, persistSidebarLayout]);

    const moveItem = useCallback((id, dir) => {
        const arr = orderedTopLevel.map((it) => it.id);
        const idx = arr.indexOf(id);
        if (idx < 0) return;
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= arr.length) return;
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        persistSidebarLayout({ orderIds: arr });
    }, [orderedTopLevel, persistSidebarLayout]);

    const resetSidebarLayout = useCallback(() => {
        persistSidebarLayout({ hiddenIds: [], orderIds: [] });
    }, [persistSidebarLayout]);

    // Master feature flag off — show informative banner.
    if (!featureLoading && !isFeatureEnabled('ui.advancedCustomizationEnabled')) {
        return (
            <div style={page}>
                <h1 style={title}>UI Preferences</h1>
                <p style={subtitle}>Customise the look and feel of your CRM workspace.</p>
                <div style={banner}>
                    <strong>UI customization is currently disabled by your administrator.</strong>
                    <br />
                    To enable, ask an admin to turn on
                    <code style={{ background: '#FDE68A', padding: '2px 6px', borderRadius: '4px', margin: '0 4px' }}>
                        UI Customization &gt; Enable Advanced UI Customization
                    </code>
                    in
                    <Link to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=ui`} style={{ color: '#92400E', marginLeft: '4px', fontWeight: 700 }}>
                        Admin &rsaquo; Feature Configuration Engine
                    </Link>.
                    <br />
                    <span style={{ fontSize: '12px', opacity: 0.85 }}>
                        When disabled, your existing CRM UI continues to look exactly as it does today.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div style={page}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={title}>UI Preferences</h1>
                    <p style={subtitle}>
                        Personalise your sidebar appearance. These settings apply only to your account
                        and never affect other users.
                    </p>
                </div>
                <button type="button" style={dangerBtn} onClick={handleReset}>
                    Reset all to defaults
                </button>
            </div>

            {error && (
                <div style={{ ...banner, background: '#FEE2E2', borderColor: '#FCA5A5', color: '#991B1B' }}>
                    {error}
                </div>
            )}

            {loading && (
                <p style={{ ...subtitle, marginTop: '16px' }}>Loading your preferences&hellip;</p>
            )}

            {/* ---------------- Quick Presets (one-click look apply) ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Quick presets</h2>
                <p style={sectionHint}>
                    One click applies a ready-made look. You can still fine-tune any setting below
                    afterwards. Affects only your account.
                </p>
                <div style={presetGrid}>
                    {QUICK_PRESETS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            style={presetCard}
                            onClick={async () => {
                                try {
                                    await update(p.payload);
                                    toast.success(`Applied "${p.label}"`);
                                } catch (e) {
                                    toast.error(e?.response?.data?.message || e.message || 'Failed to apply preset');
                                }
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#2563EB';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.12)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#E2E8F0';
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title={p.hint}
                        >
                            <div style={{ ...presetChip, background: p.chip }} />
                            <div style={presetLabel}>{p.label}</div>
                            <div style={presetHint}>{p.hint}</div>
                        </button>
                    ))}
                </div>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '12px', marginBottom: 0 }}>
                    Tip: presets are a starting point &mdash; tweak colors, header style, or layout in the
                    sections below to make it your own.
                </p>
            </div>

            {/* ---------------- Brand colour (master tint) ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Brand colour</h2>
                <p style={sectionHint}>
                    One colour that tints the <strong>sidebar active row</strong> and the <strong>brand</strong> header
                    style. Picking individual sidebar colours below always wins over this.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {BRAND_SWATCHES.map((sw) => {
                        const active = (preferences?.brand?.color || '').toLowerCase() === sw.color.toLowerCase();
                        return (
                            <button
                                key={sw.color}
                                type="button"
                                title={sw.label}
                                onClick={() => safeUpdate({ brand: { color: sw.color } })}
                                style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '8px',
                                    border: active ? '3px solid #0F172A' : '1px solid #CBD5E1',
                                    background: sw.color,
                                    cursor: 'pointer',
                                    padding: 0,
                                    boxShadow: active ? '0 0 0 2px #fff inset' : 'none',
                                    transition: 'transform 0.12s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            />
                        );
                    })}
                </div>
                <ColorField
                    label="Custom brand colour (hex / rgba)"
                    value={preferences?.brand?.color || ''}
                    onChange={(v) => safeUpdate({ brand: { color: v } })}
                />
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '10px', marginBottom: 0 }}>
                    Visible right away on the sidebar active row. To also tint the header, choose
                    <strong> Header style &rarr; Brand blue</strong> below.
                </p>
            </div>

            {/* ---------------- Theme mode (light / dark / auto) ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Theme mode</h2>
                <p style={sectionHint}>
                    Choose how the overall app shell should render. <strong>Dark mode is currently in beta</strong> &mdash;
                    it themes the sidebar and the main scroll background; some interior screens still
                    use white cards and will be migrated in later phases.
                </p>
                <div style={radioRow}>
                    {modeOptions.map((opt) => {
                        const active = (preferences?.mode || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => handleModeChange(opt.value)}
                                title={opt.hint}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---------------- Sidebar — Colors ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Sidebar colors</h2>
                <p style={sectionHint}>
                    Pick custom colors or click <em>Reset</em> on any field to return that single value to the default.
                </p>
                <div style={grid}>
                    <ColorField
                        label="Background"
                        value={sidebar.bg}
                        onChange={(v) => handleSidebarChange({ bg: v })}
                    />
                    <ColorField
                        label="Text color"
                        value={sidebar.text}
                        onChange={(v) => handleSidebarChange({ text: v })}
                    />
                    <ColorField
                        label="Icon color"
                        value={sidebar.icon}
                        onChange={(v) => handleSidebarChange({ icon: v })}
                    />
                    <ColorField
                        label="Hover background"
                        value={sidebar.hoverBg}
                        onChange={(v) => handleSidebarChange({ hoverBg: v })}
                    />
                    <ColorField
                        label="Active row background"
                        value={sidebar.activeBg}
                        onChange={(v) => handleSidebarChange({ activeBg: v })}
                    />
                    <ColorField
                        label="Active row text"
                        value={sidebar.activeText}
                        onChange={(v) => handleSidebarChange({ activeText: v })}
                    />
                </div>
            </div>

            {/* ---------------- Sidebar — Width ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Sidebar width</h2>
                <p style={sectionHint}>
                    Affects the expanded sidebar only. Collapsed and hover-open states are unchanged.
                </p>
                <div style={radioRow}>
                    {widthOptions.map((opt) => {
                        const active = (sidebar.width || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => handleSidebarChange({ width: opt.value })}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---------------- Sidebar — Effects ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Effects</h2>
                <p style={sectionHint}>Subtle stylistic touches that can be combined with custom colors.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={!!sidebar.glass}
                            onChange={(e) => handleSidebarChange({ glass: e.target.checked })}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                            Glass effect (translucent background + backdrop blur)
                        </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={!!sidebar.iconOnly}
                            onChange={(e) => handleSidebarChange({ iconOnly: e.target.checked })}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                            Icon-only sidebar (hides labels in the expanded sidebar)
                        </span>
                    </label>
                </div>
            </div>

            {/* ---------------- Phase 4 — Compact mode ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Compact density</h2>
                <p style={sectionHint}>Tightens spacing on the sidebar so more menu items fit on screen.</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={!!preferences.compact}
                        onChange={(e) => safeUpdate({ compact: e.target.checked })}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                        Enable compact layout
                    </span>
                </label>
            </div>

            {/* ---------------- Phase 5 — Font size ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Font size</h2>
                <p style={sectionHint}>
                    Adjusts the base text size. Affects elements that inherit body font-size;
                    components with hard-coded sizes are unchanged.
                </p>
                <div style={radioRow}>
                    {fontSizeOptions.map((opt) => {
                        const active = (preferences?.fontSize || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => safeUpdate({ fontSize: opt.value })}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---------------- Phase 6 — Header style ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Header / Top bar style</h2>
                <p style={sectionHint}>Change the look of the top bar above each page.</p>
                <div style={radioRow}>
                    {headerStyleOptions.map((opt) => {
                        const active = (preferences?.header?.style || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => safeUpdate({ header: { ...(preferences.header || {}), style: opt.value } })}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---------------- Phase 7 — Dashboard theme ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Dashboard theme</h2>
                <p style={sectionHint}>
                    Sets the page backdrop. Deep widget theming arrives later &mdash; for now this
                    paints the background you see behind cards.
                </p>
                <div style={radioRow}>
                    {dashboardThemeOptions.map((opt) => {
                        const active = (preferences?.dashboard?.theme || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => safeUpdate({ dashboard: { ...(preferences.dashboard || {}), theme: opt.value } })}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---------------- Phase 8 (a) — Dashboard personalization (Home page) ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Dashboard personalization</h2>
                <p style={sectionHint}>
                    Pinning forms, drag-to-reorder, recently opened, and reset are already available on your
                    <strong> Home page</strong>. Use the controls there to personalise your quick-access tiles.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Link
                        to="/"
                        style={{
                            ...radioBtn(false),
                            textDecoration: 'none',
                            color: '#2563EB',
                            borderColor: '#2563EB',
                        }}
                    >
                        Open Home page
                    </Link>
                </div>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '10px', marginBottom: 0 }}>
                    Each module&apos;s home page (CRM, Sales, Purchase&hellip;) also supports its own pinned-form
                    personalisation; open the module home and click <em>Pin Form</em>.
                </p>
            </div>

            {/* ---------------- Phase 8 (b) — Sidebar module visibility & order ---------------- */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <h2 style={sectionTitle}>Sidebar modules &mdash; hide &amp; reorder</h2>
                    {(hiddenSet.size > 0 || (sidebarLayout.orderIds || []).length > 0) && (
                        <button
                            type="button"
                            style={{ ...clearBtn, fontSize: '12px' }}
                            onClick={resetSidebarLayout}
                            title="Restore default sidebar layout"
                        >
                            Reset sidebar layout
                        </button>
                    )}
                </div>
                <p style={sectionHint}>
                    Untick modules you never use to hide them from your sidebar. Use the arrows to reorder.
                    These changes only affect <strong>your account</strong>. Hidden modules remain accessible
                    via direct URL and global search.
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {orderedTopLevel.map((item, idx) => {
                        const isHidden = hiddenSet.has(item.id);
                        return (
                            <li
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 12px',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    background: isHidden ? '#F8FAFC' : '#fff',
                                    opacity: isHidden ? 0.6 : 1,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={!isHidden}
                                    onChange={() => toggleHidden(item.id)}
                                    title={isHidden ? 'Show in sidebar' : 'Hide from sidebar'}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                                    {item.title}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => moveItem(item.id, 'up')}
                                    disabled={idx === 0}
                                    style={{
                                        width: '32px',
                                        height: '28px',
                                        background: idx === 0 ? '#F1F5F9' : '#fff',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '6px',
                                        cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                        color: idx === 0 ? '#CBD5E1' : '#475569',
                                        fontWeight: 700,
                                    }}
                                    title="Move up"
                                >
                                    &uarr;
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveItem(item.id, 'down')}
                                    disabled={idx === orderedTopLevel.length - 1}
                                    style={{
                                        width: '32px',
                                        height: '28px',
                                        background: idx === orderedTopLevel.length - 1 ? '#F1F5F9' : '#fff',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '6px',
                                        cursor: idx === orderedTopLevel.length - 1 ? 'not-allowed' : 'pointer',
                                        color: idx === orderedTopLevel.length - 1 ? '#CBD5E1' : '#475569',
                                        fontWeight: 700,
                                    }}
                                    title="Move down"
                                >
                                    &darr;
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* ---------------- Phase 9b — Menu layout ---------------- */}
            <div style={card}>
                <h2 style={sectionTitle}>Menu layout</h2>
                <p style={sectionHint}>
                    Choose between the classic left sidebar and a horizontal top menu bar. Switching
                    layouts is instant and doesn&apos;t affect anyone else&apos;s view.
                </p>
                <div style={radioRow}>
                    {[
                        { value: '',       label: 'Sidebar (default)' },
                        { value: 'topbar', label: 'Top bar' },
                    ].map((opt) => {
                        const active = (preferences?.menuLayout || '') === opt.value;
                        return (
                            <button
                                key={opt.value || 'default'}
                                type="button"
                                style={radioBtn(active)}
                                onClick={() => safeUpdate({ menuLayout: opt.value })}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '10px', marginBottom: 0 }}>
                    Tip: in top-bar mode, click a module to open its dropdown. Press <kbd>Esc</kbd> or click
                    outside to close.
                </p>
            </div>

            <p style={{ ...subtitle, marginTop: '24px', textAlign: 'center' }}>
                Changes are saved automatically. Watch the sidebar &amp; top bar update as you change values.
            </p>
        </div>
    );
}
