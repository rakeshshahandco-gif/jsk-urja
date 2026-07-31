import React from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

/**
 * Owner-facing fallback when a WhatsApp module is enabled in the sidebar
 * but cannot load (feature temporarily off, API error, etc.).
 * Does not hide the menu — keeps Retry / View Status / Contact Admin.
 */
export default function WhatsAppModuleUnavailable({
    moduleName = 'WhatsApp',
    statusPath = PATHS.SETTINGS.WHATSAPP,
    onRetry,
}) {
    const handleRetry = () => {
        if (typeof onRetry === 'function') onRetry();
        else window.location.reload();
    };

    return (
        <div style={{
            maxWidth: 520,
            margin: '48px auto',
            padding: 28,
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            background: '#fff',
            color: '#0f172a',
            fontFamily: 'system-ui, sans-serif',
        }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 650 }}>
                {moduleName} is temporarily unavailable.
            </h2>
            <p style={{ margin: '0 0 20px', color: '#64748b', lineHeight: 1.5 }}>
                The menu item remains available. You can retry, check connection status,
                or contact your administrator. No WhatsApp session was logged out.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                    type="button"
                    onClick={handleRetry}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #0f172a',
                        background: '#0f172a',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Retry
                </button>
                <Link
                    to={statusPath}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#0f172a',
                        textDecoration: 'none',
                    }}
                >
                    View Status
                </Link>
                <Link
                    to={PATHS.SETTINGS.HOME || '/admin'}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#0f172a',
                        textDecoration: 'none',
                    }}
                >
                    Contact Administrator
                </Link>
            </div>
        </div>
    );
}
