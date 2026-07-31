import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

function vBadge(status) {
    const s = String(status || 'UNKNOWN');
    const bg = s.includes('VERIFIED') && !s.includes('UNVERIFIED') ? '#dcfce7'
        : s.includes('INFERRED') || s.includes('UNVERIFIED') ? '#fef3c7'
            : s === 'INVALID' ? '#fee2e2' : '#e2e8f0';
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, fontSize: 11, marginRight: 6 };
}

function ContactCard({ title, contact, emptyLabel }) {
    if (!contact) return <div style={card}><strong>{title}</strong><p style={{ color: '#94a3b8', fontSize: 12 }}>{emptyLabel || 'None'}</p></div>;
    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{title}</strong>
                <span>
                    <span style={vBadge(contact.verificationStatus)}>{contact.verificationStatus || 'UNKNOWN'}</span>
                    <span style={vBadge(contact.sourceType || 'public')}>{contact.sourceType || 'public'}</span>
                </span>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
                <div>{contact.contactName || '(unnamed)'} {contact.designation ? `— ${contact.designation}` : ''}</div>
                <div style={{ color: '#64748b' }}>{contact.contactRoleCategory || 'Unknown'} / {contact.department || '—'} / {contact.seniority || '—'}</div>
                <div>Email: {contact.email || '—'} {contact.emailCategory ? `(${contact.emailCategory})` : ''}</div>
                <div>Phone: {contact.phone || '—'} {contact.phoneCategory ? `(${contact.phoneCategory})` : ''}</div>
                <div>DM score: {contact.decisionMakerScore ?? '—'} | Quality: {contact.contactQualityScore ?? '—'}</div>
                <div style={{ color: '#475569' }}>{contact.whyRecommended || ''}</div>
                {contact.sourceUrl ? <div style={{ fontSize: 11, wordBreak: 'break-all' }}>Source: {contact.sourceUrl}</div> : null}
            </div>
        </div>
    );
}

export default function DataExtractorContactIntelligencePage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.contact_intelligence.view'),
        canRun: can(hasPermission, 'data_extractor.contact_intelligence.run'),
        canBatch: can(hasPermission, 'data_extractor.contact_intelligence.batch'),
        canOverride: can(hasPermission, 'data_extractor.contact_intelligence.override'),
        canVerify: can(hasPermission, 'data_extractor.contact_intelligence.verify'),
        canMerge: can(hasPermission, 'data_extractor.contact_intelligence.merge'),
        canLock: can(hasPermission, 'data_extractor.contact_intelligence.lock'),
        canHistory: can(hasPermission, 'data_extractor.contact_intelligence.history'),
        canExport: can(hasPermission, 'data_extractor.contact_intelligence.export'),
        canManage: can(hasPermission, 'data_extractor.contact_intelligence.manage'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [roles, setRoles] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState('');
    const [exportPreview, setExportPreview] = useState(null);
    const [filters, setFilters] = useState({
        status: '', parentIndustry: '', customerType: '', contactRole: '', verificationStatus: '',
        locked: '', emailAvailable: '', phoneAvailable: '', minDecisionScore: '',
    });
    const [sample, setSample] = useState({
        companyName: 'Sample OEM Co',
        website: 'https://example.test',
        emails: 'purchase@example.test, info@example.test',
        phones: '+91 9876543210',
        opportunityType: 'oem procurement',
        personName: 'Riya Shah',
        personTitle: 'Procurement Manager',
        personEmail: 'riya@example.test',
    });
    const [sampleResult, setSampleResult] = useState(null);

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listContactIntelligence(params);
            setItems(data?.results || []);
            if (vis.canManage || vis.canView) {
                const r = await dataExtractorApi.listContactRoles({});
                setRoles(r?.results || []);
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load contacts');
        }
    }, [filters, vis.canView, vis.canManage]);

    useEffect(() => { load(); }, [load]);

    const runAction = async (label, fn) => {
        setBusy(label);
        try {
            await fn();
            toast.success(label);
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || `${label} failed`);
        } finally {
            setBusy('');
        }
    };

    const runSample = async () => {
        if (!vis.canRun) return;
        setBusy('sample');
        try {
            const emails = String(sample.emails || '').split(',').map((x) => x.trim()).filter(Boolean);
            const phones = String(sample.phones || '').split(',').map((x) => x.trim()).filter(Boolean);
            const out = await dataExtractorApi.analyzeContactSample({
                opportunityType: sample.opportunityType,
                record: {
                    companyName: sample.companyName,
                    website: sample.website,
                    emails,
                    phones,
                    publicContacts: sample.personName ? [{
                        name: sample.personName,
                        designation: sample.personTitle,
                        email: sample.personEmail,
                        sourceUrl: `${sample.website}/team`,
                        sourceType: 'team_page',
                    }] : [],
                },
            });
            setSampleResult(out);
            toast.success('Sample analyzed');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Sample failed');
        } finally {
            setBusy('');
        }
    };

    if (!vis.canView) {
        return <p style={{ color: '#64748b' }}>You do not have permission to view contact intelligence.</p>;
    }

    const selected = items.find((x) => x._id === selectedId);

    return (
        <div style={{ maxWidth: 1100 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Contact Intelligence / Decision-Makers</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Identify and prioritize public business contacts for recommended opportunities. Public data only — no CRM auto-create or messaging.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {Object.entries(filters).map(([k, v]) => (
                    <input key={k} style={field} placeholder={k} value={v} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} />
                ))}
                <button type="button" style={btn} onClick={load} disabled={!!busy}>Refresh</button>
                {vis.canManage ? (
                    <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Roles seeded', () => dataExtractorApi.seedContactRoles())}>Seed roles</button>
                ) : null}
                {vis.canExport ? (
                    <button
                        type="button"
                        style={btn}
                        disabled={!!busy}
                        onClick={() => runAction('Export loaded', async () => {
                            const out = await dataExtractorApi.exportApprovedContacts({});
                            setExportPreview(out?.results || []);
                        })}
                    >
                        Export approved
                    </button>
                ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                <div>
                    <h3 style={{ fontSize: 14 }}>Contact Intelligence queue</h3>
                    {(items || []).length === 0 ? <p style={{ color: '#94a3b8' }}>No analyses yet.</p> : null}
                    {(items || []).map((row) => (
                        <div
                            key={row._id}
                            style={{ ...card, cursor: 'pointer', borderColor: selectedId === row._id ? '#2563eb' : '#e2e8f0' }}
                            onClick={() => setSelectedId(row._id)}
                            onKeyDown={() => {}}
                            role="button"
                            tabIndex={0}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong style={{ fontSize: 13 }}>{row.companyName || 'Untitled'}</strong>
                                <span style={{ fontSize: 11 }}>{row.status}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {row.primaryContact?.contactName || row.genericFallbackContact?.email || 'No primary'} · DM {row.decisionMakerScore ?? '—'}
                            </div>
                            <div style={{ marginTop: 4 }}>
                                <span style={vBadge(row.primaryContact?.verificationStatus)}>{row.primaryContact?.verificationStatus || '—'}</span>
                                {row.locked ? <span style={vBadge('LOCKED')}>LOCKED</span> : null}
                            </div>
                        </div>
                    ))}
                </div>

                <div>
                    <h3 style={{ fontSize: 14 }}>Company contact summary</h3>
                    {!selected ? <p style={{ color: '#94a3b8' }}>Select a company analysis.</p> : (
                        <>
                            <div style={card}>
                                <strong>{selected.companyName}</strong>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                    {selected.status} · {selected.parentIndustry || '—'} · {selected.customerType || '—'} · Opp: {selected.opportunityType || '—'}
                                </div>
                                <div style={{ fontSize: 12 }}>DM score: {selected.decisionMakerScore} · Quality: {selected.contactQualityScore} · Confidence: {selected.confidence}</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>{selected.whyRecommended}</div>
                                {(selected.warnings || []).length ? <div style={{ color: '#b45309', fontSize: 12 }}>{selected.warnings.join(' | ')}</div> : null}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {vis.canOverride ? (
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Accepted', () => dataExtractorApi.overrideContactIntelligence(selected._id, { action: 'accept', reason: 'UI accept' }))}>Accept</button>
                                    ) : null}
                                    {vis.canOverride ? (
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Marked invalid', () => dataExtractorApi.overrideContactIntelligence(selected._id, { action: 'mark_invalid', contactKey: selected.primaryContact?.contactKey, reason: 'UI invalid' }))}>Mark invalid</button>
                                    ) : null}
                                    {vis.canVerify && selected.primaryContact?.contactKey ? (
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Verified', () => dataExtractorApi.verifyContactIntelligence(selected._id, { action: 'mark_verified', contactKey: selected.primaryContact.contactKey }))}>Mark verified</button>
                                    ) : null}
                                    {vis.canLock ? (
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlocked' : 'Locked', () => dataExtractorApi.lockContactIntelligence(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button>
                                    ) : null}
                                    {vis.canRun ? (
                                        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Re-analyzed', () => dataExtractorApi.analyzeContacts({ adhocKey: selected.recordKey?.replace(/^adhoc:/, '') || selected._id, force: true, record: { companyName: selected.companyName, emails: selected.contacts?.map((c) => c.email).filter(Boolean), phones: selected.contacts?.map((c) => c.phone).filter(Boolean), publicContacts: selected.contacts?.filter((c) => c.contactName && !c.isGenericCompanyContact) }, opportunityType: selected.opportunityType }))}>Re-analyze</button>
                                    ) : null}
                                    {vis.canHistory ? (
                                        <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('History loaded', async () => { setHistory(await dataExtractorApi.getContactIntelligenceHistory(selected._id)); })}>History</button>
                                    ) : null}
                                </div>
                            </div>
                            <ContactCard title="Primary recommended contact" contact={selected.primaryContact} emptyLabel="No named primary — see generic fallback" />
                            {(selected.secondaryContacts || []).map((c, i) => (
                                <ContactCard key={c.contactKey || i} title={`Secondary #${i + 1}`} contact={c} />
                            ))}
                            <ContactCard title="Generic fallback contact" contact={selected.genericFallbackContact} />
                            <div style={card}>
                                <strong>Evidence / sources</strong>
                                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
                                    {(selected.contacts || []).flatMap((c) => (c.provenance || []).map((p, i) => (
                                        <li key={`${c.contactKey}-${i}`}>{p.field}: {p.value} · {p.sourceType} · {p.sourceUrl || '—'} · {p.verificationStatus}</li>
                                    )))}
                                </ul>
                            </div>
                            {history ? (
                                <div style={card}>
                                    <strong>Contact history</strong>
                                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(history.history || [], null, 2)}</pre>
                                </div>
                            ) : null}
                            <div style={card}>
                                <strong>Duplicate review</strong>
                                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
                                    {(selected.contacts || []).filter((c) => c.duplicateStatus && c.duplicateStatus !== 'UNIQUE').map((c) => (
                                        <li key={c.contactKey}>
                                            {c.contactName || c.email || c.phone}: {c.duplicateStatus}
                                            {vis.canMerge && c.duplicateOfKey ? (
                                                <button
                                                    type="button"
                                                    style={{ ...btn, marginLeft: 8 }}
                                                    onClick={() => runAction('Merged', () => dataExtractorApi.mergeContactIntelligence(selected._id, {
                                                        action: 'merge',
                                                        keepContactKey: c.duplicateOfKey,
                                                        dropContactKey: c.contactKey,
                                                        reason: 'UI merge',
                                                    }))}
                                                >
                                                    Merge into original
                                                </button>
                                            ) : null}
                                            {vis.canOverride ? (
                                                <button
                                                    type="button"
                                                    style={{ ...btn, marginLeft: 8 }}
                                                    onClick={() => runAction('Kept separate', () => dataExtractorApi.overrideContactIntelligence(selected._id, {
                                                        action: 'keep_separate',
                                                        contactKey: c.contactKey,
                                                        otherContactKey: c.duplicateOfKey,
                                                    }))}
                                                >
                                                    Keep separate
                                                </button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    )}

                    <div style={{ ...card, marginTop: 16 }}>
                        <strong>Sample analyze (permission: run)</strong>
                        {!vis.canRun ? <p style={{ fontSize: 12, color: '#94a3b8' }}>Run permission required.</p> : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                    {Object.entries(sample).map(([k, v]) => (
                                        <input key={k} style={field} placeholder={k} value={v} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))} />
                                    ))}
                                </div>
                                <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={!!busy} onClick={runSample}>Analyze sample</button>
                                {sampleResult ? <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{JSON.stringify(sampleResult, null, 2)}</pre> : null}
                            </>
                        )}
                    </div>

                    {vis.canManage ? (
                        <div style={card}>
                            <strong>Contact Role Master ({roles.length})</strong>
                            <ul style={{ fontSize: 12, maxHeight: 160, overflow: 'auto' }}>
                                {roles.map((r) => (
                                    <li key={r._id || r.roleName}>{r.roleName} · {r.roleGroup} · DM {r.decisionMakerWeight}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {exportPreview ? (
                        <div style={card}>
                            <strong>Export preview ({exportPreview.length})</strong>
                            <pre style={{ fontSize: 11, maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(exportPreview.slice(0, 20), null, 2)}</pre>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
