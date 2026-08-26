import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import { Link } from 'react-router-dom';
import { HISTORY_CLEARED_EVENT } from './clearHistoryUi.util';

const DASH = '—';
const PAGE_SIZES = [20, 50, 100];
const btn = (bg, color = '#fff') => ({
    padding: '6px 12px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
});

function val(v) {
    const s = v == null ? '' : String(v).trim();
    return s || DASH;
}

function downloadBlob(res, fallbackName) {
    const blob = res?.data instanceof Blob ? res.data : new Blob([res.data || res]);
    const cd = res?.headers?.['content-disposition'] || '';
    const named = /filename="?([^"]+)"?/i.exec(cd);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = named?.[1] || fallbackName;
    a.click();
    URL.revokeObjectURL(url);
}

export default function FacebookCommunityResults({ keyword, location, groupUrl = '', reloadToken, analytics, onAnalyzeGroup }) {
    const parentGroupId = (String(groupUrl || '').match(/groups\/(\d+)/) || [])[1] || '';
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [data, setData] = useState({ results: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [exporting, setExporting] = useState('');

    useEffect(() => { setPage(1); }, [reloadToken, keyword, location, groupUrl, filter, search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await dataExtractorApi.listFacebookCaptures({
                keyword: groupUrl ? undefined : (keyword || undefined),
                location: groupUrl ? undefined : (location || undefined),
                groupUrl: groupUrl || undefined,
                page,
                limit,
                q: search || undefined,
                memberFilter: filter !== 'all' ? filter : undefined,
            });
            setData(res);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load Facebook captures');
        } finally {
            setLoading(false);
        }
    }, [keyword, location, groupUrl, page, limit, reloadToken, search, filter]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onCleared = () => { load(); };
        window.addEventListener(HISTORY_CLEARED_EVENT, onCleared);
        return () => window.removeEventListener(HISTORY_CLEARED_EVENT, onCleared);
    }, [load]);

    const onExport = async (format, scope = '') => {
        setExporting(`${format}${scope}`);
        try {
            const res = await dataExtractorApi.exportFacebookCaptures({
                keyword: groupUrl ? undefined : (keyword || undefined),
                location: groupUrl ? undefined : (location || undefined),
                groupUrl: groupUrl || undefined,
                format,
                scope: scope || undefined,
            });
            downloadBlob(res, `facebook-${scope || 'members'}.${format === 'csv' ? 'csv' : 'xlsx'}`);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Export failed');
        } finally {
            setExporting('');
        }
    };

    const allRows = (data.results || []).map((r) => r.facebookCommunity || {});
    const relatedRows = allRows.filter((r) => r.isRelatedGroup || /related_group/i.test(r.discoveryType || ''));
    const memberRows = allRows.filter((r) => !r.isRelatedGroup && !/related_group/i.test(r.discoveryType || ''));
    const rows = memberRows;
    const pg = data.pagination || {};
    const a = analytics || {};
    const rs = data.reviewStats;
    const reviewedCount = rs ? rs.reviewed : a.accessibleProfilesReviewed;
    const relevantCount = rs ? rs.relevant : a.relevant;
    const possiblyCount = rs ? rs.possibly : a.possiblyRelevant;
    const notRelevantCount = rs ? rs.notRelevant : a.notRelevant;
    const relatedFromRun = Array.isArray(a.relatedGroups) ? a.relatedGroups : [];
    const relatedShown = relatedRows.length ? relatedRows : relatedFromRun.map((g) => ({
        name: g.groupName,
        profileUrl: g.groupUrl,
        relatedGroupPrivacy: g.privacy,
        relatedGroupMembers: g.members,
        isRelatedGroup: true,
    }));

    const waHref = (r) => {
        const digits = String(r.whatsapp !== DASH ? r.whatsapp : r.phone || '').replace(/\D/g, '');
        return digits.length >= 10 ? `https://wa.me/${digits}` : '';
    };
    const mailHref = (r) => (r.email && r.email !== DASH ? `mailto:${r.email}` : '');

    return (
        <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>View All Group Members</h3>
            <p style={{ fontSize: 12, color: '#64748b' }}>
                This table is the individual member list from the selected Facebook group (name + profile URL).
                It is not Contactable Prospects. Use{' '}
                <Link to={`${PATHS.DATA_EXTRACTOR.CONTACTABLE_PROSPECTS}?source=facebook_group_member${parentGroupId ? `&parentGroupId=${encodeURIComponent(parentGroupId)}` : ''}`}>Contactable Prospects</Link>
                {' '}only for reviewed members that have a usable contact route.
            </p>
            {a.kind === 'group' || a.groupTitle || a.displayedMemberCount ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, background: '#fff' }}>
                    <div><strong>Group:</strong> {val(a.groupTitle)}</div>
                    <div>Displayed group members: <strong>{val(a.displayedMemberCount)}</strong> (not the extracted count)</div>
                    <div>Public group: <strong>{a.isPublicGroup ? 'yes' : 'no'}</strong></div>
                    <div>People tab: <strong>{val(a.peopleTabStatus || (a.peopleTabOpened ? 'active' : (a.peopleTabAvailable ? 'available' : 'not detected')))}</strong></div>
                    <div>Accessible People-tab profiles loaded: <strong>{val(a.accessiblePeopleTabProfilesLoaded)}</strong></div>
                    <div>People first load / after scrolling: {val(a.peopleTabFirstLoadCount)} / {val(a.peopleTabAfterScrollCount)}</div>
                    <div>Accessible posts/activity reviewed: <strong>{val(a.accessiblePostsReviewed)}</strong></div>
                    <div>Profiles pending review: <strong>{rs ? val(rs.pending) : DASH}</strong></div>
                    <div>Profiles reviewed: <strong>{val(reviewedCount)}</strong></div>
                    <div>Relevant businesses/professionals: <strong>{val(relevantCount)}</strong></div>
                    <div>Possibly Relevant: <strong>{val(possiblyCount)}</strong></div>
                    <div>Personal/unrelated: <strong>{val(notRelevantCount)}</strong></div>
                    <div>Private/unavailable: <strong>{val(a.privateUnavailable)}</strong></div>
                    <div>Already known: <strong>{val(a.alreadyKnown)}</strong></div>
                    <div>New unique companies: <strong>{val(a.newUniqueCompanies)}</strong></div>
                    <div>Websites / emails / phones: {val(a.websites)} / {val(a.emails)} / {val(a.phones)}</div>
                    <div>Instagram links found: <strong>{val(a.instagrams)}</strong></div>
                    <div>Related groups found: <strong>{val(a.relatedGroupsFound ?? relatedShown.length)}</strong></div>
                    <div>Members fully enumerated: <strong>no</strong></div>
                </div>
            ) : null}
            {a.kind === 'page' || a.parentPage || a.displayedFollowerCount || a.followerListNote ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, background: '#fff' }}>
                    <div><strong>Parent page:</strong> {val(a.parentPage)}</div>
                    <div>Displayed followers: <strong>{val(a.displayedFollowerCount)}</strong> (not the extracted count)</div>
                    <div>{val(a.followerListNote)}</div>
                    <div>Follower list accessible: <strong>{a.followerListAccessible ? 'yes' : 'no'}</strong></div>
                    <div>Related pages accessible: <strong>{a.relatedPagesAccessible ? 'yes' : 'no'}</strong></div>
                    <div>Public engagement accessible: <strong>{a.engagementAccessible ? 'yes' : 'no'}</strong></div>
                    <div>Accessible profiles/activity reviewed: <strong>{val(a.accessibleProfilesReviewed)}</strong></div>
                    <div>Relevant businesses/professionals: <strong>{val(a.relevant)}</strong></div>
                    <div>Websites / emails / phones: {val(a.websites)} / {val(a.emails)} / {val(a.phones)}</div>
                    <div>New company identities: <strong>{val(a.newUniqueCompanies)}</strong></div>
                </div>
            ) : null}

            {relatedShown.length ? (
                <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Related Facebook groups</h4>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        These are groups Facebook showed next to your selected group. They are sources. Click Analyze Group to collect that group’s members.
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                                    {['Group', 'Public/Private', 'Members', 'URL', 'Action'].map((h) => (
                                        <th key={h} style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {relatedShown.map((g) => (
                                    <tr key={g.profileUrl || g.rawCaptureId || g.name}>
                                        <td style={{ padding: 6, fontWeight: 600 }}>{val(g.name)}</td>
                                        <td style={{ padding: 6 }}>{val(g.relatedGroupPrivacy)}</td>
                                        <td style={{ padding: 6 }}>{val(g.relatedGroupMembers)}</td>
                                        <td style={{ padding: 6 }}>{g.profileUrl ? <a href={g.profileUrl} target="_blank" rel="noreferrer">Open</a> : DASH}</td>
                                        <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                                            {typeof onAnalyzeGroup === 'function' && g.profileUrl ? (
                                                <button type="button" style={btn('#0f766e')} onClick={() => onAnalyzeGroup({ groupUrl: g.profileUrl, groupName: g.name })}>
                                                    Analyze Members
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, company, Facebook URL, phone, email"
                    style={{ minWidth: 260, padding: 6, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12 }}
                />
                {[['all', 'All'], ['discovered', 'Discovered'], ['pending_review', 'Pending Review'], ['reviewed', 'Reviewed'], ['relevant', 'Relevant'], ['not_relevant', 'Not Relevant'], ['contactable', 'Contactable'], ['phone', 'Has Phone'], ['whatsapp', 'Has WhatsApp'], ['email', 'Has Email'], ['website', 'Has Website']].map(([id, label]) => (
                    <button key={id} type="button" style={btn(filter === id ? '#1d4ed8' : '#fff', filter === id ? '#fff' : '#334155')} onClick={() => setFilter(id)}>{label}</button>
                ))}
                <button type="button" style={btn('#0f766e')} disabled={!!exporting} onClick={() => onExport('xlsx')}>{exporting === 'xlsx' ? 'Exporting…' : 'Excel — all discovered'}</button>
                <button type="button" style={btn('#fff', '#334155')} disabled={!!exporting} onClick={() => onExport('csv')}>{exporting === 'csv' ? 'Exporting…' : 'CSV — all discovered'}</button>
                <button type="button" style={btn('#fff', '#334155')} disabled={!!exporting} onClick={() => onExport('xlsx', 'contactable')}>{exporting === 'xlsxcontactable' ? 'Exporting…' : 'Excel — contactable'}</button>
            </div>
            {loading ? <p style={{ fontSize: 13 }}>Loading…</p> : null}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                            {['Member', 'Facebook', 'Parent Group', 'Group ID', 'Company', 'Role', 'Business?', 'Website', 'Phone', 'WhatsApp', 'Email', 'Relevant', 'Review Status', ''].map((h) => (
                                <th key={h} style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const fbHref = (r.facebookUrl && r.facebookUrl !== DASH) ? r.facebookUrl : (r.profileUrl || '');
                            return (
                            <tr key={r.rawCaptureId}>
                                <td style={{ padding: 6 }}>{val(r.name)}</td>
                                <td style={{ padding: 6 }}>{fbHref ? <a href={fbHref} target="_blank" rel="noreferrer">Open Facebook</a> : DASH}</td>
                                <td style={{ padding: 6 }}>{val(r.parentGroup)}</td>
                                <td style={{ padding: 6, fontFamily: 'monospace' }}>{val(r.parentGroupId)}</td>
                                <td style={{ padding: 6 }}>{val(r.company)}</td>
                                <td style={{ padding: 6 }}>{val(r.role)}</td>
                                <td style={{ padding: 6 }}>{val(r.businessProfessional)}</td>
                                <td style={{ padding: 6 }}>{r.website && r.website !== DASH ? <a href={r.website} target="_blank" rel="noreferrer">{r.website}</a> : DASH}</td>
                                <td style={{ padding: 6 }}>{val(r.phone)}</td>
                                <td style={{ padding: 6 }}>{val(r.whatsapp)}</td>
                                <td style={{ padding: 6 }}>{mailHref(r) ? <a href={mailHref(r)}>{r.email}</a> : DASH}</td>
                                <td style={{ padding: 6 }}>{val(r.relevantLabel || (/not_reviewed/i.test(r.reviewStatus) ? 'Pending' : ''))}</td>
                                <td style={{ padding: 6 }}>{val(r.reviewStatus)}</td>
                                <td style={{ padding: 6 }}><button type="button" style={btn('#1d4ed8')} onClick={() => setDetail(r)}>View Full Data</button></td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>{pg.total || 0} stored</span>
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}/page</option>)}
                </select>
                <button type="button" disabled={page <= 1} style={btn('#fff', '#334155')} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <button type="button" disabled={(pg.page || page) >= (pg.totalPages || 1)} style={btn('#fff', '#334155')} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
            {detail ? (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={() => setDetail(null)}>
                    <div style={{ width: 420, background: '#fff', height: '100%', padding: 16, overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <h3>View Full Data</h3>
                        <div style={{ marginBottom: 12, padding: 8, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                            <div><strong>Member:</strong> {val(detail.name)}</div>
                            <div><strong>Facebook profile:</strong> {(detail.facebookUrl && detail.facebookUrl !== DASH) || detail.profileUrl
                                ? <a href={detail.facebookUrl && detail.facebookUrl !== DASH ? detail.facebookUrl : detail.profileUrl} target="_blank" rel="noreferrer">{detail.facebookUrl && detail.facebookUrl !== DASH ? detail.facebookUrl : detail.profileUrl}</a>
                                : DASH}</div>
                            <div><strong>Parent Group:</strong> {val(detail.parentGroup)}</div>
                            <div><strong>Parent Group ID:</strong> {val(detail.parentGroupId)}</div>
                            <div><strong>Relevant:</strong> {val(detail.relevantLabel)}</div>
                            <div><strong>Review Status:</strong> {val(detail.reviewStatus)}</div>
                        </div>
                        {Object.entries(detail).map(([k, v]) => (
                            <div key={k} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{k}</div>
                                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : val(v)}</div>
                            </div>
                        ))}
                        <p style={{ fontSize: 12, color: '#64748b' }}>Open Facebook to Add Friend yourself. Missing fields are —. Nothing is invented. Leads are not auto-created.</p>
                        <button type="button" style={btn('#334155')} onClick={() => setDetail(null)}>Close</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
