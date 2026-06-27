import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import DataExtractorUserGuide from './DataExtractorUserGuide';

const card = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 20,
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
};

export default function DataExtractorHomePage() {
    const [providerStatus, setProviderStatus] = useState(null);

    useEffect(() => {
        dataExtractorApi.getSettings()
            .then((s) => setProviderStatus(s?.providerStatus || null))
            .catch(() => {});
    }, []);

    return (
        <div style={{ padding: 24, maxWidth: 900 }}>
            <h1 style={{ marginTop: 0, fontSize: 22 }}>Data Extractor / Market Finder</h1>
            <p style={{ color: '#64748b', marginBottom: 16 }}>
                Discover B2B companies by keyword and location. Preview first — approve before converting to Lead, Customer, or Supplier.
            </p>

            <DataExtractorUserGuide variant="compact" providerStatus={providerStatus} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                <Link to={PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH} style={{ ...card, borderColor: '#bfdbfe', background: '#eff6ff' }}>
                    <strong>Keyword Search</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
                        Main flow — keyword + city + source (Google, Maps, portals).
                    </p>
                </Link>
                <Link to={PATHS.DATA_EXTRACTOR.MANUAL_URL} style={card}>
                    <strong>Manual URL Extract</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Paste company website URLs — public data only.</p>
                </Link>
                <Link to={PATHS.DATA_EXTRACTOR.IMPORT} style={card}>
                    <strong>Excel / CSV Import</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Import LetsExtract or other tool exports.</p>
                </Link>
                <Link to={PATHS.DATA_EXTRACTOR.HISTORY} style={card}>
                    <strong>Search History</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Re-run past searches or apply AI to previews.</p>
                </Link>
                <Link to={PATHS.DATA_EXTRACTOR.LEADS} style={card}>
                    <strong>Extracted Leads</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Approve, reject, export, convert saved drafts.</p>
                </Link>
                <Link to={PATHS.DATA_EXTRACTOR.SETTINGS} style={card}>
                    <strong>Settings &amp; API Setup</strong>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Enable module, API keys guide, test connections.</p>
                </Link>
            </div>
        </div>
    );
}
