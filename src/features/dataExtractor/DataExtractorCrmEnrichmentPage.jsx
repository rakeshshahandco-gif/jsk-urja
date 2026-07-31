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
function badge(text, bg = '#e2e8f0') {
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, fontSize: 11, marginRight: 6 };
}

export default function DataExtractorCrmEnrichmentPage() {
    const { hasPermission } = useAuth();
    const vis = useMemo(() => ({
        canView: can(hasPermission, 'data_extractor.crm_enrichment.view'),
        canMatch: can(hasPermission, 'data_extractor.crm_enrichment.match'),
        canPrepare: can(hasPermission, 'data_extractor.crm_enrichment.prepare'),
        canReview: can(hasPermission, 'data_extractor.crm_enrichment.review'),
        canCreateLead: can(hasPermission, 'data_extractor.crm_enrichment.create_lead') && can(hasPermission, 'crm.leads.add'),
        canApply: can(hasPermission, 'data_extractor.crm_enrichment.apply'),
        canRollback: can(hasPermission, 'data_extractor.crm_enrichment.rollback'),
        canLock: can(hasPermission, 'data_extractor.crm_enrichment.lock'),
        canHistory: can(hasPermission, 'data_extractor.crm_enrichment.history'),
        canExport: can(hasPermission, 'data_extractor.crm_enrichment.export'),
        canBatch: can(hasPermission, 'data_extractor.crm_enrichment.batch'),
    }), [hasPermission]);

    const [items, setItems] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [history, setHistory] = useState(null);
    const [preview, setPreview] = useState(null);
    const [sample, setSample] = useState(null);
    const [busy, setBusy] = useState('');
    const [seedLeadId, setSeedLeadId] = useState('');
    const [filters, setFilters] = useState({ status: '', matchStatus: '', eligibilityStatus: '', locked: '' });

    const load = useCallback(async () => {
        if (!vis.canView) return;
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
            const data = await dataExtractorApi.listCrmEnrichmentDrafts(params);
            setItems(data?.results || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load drafts');
        }
    }, [filters, vis.canView]);

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

    const selected = items.find((x) => String(x._id) === String(selectedId));

    const setDecision = async (fieldKey, decision) => {
        if (!selected || !vis.canReview) return;
        await runAction('Save decision', () => dataExtractorApi.reviewCrmEnrichmentFields(selected._id, {
            decisions: { [fieldKey]: decision },
        }));
    };

    return (
        <div style={{ padding: 16, maxWidth: 1200 }}>
            <h2 style={{ marginTop: 0 }}>CRM Enrichment & Lead Draft</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Safe bridge to CRM. Draft-first, duplicate-safe, field-level approval required.
                Does not auto-create Customers/Suppliers/Tasks or send email/WhatsApp.
                Creating a Lead also requires CRM Lead create permission.
            </p>

            {!vis.canView && <div style={card}>View permission required.</div>}
            {vis.canView && (
                <>
                    <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <select style={field} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                            <option value="">All statuses</option>
                            <option value="FIELD_REVIEW_REQUIRED">FIELD_REVIEW_REQUIRED</option>
                            <option value="READY_FOR_APPROVAL">READY_FOR_APPROVAL</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="CONVERTED_TO_LEAD">CONVERTED_TO_LEAD</option>
                            <option value="ENRICHED_EXISTING_RECORD">ENRICHED_EXISTING_RECORD</option>
                            <option value="REJECTED">REJECTED</option>
                        </select>
                        <select style={field} value={filters.matchStatus} onChange={(e) => setFilters({ ...filters, matchStatus: e.target.value })}>
                            <option value="">All matches</option>
                            <option value="EXACT_MATCH">EXACT_MATCH</option>
                            <option value="STRONG_MATCH">STRONG_MATCH</option>
                            <option value="NO_MATCH">NO_MATCH</option>
                            <option value="MULTIPLE_MATCHES">MULTIPLE_MATCHES</option>
                            <option value="MANUAL_REVIEW_REQUIRED">MANUAL_REVIEW_REQUIRED</option>
                        </select>
                        <button type="button" style={btn} onClick={load} disabled={!!busy}>Refresh</button>
                        {vis.canMatch && (
                            <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                                setBusy('sample');
                                try {
                                    const data = await dataExtractorApi.matchCrmEnrichmentSample({
                                        source: { companyName: 'Sample OEM', website: 'https://sample-oem.test', email: 'purchase@sample-oem.test', phone: '9876543210', city: 'Pune' },
                                        recommendation: { manuallyApproved: true, status: 'APPROVED' },
                                        crmCandidates: [
                                            { entityType: 'LEAD', _id: '1', customerName: 'Sample OEM', customerEmail: 'purchase@sample-oem.test', website: 'https://sample-oem.test' },
                                        ],
                                    });
                                    setSample(data);
                                    toast.success('Sample match run');
                                } catch (e) {
                                    toast.error(e?.response?.data?.message || 'Sample failed');
                                } finally { setBusy(''); }
                            }}>Run match sample</button>
                        )}
                        {vis.canExport && (
                            <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Export', async () => {
                                await dataExtractorApi.exportCrmEnrichment({ format: 'json' });
                            })}>Export</button>
                        )}
                    </div>

                    <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input style={{ ...field, minWidth: 280 }} placeholder="Approved extractedLeadId" value={seedLeadId} onChange={(e) => setSeedLeadId(e.target.value)} />
                        {vis.canPrepare && (
                            <button type="button" style={btnPrimary} disabled={!seedLeadId || !!busy} onClick={() => runAction('Prepare draft', async () => {
                                await dataExtractorApi.prepareCrmEnrichment({ extractedLeadId: seedLeadId });
                            })}>Prepare CRM match / draft</button>
                        )}
                    </div>

                    {sample && (
                        <div style={card}>
                            <strong>Sample eligibility:</strong> {sample.eligibility?.eligibilityStatus}
                            <div style={{ marginTop: 6 }}>
                                <span style={badge(sample.match?.matchStatus || 'NO_MATCH')} />
                                <span style={badge(`score ${sample.match?.matchScore || 0}`)} />
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: 12 }}>
                        <div>
                            {items.map((row) => (
                                <div key={row._id} style={{ ...card, cursor: 'pointer', outline: String(selectedId) === String(row._id) ? '2px solid #1d4ed8' : 'none' }} onClick={() => { setSelectedId(row._id); setPreview(null); }}>
                                    <div style={{ fontWeight: 600 }}>{row.companyName || '—'}</div>
                                    <div style={{ marginTop: 6 }}>
                                        <span style={badge(row.eligibilityStatus, '#e0f2fe')} />
                                        <span style={badge(row.matchStatus)} />
                                        <span style={badge(row.draftActionType, '#fef3c7')} />
                                        <span style={badge(row.status)} />
                                        {row.locked ? <span style={badge('LOCKED', '#fecaca')} /> : null}
                                    </div>
                                </div>
                            ))}
                            {!items.length && <div style={card}>No enrichment drafts yet.</div>}
                        </div>

                        <div>
                            {selected ? (
                                <div style={card}>
                                    <h3 style={{ marginTop: 0 }}>{selected.companyName}</h3>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                                        Match: {selected.matchStatus} ({selected.matchScore}) · Target: {selected.matchedCrmEntityType || 'NONE'}
                                        {selected.convertedCrmLeadId ? ' · Lead created' : ''}
                                    </div>
                                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                                        <strong>Eligibility reasons</strong>
                                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                            {(selected.eligibilityReasons || []).map((r) => <li key={r}>{r}</li>)}
                                        </ul>
                                    </div>

                                    <div style={{ fontSize: 12, marginBottom: 10 }}>
                                        <strong>Field comparison</strong>
                                        {(selected.fieldComparisons || []).slice(0, 12).map((f) => (
                                            <div key={f.fieldKey} style={{ borderTop: '1px solid #f1f5f9', padding: '6px 0' }}>
                                                <div>
                                                    <span style={badge(f.fieldKey)} />
                                                    <span style={badge(f.changeType, f.changeType === 'CONFLICT' ? '#fee2e2' : '#e2e8f0')} />
                                                    <span style={badge(f.userDecision)} />
                                                </div>
                                                <div>CRM: {String(f.crmCurrentValue || '—')}</div>
                                                <div>Suggested: {String(f.suggestedValue || '—')}</div>
                                                {f.sourceUrl ? <div style={{ color: '#64748b' }}>Source: {f.sourceUrl}</div> : null}
                                                {vis.canReview && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                        {['KEEP_CRM', 'USE_EXTRACTED', 'ADD_ALTERNATE', 'REJECT_SUGGESTION'].map((d) => (
                                                            <button key={d} type="button" style={btn} disabled={!!busy} onClick={() => setDecision(f.fieldKey, d)}>{d}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {vis.canReview && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Preview', async () => {
                                            const data = await dataExtractorApi.previewCrmEnrichment(selected._id);
                                            setPreview(data.preview || data);
                                        })}>Preview</button>}
                                        {vis.canReview && <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Final approve', () => dataExtractorApi.finalApproveCrmEnrichment(selected._id))}>Final approve</button>}
                                        {vis.canCreateLead && selected.draftActionType === 'CREATE_LEAD_DRAFT' && (
                                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Create Lead', () => dataExtractorApi.createLeadFromCrmEnrichment(selected._id))}>Create CRM Lead</button>
                                        )}
                                        {vis.canApply && ['ENRICH_EXISTING_LEAD', 'ENRICH_EXISTING_CUSTOMER', 'ENRICH_EXISTING_SUPPLIER'].includes(selected.draftActionType) && (
                                            <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => runAction('Apply enrichment', () => dataExtractorApi.applyCrmEnrichment(selected._id))}>Apply enrichment</button>
                                        )}
                                        {vis.canReview && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Reject', () => dataExtractorApi.rejectCrmEnrichment(selected._id, { reason: 'Rejected in UI' }))}>Reject</button>}
                                        {vis.canLock && <button type="button" style={btn} disabled={!!busy} onClick={() => runAction(selected.locked ? 'Unlock' : 'Lock', () => dataExtractorApi.lockCrmEnrichment(selected._id, { action: selected.locked ? 'unlock' : 'lock' }))}>{selected.locked ? 'Unlock' : 'Lock'}</button>}
                                        {vis.canHistory && <button type="button" style={btn} disabled={!!busy} onClick={async () => { setBusy('history'); try { setHistory(await dataExtractorApi.getCrmEnrichmentHistory(selected._id)); } finally { setBusy(''); } }}>History</button>}
                                        {vis.canRollback && selected.enrichmentTransactionId && (
                                            <button type="button" style={btn} disabled={!!busy} onClick={() => runAction('Rollback', () => dataExtractorApi.rollbackCrmEnrichment(selected.enrichmentTransactionId))}>Request rollback</button>
                                        )}
                                    </div>

                                    {preview && (
                                        <div style={{ marginTop: 10, fontSize: 12 }}>
                                            <strong>Preview</strong>
                                            <pre style={{ fontSize: 11, maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(preview, null, 2)}</pre>
                                        </div>
                                    )}
                                    {history && String(history._id) === String(selected._id) && (
                                        <div style={{ marginTop: 10, fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                                            {(history.history || []).slice().reverse().map((h, i) => (
                                                <div key={i} style={{ borderTop: '1px solid #f1f5f9', padding: '4px 0' }}>
                                                    {h.action} · {h.reason || ''} · {h.at ? new Date(h.at).toLocaleString() : ''}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={card}>Select a draft to compare fields and approve conversion/enrichment.</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
