import { useEffect, useState } from 'react';
import { env } from '@/config/env';

/**
 * Persistent STAGING indicator. Hidden in print/PDF (@media print).
 * Shown only when APP_ENV/VITE_APP_ENV is staging — never on production.
 */
export function StagingEnvBadge() {
    const viteStaging =
        String(
            (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ENV) || ''
        )
            .trim()
            .toLowerCase() === 'staging';

    const [isStaging, setIsStaging] = useState(viteStaging);

    useEffect(() => {
        if (viteStaging) return undefined;
        let cancelled = false;
        const url = `${String(env.API_URL || '').replace(/\/$/, '')}/health`;
        fetch(url)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                if (String(data.appEnv || '').trim().toLowerCase() === 'staging') {
                    setIsStaging(true);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [viteStaging]);

    if (!isStaging) return null;

    return (
        <>
            <style>{`
                @media print {
                    .jsk-staging-env-badge { display: none !important; }
                }
            `}</style>
            <div
                className="jsk-staging-env-badge"
                role="status"
                aria-label="Staging environment"
                data-jsk-ui-component="staging-env-badge"
                style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '4px 12px',
                    background: '#b45309',
                    color: '#fffbeb',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid #92400e',
                    zIndex: 90,
                    userSelect: 'none',
                }}
            >
                JSK E-SARTHI — STAGING
            </div>
        </>
    );
}

export default StagingEnvBadge;
