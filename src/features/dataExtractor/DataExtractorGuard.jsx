import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

/**
 * Blocks UI when Data Extractor is not allocated for the selected company.
 * Master switch: Super Admin → Company Module Allocation (data_extractor).
 * ExtractorSettings.moduleEnabled is synced from allocation by the backend.
 */
export default function DataExtractorGuard({ children }) {
    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const settings = await dataExtractorApi.getSettings();
                if (!cancelled) {
                    setEnabled(!!settings?.moduleEnabled);
                    setError('');
                }
            } catch (e) {
                if (!cancelled) {
                    setEnabled(false);
                    setError(e?.response?.data?.message || 'Unable to load extractor settings');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading Data Extractor…</div>;
    }

    if (!enabled) {
        return (
            <div style={{ padding: 32, maxWidth: 560 }}>
                <h2 style={{ marginTop: 0 }}>Data Extractor not enabled</h2>
                <p style={{ color: '#64748b', lineHeight: 1.6 }}>
                    Data Extractor / Market Finder is not allocated for this company.
                    A Platform Admin can enable it in
                    {' '}
                    <Link to={PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION}>
                        Company Module Allocation
                    </Link>
                    .
                    Advanced connector options remain in
                    {' '}
                    <Link to={PATHS.DATA_EXTRACTOR.SETTINGS}>Extractor Settings</Link>
                    {' '}
                    and do not replace the company allocation switch.
                </p>
                {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
            </div>
        );
    }

    return children;
}
