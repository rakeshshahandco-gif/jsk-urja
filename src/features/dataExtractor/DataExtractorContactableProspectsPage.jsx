import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { HISTORY_CLEARED_EVENT } from './clearHistoryUi.util';

const SOURCE_OPTIONS = [
    { id: '', label: 'All' },
    { id: 'public_discovery', label: 'Public Discovery' },
    { id: 'facebook_group_member', label: 'Facebook Group Member' },
    { id: 'facebook_page', label: 'Facebook Page' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'web', label: 'Google/Web' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X' },
    { id: 'indiamart', label: 'IndiaMART' },
    { id: 'justdial', label: 'Justdial' },
];

const field = { padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 };
const btn = (bg = '#2563eb', color = '#fff') => ({
    padding: '6px 10px', borderRadius: 8, border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    background: bg, color, fontWeight: 600, cursor: 'pointer', fontSize: 12,
});

const STATUSES = [
    'Not Contacted', 'Ready to Contact', 'Contacted', 'WhatsApp Sent', 'Email Sent', 'Called',
    'Facebook Profile Opened', 'Instagram Profile Opened', 'Follow-up Required', 'Interested',
    'Not Interested', 'No Response', 'Invalid Contact', 'Do Not Contact', 'Converted to Lead',
];

function tick(ok) {
    return ok ? '✓' : '—';
}

export default function DataExtractorContactableProspectsPage() {
    const [searchParams] = useSearchParams();
    const [filters, setFilters] = useState({
        q: '', city: '',
        source: searchParams.get('source') || '',
        parentGroupId: searchParams.get('parentGroupId') || '',
        hasPhone: '', hasWhatsApp: '', hasEmail: '',
        facebookOnly: '', instagramOnly: '', highlyRelevant: '', notContacted: '',
        followUp: '', interested: '', newOnly: '', priority: '', hideDiscovery: 'true', page: 1,
    });
    const [data, setData] = useState({ results: [], total: 0, page: 1, limit: 20, summary: {} });
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [compose, setCompose] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page: filters.page, limit: 20, hideDiscovery: filters.hideDiscovery };
            Object.entries(filters).forEach(([k, v]) => {
                if (k !== 'page' && k !== 'hideDiscovery' && v) params[k] = v;
            });
            setData(await dataExtractorApi.listContactableProspects(params));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load prospects');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const source = searchParams.get('source') || '';
        const parentGroupId = searchParams.get('parentGroupId') || '';
        if (source || parentGroupId) {
            setFilters((f) => ({ ...f, source: source || f.source, parentGroupId: parentGroupId || f.parentGroupId, page: 1 }));
        }
    }, [searchParams]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onCleared = () => { load(); };
        window.addEventListener(HISTORY_CLEARED_EVENT, onCleared);
        return () => window.removeEventListener(HISTORY_CLEARED_EVENT, onCleared);
    }, [load]);
    const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

    const mark = async (row, status, channel, note = '') => {
        try {
            await dataExtractorApi.recordProspectOutreach(row.id, { status, channel, note });
            toast.success(status);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not record outreach');
        }
    };

    const openCompose = async (row, channel) => {
        try {
            const preview = await dataExtractorApi.previewProspectOutreach(row.id);
            setCompose({
                row,
                channel,
                message: preview.message,
                productNote: '',
                to: channel === 'email' ? row.email : (channel === 'whatsapp' ? row.whatsapp : row.phone),
            });
        } catch {
            setCompose({
                row,
                channel,
                message: `Hello ${row.contactPersonName || row.companyName || 'there'},\nThis is JSK URJA. We manufacture DALI / lighting automation products.`,
                productNote: '',
                to: row.whatsapp || row.phone || row.email,
            });
        }
    };

    const confirmCompose = async () => {
        if (!compose) return;
        const { row, channel, message, productNote } = compose;
        const body = productNote ? `${message}\n\n${productNote}` : message;
        if (channel === 'whatsapp' && row.whatsapp) {
            window.open(`https://wa.me/91${row.whatsapp}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
            await mark(row, 'WhatsApp Sent', 'whatsapp', 'Opened WhatsApp with preview. Not auto-sent.');
        } else if (channel === 'email' && row.email) {
            window.location.href = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent('JSK URJA product details')}&body=${encodeURIComponent(body)}`;
            await mark(row, 'Email Sent', 'email', 'Opened email draft. Not auto-sent.');
        } else if (channel === 'call' && row.phone) {
            window.location.href = `tel:${row.phone}`;
            await mark(row, 'Called', 'phone');
        }
        setCompose(null);
    };

    const convert = async (row) => {
        if (!window.confirm(`Convert ${row.companyName} to a CRM Lead? This is manual and will not auto-send anything.`)) return;
        try {
            const preview = await dataExtractorApi.previewOpsBulkConvert([row.id]);
            if (!preview.ready) {
                toast.error(preview.items?.[0]?.status || 'Not ready to convert');
                return;
            }
            await dataExtractorApi.confirmOpsBulkConvert({ ids: [row.id], confirm: true });
            await mark(row, 'Converted to Lead', 'crm', 'Manual convert');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Convert failed');
        }
    };

    const pages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || 20)));
    const s = data.summary || {};

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Contactable Prospects</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
                Daily outreach queue. Facebook groups stay in discovery unless they have a usable contact route.
                WhatsApp and Email open a preview — nothing is sent automatically. Convert to Lead stays manual.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 12 }}>
                <span>Listed <strong>{data.total || 0}</strong></span>
                <span>Facebook Group Members {s.facebookGroupMembers || 0}</span>
                <span>Phone {s.hasPhone || 0}</span>
                <span>WhatsApp {s.hasWhatsApp || 0}</span>
                <span>Email {s.hasEmail || 0}</span>
                <span>Website {s.hasWebsite || 0}</span>
                <span>Facebook {s.hasFacebook || 0}</span>
                <span>Instagram {s.hasInstagram || 0}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <input placeholder="Company / person" value={filters.q} onChange={setF('q')} style={field} />
                <input placeholder="City" value={filters.city} onChange={setF('city')} style={field} />
                <select value={filters.source} onChange={setF('source')} style={field}>
                    {SOURCE_OPTIONS.map((o) => <option key={o.id || 'all'} value={o.id}>{o.label}</option>)}
                </select>
                {filters.source === 'facebook_group_member' ? (
                    <select value={filters.parentGroupId} onChange={setF('parentGroupId')} style={field}>
                        <option value="">Parent Facebook Group</option>
                        {filters.parentGroupId && !(data.parentGroups || []).some((g) => g.id === filters.parentGroupId) ? (
                            <option value={filters.parentGroupId}>
                                Selected group ({filters.parentGroupId})
                            </option>
                        ) : null}
                        {(data.parentGroups || []).map((g) => (
                            <option key={g.id || g.name} value={g.id}>{g.name || g.id}{g.id ? ` (${g.id})` : ''}</option>
                        ))}
                    </select>
                ) : null}
                <select value={filters.priority} onChange={setF('priority')} style={field}>
                    <option value="">Priority</option>
                    {['A', 'B', 'C', 'D'].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={filters.hasPhone} onChange={setF('hasPhone')} style={field}>
                    <option value="">Phone</option>
                    <option value="true">Has phone</option>
                </select>
                <select value={filters.hasWhatsApp} onChange={setF('hasWhatsApp')} style={field}>
                    <option value="">WhatsApp</option>
                    <option value="true">Has WhatsApp</option>
                </select>
                <select value={filters.hasEmail} onChange={setF('hasEmail')} style={field}>
                    <option value="">Email</option>
                    <option value="true">Has email</option>
                </select>
                <select value={filters.highlyRelevant} onChange={setF('highlyRelevant')} style={field}>
                    <option value="">Relevance</option>
                    <option value="true">Highly Relevant</option>
                </select>
                <select value={filters.notContacted} onChange={setF('notContacted')} style={field}>
                    <option value="">Status</option>
                    <option value="true">Not Contacted</option>
                </select>
                <select value={filters.followUp} onChange={setF('followUp')} style={field}>
                    <option value="">Follow-up</option>
                    <option value="true">Follow-up due</option>
                </select>
                <select value={filters.interested} onChange={setF('interested')} style={field}>
                    <option value="">Interest</option>
                    <option value="true">Interested</option>
                </select>
                <select value={filters.facebookOnly} onChange={setF('facebookOnly')} style={field}>
                    <option value="">Facebook</option>
                    <option value="true">Facebook only</option>
                </select>
                <select value={filters.instagramOnly} onChange={setF('instagramOnly')} style={field}>
                    <option value="">Instagram</option>
                    <option value="true">Instagram only</option>
                </select>
                <select value={filters.newOnly} onChange={setF('newOnly')} style={field}>
                    <option value="">New</option>
                    <option value="true">New / not contacted</option>
                </select>
                <select value={filters.hideDiscovery} onChange={setF('hideDiscovery')} style={field}>
                    <option value="true">Hide group discovery</option>
                    <option value="false">Include discovery sources</option>
                </select>
            </div>
            {loading ? <p>Loading…</p> : null}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                            {['Source', 'Parent Group', 'Company', 'Person / Member', 'Role', 'Rel.', 'Contactability', 'Phone', 'WA', 'Email', 'Web', 'FB', 'IG', 'Review', 'Best', 'Status', ''].map((h) => (
                                <th key={h} style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(data.results || []).map((r) => (
                            <tr key={r.id} style={{ background: r.doNotContact ? '#f8fafc' : '#fff' }}>
                                <td style={{ padding: 6 }}>{r.sourceLabel || r.sourceKind || '—'}</td>
                                <td style={{ padding: 6 }}>
                                    {r.parentGroup || '—'}
                                    {r.parentGroupId ? <div style={{ color: '#64748b', fontFamily: 'monospace' }}>{r.parentGroupId}</div> : null}
                                </td>
                                <td style={{ padding: 6 }}>
                                    <div style={{ fontWeight: 600 }}>{r.companyName || '—'}</div>
                                    <div style={{ color: '#64748b' }}>{[r.city, r.priority ? `Priority ${r.priority}` : ''].filter(Boolean).join(' · ')}</div>
                                </td>
                                <td style={{ padding: 6 }}>{r.contactPersonName || '—'}</td>
                                <td style={{ padding: 6 }}>{r.designation || '—'}</td>
                                <td style={{ padding: 6 }}>{r.relevanceScore == null ? (r.qualification || '—') : r.relevanceScore}</td>
                                <td style={{ padding: 6 }}><strong>{r.contactability}</strong>/100</td>
                                <td style={{ padding: 6 }}>{r.phone || tick(r.hasPhone)}</td>
                                <td style={{ padding: 6 }}>{r.whatsapp || tick(r.hasWhatsApp)}</td>
                                <td style={{ padding: 6 }}>{r.email || tick(r.hasEmail)}</td>
                                <td style={{ padding: 6 }}>{r.website ? <a href={r.website} target="_blank" rel="noreferrer">Web</a> : tick(r.hasWebsite)}</td>
                                <td style={{ padding: 6 }}>{(r.facebookProfileUrl || r.facebook) ? <a href={r.facebookProfileUrl || r.facebook} target="_blank" rel="noreferrer">Profile</a> : tick(r.hasFacebook)}</td>
                                <td style={{ padding: 6 }}>{r.instagram ? <a href={r.instagram} target="_blank" rel="noreferrer">IG</a> : tick(r.hasInstagram)}</td>
                                <td style={{ padding: 6 }}>{r.reviewStatus || '—'}</td>
                                <td style={{ padding: 6 }}>{r.bestChannel}</td>
                                <td style={{ padding: 6 }}>{r.outreachStatus}</td>
                                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                                    {!r.doNotContact && r.hasPhone ? <button type="button" style={btn('#0f766e')} onClick={() => openCompose(r, 'call')}>Call</button> : null}
                                    {' '}
                                    {!r.doNotContact && r.hasWhatsApp ? <button type="button" style={btn('#16a34a')} onClick={() => openCompose(r, 'whatsapp')}>WhatsApp</button> : null}
                                    {' '}
                                    {!r.doNotContact && r.hasEmail ? <button type="button" style={btn('#1d4ed8')} onClick={() => openCompose(r, 'email')}>Email</button> : null}
                                    {' '}
                                    {!r.doNotContact && r.facebook ? (
                                        <button type="button" style={btn('#fff', '#334155')} onClick={() => { window.open(r.facebook, '_blank', 'noopener,noreferrer'); mark(r, 'Facebook Profile Opened', 'facebook'); }}>Facebook</button>
                                    ) : null}
                                    {' '}
                                    {!r.doNotContact && r.instagram ? (
                                        <button type="button" style={btn('#fff', '#334155')} onClick={() => { window.open(r.instagram, '_blank', 'noopener,noreferrer'); mark(r, 'Instagram Profile Opened', 'instagram'); }}>Instagram</button>
                                    ) : null}
                                    {' '}
                                    {!r.doNotContact && r.linkedin ? (
                                        <button type="button" style={btn('#fff', '#334155')} onClick={() => { window.open(r.linkedin, '_blank', 'noopener,noreferrer'); mark(r, 'Contacted', 'linkedin', 'Opened LinkedIn for manual outreach'); }}>LinkedIn</button>
                                    ) : null}
                                    {' '}
                                    <button type="button" style={btn('#fff', '#334155')} onClick={() => setDetail(r)}>View Full Data</button>
                                    {' '}
                                    {!r.doNotContact && r.crmStatus !== 'Converted to Lead' ? <button type="button" style={btn('#7c3aed')} onClick={() => convert(r)}>Convert to Lead</button> : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" disabled={filters.page <= 1} style={btn('#fff', '#334155')} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Prev</button>
                <span style={{ fontSize: 12, alignSelf: 'center' }}>{filters.page} / {pages}</span>
                <button type="button" disabled={filters.page >= pages} style={btn('#fff', '#334155')} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
            </div>

            {detail ? (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)' }} onClick={() => setDetail(null)}>
                    <div style={{ width: 440, marginLeft: 'auto', height: '100%', background: '#fff', padding: 16, overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <h3>View Full Data</h3>
                        <p><strong>{detail.companyName}</strong></p>
                        <p>Source: {detail.sourceLabel || detail.sourceKind || '—'}</p>
                        <p>Parent Group: {detail.parentGroup || '—'} {detail.parentGroupId ? `(${detail.parentGroupId})` : ''}</p>
                        <p>Person / Member: {detail.contactPersonName || '—'} {detail.designation}</p>
                        <p>Facebook profile: {detail.facebookProfileUrl || detail.facebook || '—'}</p>
                        <p>Review: {detail.reviewStatus || '—'}</p>
                        <p>Relevance: {detail.relevanceScore ?? '—'} · {detail.qualification || '—'}</p>
                        <p>Contactability: {detail.contactability}/100 · Best: {detail.bestChannel}</p>
                        <p>Phone: {detail.phone || '—'}</p>
                        <p>WhatsApp: {detail.whatsapp || '—'}</p>
                        <p>Email: {detail.email || '—'}</p>
                        <p>Website: {detail.website || '—'}</p>
                        <p>Facebook: {detail.facebook || '—'}</p>
                        <p>Instagram: {detail.instagram || '—'}</p>
                        <p>LinkedIn: {detail.linkedin || '—'}</p>
                        <p>X: {detail.x || '—'}</p>
                        <p>Sources: {(detail.sources || []).join(', ') || '—'}</p>
                        <p>CRM: {detail.crmStatus} · Verification: {detail.verification}</p>
                        {(detail.evidence || []).map((e) => (
                            <div key={e.url} style={{ fontSize: 12, marginBottom: 6 }}>
                                <div style={{ color: '#64748b' }}>{e.source} · {e.title}</div>
                                {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.url}</a> : null}
                            </div>
                        ))}
                        <label style={{ fontSize: 12 }}>Outreach status</label>
                        <select value={detail.outreachStatus} onChange={(e) => mark(detail, e.target.value, 'manual')} style={{ ...field, display: 'block', margin: '6px 0 12px' }}>
                            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                        {!detail.doNotContact ? (
                            <button type="button" style={btn('#b91c1c')} onClick={() => dataExtractorApi.recordProspectOutreach(detail.id, { doNotContact: true, status: 'Do Not Contact', channel: 'policy' }).then(() => { setDetail(null); load(); })}>Do Not Contact</button>
                        ) : (
                            <button type="button" style={btn('#0f766e')} onClick={() => dataExtractorApi.recordProspectOutreach(detail.id, { status: 'Not Contacted', clearDoNotContact: true }).then(load)}>Allow contact</button>
                        )}
                        {detail.hasFacebook ? (
                            <div style={{ marginTop: 8 }}>
                                <button type="button" style={btn('#fff', '#334155')} onClick={() => mark(detail, 'Facebook Profile Opened', 'facebook', 'Mark Friend Request Sent')}>Mark Friend Request Sent</button>
                            </div>
                        ) : null}
                        {detail.hasInstagram ? (
                            <div style={{ marginTop: 8 }}>
                                <button type="button" style={btn('#fff', '#334155')} onClick={() => mark(detail, 'Instagram Profile Opened', 'instagram', 'Mark Instagram Contacted')}>Mark Instagram Contacted</button>
                            </div>
                        ) : null}
                        <p style={{ fontSize: 12, color: '#64748b' }}>Missing fields stay empty. Social profiles are opened for manual outreach only.</p>
                        <button type="button" style={btn('#334155')} onClick={() => setDetail(null)}>Close</button>
                    </div>
                </div>
            ) : null}

            {compose ? (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCompose(null)}>
                    <div style={{ width: 480, background: '#fff', borderRadius: 12, padding: 16 }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0 }}>Share / contact preview</h3>
                        <p style={{ fontSize: 13 }}>{compose.row.companyName} · {compose.channel}</p>
                        <p style={{ fontSize: 12, color: '#64748b' }}>To: {compose.to || '—'}</p>
                        <textarea value={compose.message} onChange={(e) => setCompose((c) => ({ ...c, message: e.target.value }))} rows={7} style={{ width: '100%', ...field }} />
                        <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Share product (optional catalogue / PDF / link)</label>
                        <input value={compose.productNote} onChange={(e) => setCompose((c) => ({ ...c, productNote: e.target.value }))} placeholder="Paste approved product link or note" style={{ width: '100%', ...field, marginTop: 4 }} />
                        <p style={{ fontSize: 12, color: '#9a3412' }}>Nothing is sent until you confirm. WhatsApp/Email open the existing channel for you to send.</p>
                        <button type="button" style={btn('#16a34a')} onClick={confirmCompose}>Confirm and open</button>
                        {' '}
                        <button type="button" style={btn('#fff', '#334155')} onClick={() => setCompose(null)}>Cancel</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
