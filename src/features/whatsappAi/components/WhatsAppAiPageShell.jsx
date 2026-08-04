import React from 'react';
import { NavLink } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { FOUNDATION_NOTICE } from '../constants';
import { useAuth } from '@/hooks/useAuth';
import { WHATSAPP_AI_PERMISSIONS } from '../constants';
import WhatsAppHomeBackLink from '@/features/whatsapp/components/WhatsAppHomeBackLink';

const page = {
    padding: '16px 20px 28px',
    fontFamily: "'Segoe UI', 'Noto Sans', sans-serif",
    background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
    minHeight: '100%',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
};

const card = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 20,
};

const filterRow = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
};

const filterInput = {
    padding: '9px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    minWidth: 140,
    flex: '1 1 140px',
    maxWidth: 280,
    background: '#fff',
    boxSizing: 'border-box',
};

const btnDisabled = {
    padding: '9px 14px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#f1f5f9',
    color: '#94a3b8',
    fontWeight: 600,
    cursor: 'not-allowed',
    fontSize: 13,
};

const btnActive = {
    ...btnDisabled,
    background: '#0f766e',
    borderColor: '#0f766e',
    color: '#fff',
    cursor: 'pointer',
};

const notice = {
    marginBottom: 16,
    padding: '10px 14px',
    borderRadius: 10,
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#9a3412',
    fontSize: 13,
    lineHeight: 1.45,
};

const navWrap = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
};

const navLinkBase = {
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    border: '1px solid #e2e8f0',
    color: '#475569',
    background: '#fff',
};

const NAV = [
    { to: PATHS.SETTINGS.WHATSAPP_AI.DASHBOARD, label: 'Dashboard', any: [WHATSAPP_AI_PERMISSIONS.DASHBOARD_VIEW] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.INBOX, label: 'Inbox', any: [WHATSAPP_AI_PERMISSIONS.VIEW] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.ACTIVE, label: 'Active', any: [WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL, WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.WAITING_HUMAN, label: 'Waiting', any: [WHATSAPP_AI_PERMISSIONS.TAKEOVER] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.LEAD_DRAFTS, label: 'Lead Drafts', any: [WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_CREATE, WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_APPROVE] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.REPLY_DRAFTS, label: 'Reply Drafts', any: [WHATSAPP_AI_PERMISSIONS.DRAFTS_VIEW] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.KNOWLEDGE, label: 'Knowledge', any: [WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE, WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.DOCUMENTS, label: 'Documents', any: [WHATSAPP_AI_PERMISSIONS.DOCUMENTS_MANAGE, WHATSAPP_AI_PERMISSIONS.DOCUMENTS_SHARE] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.RULES, label: 'Rules', any: [WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.SETTINGS, label: 'Settings', any: [WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE] },
    { to: PATHS.SETTINGS.WHATSAPP_AI.AUDIT, label: 'Audit', any: [WHATSAPP_AI_PERMISSIONS.AUDIT_VIEW] },
];

/**
 * Shared empty professional shell for WhatsApp AI Phase 1A pages.
 */
export default function WhatsAppAiPageShell({
    title,
    subtitle,
    filters = ['Search', 'Status', 'Date range'],
    actions = [],
    emptyTitle = 'Nothing here yet',
    emptyMessage = 'This WhatsApp AI foundation page is ready. Live WhatsApp and AI processing are not connected in Phase 1A.',
    showNav = true,
    children,
}) {
    const { hasPermission, user } = useAuth();
    const role = String(user?.roleName || user?.role?.name || '').toLowerCase();
    const isSuper = role === 'superadmin';

    const visibleNav = NAV.filter((n) => isSuper || n.any.some((p) => hasPermission(p)));

    return (
        <div style={page} data-whatsapp-ai-shell="1">
            <WhatsAppHomeBackLink />
            <div style={{ marginBottom: 12 }}>
                <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>{title}</h1>
                {subtitle ? (
                    <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14, maxWidth: 720 }}>{subtitle}</p>
                ) : null}
            </div>

            <div style={notice} role="status">{FOUNDATION_NOTICE}</div>

            {showNav && visibleNav.length > 0 ? (
                <nav style={navWrap} aria-label="WhatsApp AI sections">
                    {visibleNav.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === PATHS.SETTINGS.WHATSAPP_AI.DASHBOARD}
                            style={({ isActive }) => ({
                                ...navLinkBase,
                                background: isActive ? '#0f766e' : '#fff',
                                color: isActive ? '#fff' : '#475569',
                                borderColor: isActive ? '#0f766e' : '#e2e8f0',
                            })}
                        >
                            {n.label}
                        </NavLink>
                    ))}
                </nav>
            ) : null}

            {(filters.length > 0 || actions.length > 0) ? (
                <div style={filterRow}>
                    {filters.map((f) => (
                        <input key={f} style={filterInput} placeholder={f} disabled aria-label={f} />
                    ))}
                    {actions.map((a) => {
                        const label = typeof a === 'string' ? a : a.label;
                        const enabled = typeof a === 'object' && a.enabled;
                        const onClick = typeof a === 'object' ? a.onClick : undefined;
                        return (
                            <button
                                key={label}
                                type="button"
                                style={enabled ? btnActive : btnDisabled}
                                disabled={!enabled}
                                onClick={enabled ? onClick : undefined}
                                title={enabled ? label : 'Disabled in Phase 1A or lacking permission'}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <div style={card}>
                {children || (
                    <div style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b' }}>
                        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.35 }}>◇</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#334155' }}>{emptyTitle}</h2>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: 520, marginInline: 'auto' }}>
                            {emptyMessage}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
