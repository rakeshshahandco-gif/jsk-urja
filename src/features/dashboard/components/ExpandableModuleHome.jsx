import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import { MENU_FEATURE_BY_ID } from '@/config/menuFeatureMap';
import { moduleForFormId } from '@/config/menuModuleMap';
import styles from './ExpandableModuleHome.module.scss';

/**
 * Reusable Module Home: main cards + click-to-expand tools (WhatsApp / Communication / Admin).
 * Visibility respects permissions, feature flags, and company module allocation.
 */
export default function ExpandableModuleHome({
    title,
    subtitle,
    sections = [],
    sessionKey,
    dataComponent = 'expandable-module-home',
}) {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const { isFeatureEnabled } = useFeatureSettings();
    const { isModuleEnabled, moduleGuardEnabled } = useModuleGuard();
    const panelRef = useRef(null);

    const isAdmin = ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
        String(user?.role || user?.roleName || '').toLowerCase(),
    );

    const canAccessTool = useCallback(
        (tool) => {
            if (!tool?.path) return false;
            const featurePath = tool.featurePath || MENU_FEATURE_BY_ID[tool.id];
            if (featurePath && !isFeatureEnabled(featurePath)) return false;

            if (moduleGuardEnabled && !tool.skipModuleGuard) {
                const code = tool.moduleCode || moduleForFormId(tool.id);
                if (code && !isModuleEnabled(code)) return false;
            }

            if (isAdmin) return true;

            if (Array.isArray(tool.permissions) && tool.permissions.length) {
                return tool.permissions.some((p) => hasPermission(p));
            }
            if (tool.permission) return hasPermission(tool.permission);
            return true;
        },
        [hasPermission, isAdmin, isFeatureEnabled, isModuleEnabled, moduleGuardEnabled],
    );

    const visibleSections = useMemo(() => {
        return (sections || [])
            .map((section) => {
                if (section.featurePath && !isFeatureEnabled(section.featurePath)) return null;
                if (moduleGuardEnabled && section.moduleCode && !isModuleEnabled(section.moduleCode)) {
                    return null;
                }
                const tools = (section.tools || []).filter(canAccessTool);
                if (!tools.length) return null;
                return { ...section, tools };
            })
            .filter(Boolean);
    }, [sections, canAccessTool, isFeatureEnabled, isModuleEnabled, moduleGuardEnabled]);

    const readSession = () => {
        if (!sessionKey) return '';
        try {
            return sessionStorage.getItem(sessionKey) || '';
        } catch {
            return '';
        }
    };

    const writeSession = (id) => {
        if (!sessionKey) return;
        try {
            if (id) sessionStorage.setItem(sessionKey, id);
            else sessionStorage.removeItem(sessionKey);
        } catch {
            /* ignore */
        }
    };

    const [expandedId, setExpandedId] = useState(() => readSession());

    useEffect(() => {
        if (!expandedId) return;
        if (!visibleSections.some((s) => s.id === expandedId)) {
            setExpandedId('');
            writeSession('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedId, visibleSections]);

    useEffect(() => {
        if (!expandedId || !panelRef.current) return;
        panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [expandedId]);

    const expandedSection = visibleSections.find((s) => s.id === expandedId) || null;

    const toggleSection = (id) => {
        setExpandedId((prev) => {
            const next = prev === id ? '' : id;
            writeSession(next);
            return next;
        });
    };

    const openTool = (path) => {
        if (!path) return;
        navigate(path);
    };

    return (
        <div className={styles.page} data-jsk-ui-component={dataComponent}>
            <header className={styles.header}>
                <h1 className={styles.title}>{title}</h1>
                {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </header>

            <div className={styles.cardGrid}>
                {visibleSections.map((section) => {
                    const Icon = section.icon;
                    const selected = expandedId === section.id;
                    return (
                        <button
                            key={section.id}
                            type="button"
                            className={`${styles.mainCard} ${selected ? styles.mainCardSelected : ''}`}
                            onClick={() => toggleSection(section.id)}
                            aria-expanded={selected}
                            data-section={section.id}
                        >
                            {selected ? (
                                <span className={styles.selectedBadge} aria-hidden="true">
                                    <Check size={14} strokeWidth={2.6} />
                                </span>
                            ) : null}
                            <div className={styles.cardIconWrap}>
                                <Icon size={22} strokeWidth={2.2} />
                            </div>
                            <h2 className={styles.cardTitle}>{section.title}</h2>
                            <p className={styles.cardDesc}>{section.description}</p>
                            <span className={styles.cardAction}>
                                {selected ? 'Close Section' : 'Open Section'}
                            </span>
                            {selected ? <span className={styles.cardPointer} aria-hidden="true" /> : null}
                        </button>
                    );
                })}
            </div>

            {expandedSection ? (
                <ExpandedToolsPanel
                    section={expandedSection}
                    panelRef={panelRef}
                    onClose={() => toggleSection(expandedSection.id)}
                    onOpenTool={openTool}
                />
            ) : null}

            {!visibleSections.length ? (
                <div className={styles.emptyState}>
                    No tools are available for your role or company module allocation.
                </div>
            ) : null}
        </div>
    );
}

function ExpandedToolsPanel({ section, panelRef, onClose, onOpenTool }) {
    const ExpandedIcon = section.icon;
    return (
        <section
            ref={panelRef}
            className={styles.expandedPanel}
            aria-label={section.expandedHeading}
        >
            <div className={styles.expandedHeader}>
                <div className={styles.expandedHeadingRow}>
                    <div className={styles.expandedIconWrap}>
                        <ExpandedIcon size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                        <h3 className={styles.expandedTitle}>{section.expandedHeading}</h3>
                        <p className={styles.expandedHelper}>Click a tool to open.</p>
                    </div>
                </div>
                <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={onClose}
                    aria-label="Close section"
                >
                    <X size={16} />
                </button>
            </div>

            <div className={styles.toolGrid}>
                {section.tools.map((tool) => {
                    const ToolIcon = tool.icon;
                    return (
                        <button
                            key={tool.id}
                            type="button"
                            className={styles.toolCard}
                            onClick={() => onOpenTool(tool.path)}
                        >
                            <div className={styles.toolIconWrap}>
                                <ToolIcon size={18} strokeWidth={2.2} />
                            </div>
                            <div className={styles.toolBody}>
                                <div className={styles.toolTitle}>{tool.title}</div>
                                <div className={styles.toolDesc}>{tool.description}</div>
                            </div>
                            <ChevronRight size={16} className={styles.toolArrow} />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
