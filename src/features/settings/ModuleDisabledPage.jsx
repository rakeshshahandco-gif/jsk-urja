import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdminUser } from '@/constants/platformAccess';

export default function ModuleDisabledPage() {
    const location = useLocation();
    const from = location.state?.from || '';
    const { user } = useAuth();
    const showAllocationLink = isPlatformAdminUser(user);

    return (
        <div style={{ padding: 40, maxWidth: 560, margin: '40px auto', fontFamily: 'Inter, sans-serif' }}>
            <h1 style={{ margin: '0 0 12px', fontSize: 22, color: '#0f172a' }}>Module not available</h1>
            <p style={{ color: '#64748b', lineHeight: 1.6 }}>
                This module is not enabled for your company.
                {showAllocationLink ? (
                    <>
                        {' '}Contact your Platform Admin or enable it in
                        {' '}
                        <Link to={PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION}>Company Module Allocation</Link>.
                    </>
                ) : (
                    ' Contact your company administrator.'
                )}
            </p>
            {from && (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>Blocked path: {from}</p>
            )}
            <Link
                to={PATHS.DASHBOARD}
                style={{ display: 'inline-block', marginTop: 20, color: '#2563eb', fontWeight: 600 }}
            >
                ← Back to Home
            </Link>
        </div>
    );
}
