import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import DataExtractorClearHistoryModal, { useCanClearExtractorHistory } from './DataExtractorClearHistoryModal';

const tabs = [
    { to: PATHS.DATA_EXTRACTOR.QUICK_SEARCH, label: 'Quick Search' },
    { to: PATHS.DATA_EXTRACTOR.OPERATIONS, label: 'Operations' },
    { to: PATHS.DATA_EXTRACTOR.DISCOVERY_JOBS, label: 'Results' },
    { to: PATHS.DATA_EXTRACTOR.QUALIFIED_COMPANIES, label: 'Qualified Companies' },
    { to: PATHS.DATA_EXTRACTOR.CONSOLIDATED_COMPANIES, label: 'Consolidated Companies' },
    { to: PATHS.DATA_EXTRACTOR.CONTACTABLE_PROSPECTS, label: 'Contactable Prospects' },
    { to: PATHS.DATA_EXTRACTOR.DUPLICATE_REVIEW, label: 'Duplicate Review' },
    { to: PATHS.DATA_EXTRACTOR.SAVED_SEARCHES, label: 'Saved Searches' },
    { to: PATHS.DATA_EXTRACTOR.HISTORY, label: 'History' },
    { to: PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH, label: 'Simple Lead Search' },
    { to: PATHS.DATA_EXTRACTOR.FACEBOOK, label: 'Facebook' },
    { to: PATHS.DATA_EXTRACTOR.INSTAGRAM, label: 'Instagram' },
    { to: PATHS.DATA_EXTRACTOR.LINKEDIN, label: 'LinkedIn' },
    { to: PATHS.DATA_EXTRACTOR.X, label: 'X / Twitter' },
    { to: PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH, label: 'Keyword Search' },
    { to: PATHS.DATA_EXTRACTOR.MANUAL_URL, label: 'Manual URL' },
    { to: PATHS.DATA_EXTRACTOR.IMPORT, label: 'Excel Import' },
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
    const canClear = useCanClearExtractorHistory();
    const [clearOpen, setClearOpen] = useState(false);
    return (
        <div style={{ padding: '16px 24px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Data Extractor / Market Finder</h1>
                    <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
                        Search by keyword and location, or use manual URL / Excel import.
                    </p>
                </div>
                {canClear ? (
                    <button
                        type="button"
                        onClick={() => setClearOpen(true)}
                        style={{ padding: '8px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                    >
                        Clear History
                    </button>
                ) : null}
            </div>
            <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 20, flexWrap: 'wrap' }}>
                {tabs.map((tab) => (
                    <NavLink key={tab.to} to={tab.to} style={tabStyle}>
                        {tab.label}
                    </NavLink>
                ))}
            </nav>
            <Outlet />
            <DataExtractorClearHistoryModal
                open={clearOpen}
                onClose={() => setClearOpen(false)}
                defaultScope="facebook_current"
            />
        </div>
    );
}
