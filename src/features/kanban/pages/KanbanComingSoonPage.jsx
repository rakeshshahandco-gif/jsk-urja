import React from 'react';
import { Link } from 'react-router-dom';

const wrapStyle = {
    padding: 48,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 200px)',
    textAlign: 'center',
};

const iconStyle = {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: '#e0e7ff',
    color: '#1e3a8a',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 16,
};

const titleStyle = { fontSize: 22, color: '#0f172a', margin: 0 };
const subStyle = { color: '#64748b', maxWidth: 480, marginTop: 8, lineHeight: 1.45, fontSize: 14 };
const linkStyle = {
    marginTop: 20,
    display: 'inline-block',
    padding: '8px 14px',
    background: '#1e3a8a',
    color: 'white',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 13,
};

export default function KanbanComingSoonPage({ title = 'Kanban Board', moduleLink = '/', moduleLinkLabel = 'Open Module List' }) {
    const initial = String(title).trim().charAt(0).toUpperCase() || 'K';
    return (
        <div style={wrapStyle}>
            <div style={iconStyle}>{initial}</div>
            <h2 style={titleStyle}>{title}</h2>
            <p style={subStyle}>
                This Kanban board is enabled for your company, but the visual board UI is
                coming in a future release. Your existing workflow and data continue to work
                unchanged in the module&apos;s list view.
            </p>
            {moduleLink ? (
                <Link to={moduleLink} style={linkStyle}>{moduleLinkLabel}</Link>
            ) : null}
        </div>
    );
}
