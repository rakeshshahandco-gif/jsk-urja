import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const tabs = [
    { to: PATHS.DATA_EXTRACTOR.OPERATIONS, label: 'Operations' },
    { to: PATHS.DATA_EXTRACTOR.CONSOLIDATED_COMPANIES, label: 'Consolidated Companies' },
    { to: PATHS.DATA_EXTRACTOR.SAVED_SEARCHES, label: 'Saved Searches' },
    { to: PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH, label: 'Simple Lead Search' },
    { to: PATHS.DATA_EXTRACTOR.FACEBOOK, label: 'Facebook' },
    { to: PATHS.DATA_EXTRACTOR.INSTAGRAM, label: 'Instagram' },
    { to: PATHS.DATA_EXTRACTOR.LINKEDIN, label: 'LinkedIn' },
    { to: PATHS.DATA_EXTRACTOR.X, label: 'X / Twitter' },
    { to: PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH, label: 'Keyword Search' },
    { to: PATHS.DATA_EXTRACTOR.MANUAL_URL, label: 'Manual URL' },
    { to: PATHS.DATA_EXTRACTOR.IMPORT, label: 'Excel Import' },
    { to: PATHS.DATA_EXTRACTOR.HISTORY, label: 'Search History' },
    { to: PATHS.DATA_EXTRACTOR.LEADS, label: 'Extracted Leads' },
    { to: PATHS.DATA_EXTRACTOR.SETTINGS, label: 'Settings' },
];

const tabStyle = ({ isActive }) => ({
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#2563eb' : '#475569',
    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
    textDecoration: 'none',
});

export default function DataExtractorLayout() {
    return (
        <div style={{ padding: '16px 24px 24px' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Data Extractor / Market Finder</h1>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
                Search by keyword and location, or use manual URL / Excel import.
            </p>
            <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 20, flexWrap: 'wrap' }}>
                {tabs.map((tab) => (
                    <NavLink key={tab.to} to={tab.to} style={tabStyle}>
                        {tab.label}
                    </NavLink>
                ))}
            </nav>
            <Outlet />
        </div>
    );
}
