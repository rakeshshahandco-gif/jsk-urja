import React from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { formatActivityTime, liveMemberDetail } from './facebookLiveMemberStatus.util.js';

const DASH = '—';
const btn = (bg, color = '#fff') => ({
    padding: '6px 12px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
});

function val(v) {
    const s = v == null ? '' : String(v).trim();
    return s || DASH;
}

export default function FacebookLiveDiscoveryPanel({
    groupName = '',
    groupId = '',
    displayedMembers = '',
    uniqueDiscovered = 0,
    newThisRun = 0,
    alreadyKnown = 0,
    pendingReview = 0,
    reviewed = 0,
    relevant = 0,
    contactable = 0,
    phones = 0,
    whatsapp = 0,
    emails = 0,
    websites = 0,
    running = false,
    complete = false,
    activity = [],
    members = [],
    totalStored = 0,
    onViewAll,
    onExport,
}) {
    const latest = (members || []).filter((r) => r && !r.isRelatedGroup).slice(0, 50);
    return (
        <div style={{ border: '1px solid #93c5fd', background: '#f8fbff', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>LIVE MEMBER DISCOVERY</div>
            <div style={{ fontSize: 13 }}>
                Group: <strong>{val(groupName)}</strong>
            </div>
            <div style={{ fontSize: 13 }}>
                Group ID: <strong style={{ fontFamily: 'monospace' }}>{val(groupId)}</strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
                Facebook Displayed Members: <strong>{val(displayedMembers)}</strong>
                <span style={{ color: '#64748b', marginLeft: 6 }}>(Facebook’s count — not extracted)</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 12, marginBottom: 10 }}>
                <span>Unique Members Discovered: <strong>{uniqueDiscovered}</strong></span>
                <span>New This Run: <strong>{newThisRun}</strong></span>
                <span>Already Known: <strong>{alreadyKnown}</strong></span>
                <span>Pending Review: <strong>{pendingReview}</strong></span>
                <span>Reviewed: <strong>{reviewed}</strong></span>
                <span>Relevant: <strong>{relevant}</strong></span>
                <span>Contactable: <strong>{contactable}</strong></span>
                <span>Phone: <strong>{phones}</strong></span>
                <span>WhatsApp: <strong>{whatsapp}</strong></span>
                <span>Email: <strong>{emails}</strong></span>
                <span>Website: <strong>{websites}</strong></span>
            </div>
            {complete ? (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 8, marginBottom: 10, fontWeight: 700 }}>
                    FULL GROUP PROCESSING COMPLETE
                </div>
            ) : running ? (
                <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 8 }}>Current status: Collecting members…</div>
            ) : null}
            <div style={{ fontSize: 12, marginBottom: 6 }}>
                Discovered: <strong>{Number(totalStored) || 0}</strong>
                {' · '}Showing latest {latest.length} of 50 max
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: '#eff6ff' }}>
                            {['#', 'Member / Person', 'Facebook Profile', 'Visible Company / Headline', 'Status'].map((h) => (
                                <th key={h} style={{ padding: 6, borderBottom: '1px solid #bfdbfe' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {latest.length ? latest.map((r, i) => (
                            <tr key={r.rawCaptureId || r.facebookUrl || r.profileUrl || `${r.name}-${i}`}>
                                <td style={{ padding: 6 }}>{i + 1}</td>
                                <td style={{ padding: 6, fontWeight: 600 }}>{val(r.name)}</td>
                                <td style={{ padding: 6 }}>
                                    {(r.facebookUrl && r.facebookUrl !== DASH) || r.profileUrl
                                        ? <a href={r.facebookUrl && r.facebookUrl !== DASH ? r.facebookUrl : r.profileUrl} target="_blank" rel="noreferrer">Open</a>
                                        : DASH}
                                </td>
                                <td style={{ padding: 6 }}>{val(r.company !== DASH ? r.company : r.snippet)}</td>
                                <td style={{ padding: 6 }}>{liveMemberDetail(r)}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} style={{ padding: 8, color: '#64748b' }}>
                                    Members appear here only after they are actually saved. Facebook’s displayed total is not used.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button type="button" style={btn('#1d4ed8')} onClick={onViewAll}>View All Group Members</button>
                <Link
                    to={`${PATHS.DATA_EXTRACTOR.CONTACTABLE_PROSPECTS}?source=facebook_group_member&parentGroupId=${encodeURIComponent(groupId || '')}`}
                    style={btn('#0f766e')}
                >
                    View Group Contactable Prospects
                </Link>
                {typeof onExport === 'function' ? (
                    <button type="button" style={btn('#fff', '#334155')} onClick={onExport}>Export</button>
                ) : null}
            </div>
            {activity.length ? (
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Activity</div>
                    <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, color: '#334155' }}>
                        {activity.slice(-20).reverse().map((a, i) => (
                            <div key={`${a.t || i}-${a.text}`}>
                                {formatActivityTime(a.t)} — {a.text}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
