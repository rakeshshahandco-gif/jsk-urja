import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import styles from './DataExtractorSimpleLeadSearchPage.module.css';

function dash(v) {
    if (v == null || v === '') return '—';
    return String(v);
}

export default function SimpleLeadSearchCreateLeadModal({
    sessionId,
    row,
    onClose,
    onCreated,
    onOpenLead,
    onOpenCustomer,
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(null);
    const [assignedTo, setAssignedTo] = useState('');
    const [priority, setPriority] = useState('high');
    const [remarks, setRemarks] = useState('');
    const [followUpDate, setFollowUpDate] = useState('');
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!sessionId || !row?._id) return;
            setLoading(true);
            try {
                const data = await dataExtractorApi.simpleLeadSearchCrmLeadPreview(sessionId, row._id, {
                    genuinenessId: row.genuinenessId || undefined,
                    qualificationId: row.qualificationId || undefined,
                    enrichmentId: row.enrichmentId || undefined,
                });
                if (cancelled) return;
                setPreview(data);
                const users = data?.assignableUsers || [];
                if (users[0]?._id) setAssignedTo(String(users[0]._id));
            } catch (err) {
                toast.error(err?.response?.data?.message || err?.message || 'Preview failed');
                onClose?.();
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [sessionId, row?._id, row?.genuinenessId, row?.qualificationId, row?.enrichmentId, onClose]);

    const draft = preview?.draft || {};
    const crm = preview?.crmStatus || row?.crmStatusLabel || 'NOT IN CRM';
    const existingLead = preview?.existingLead;
    const existingCustomer = preview?.existingCustomer;

    const submit = async () => {
        if (!sessionId || !row?._id) return;
        setSaving(true);
        try {
            const data = await dataExtractorApi.simpleLeadSearchCreateCrmLead(sessionId, row._id, {
                assignedTo: assignedTo || undefined,
                priority,
                remarks,
                nextFollowUpDate: followUpDate || undefined,
                genuinenessId: row.genuinenessId || undefined,
                qualificationId: row.qualificationId || undefined,
                enrichmentId: row.enrichmentId || undefined,
            });
            setSuccess(data);
            toast.success('LEAD CREATED SUCCESSFULLY');
            onCreated?.(data);
        } catch (err) {
            const status = err?.response?.status;
            const payload = err?.response?.data?.data;
            if (status === 409) {
                toast.error(err?.response?.data?.message || 'Existing record — duplicate not created');
                if (payload) setPreview((p) => ({ ...p, ...payload, crmStatus: p?.crmStatus }));
            } else {
                toast.error(err?.response?.data?.message || err?.message || 'Create Lead failed');
            }
        } finally {
            setSaving(false);
        }
    };

    if (!row) return null;

    return (
        <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
            <div className={styles.leadModal} role="dialog" aria-label="Create Lead" onClick={(e) => e.stopPropagation()}>
                {success ? (
                    <>
                        <h3 className={styles.drawerTitle}>LEAD CREATED SUCCESSFULLY</h3>
                        <p>Company: <strong>{dash(success.lead?.customerName || draft.companyName)}</strong></p>
                        <p>Assigned To: <strong>{dash(success.lead?.assignedToName)}</strong></p>
                        <p>Priority: <strong>{dash(success.lead?.priorityLabel)}</strong></p>
                        <div className={styles.drawerActions}>
                            <button type="button" className={styles.primaryBtn} onClick={() => onOpenLead?.(success.lead)}>Open Lead</button>
                            <button type="button" className={styles.howBtn} onClick={onClose}>Continue Extraction</button>
                            <button type="button" className={styles.howBtn} onClick={onClose}>Close</button>
                        </div>
                    </>
                ) : loading ? (
                    <p>Loading lead preview…</p>
                ) : (
                    <>
                        <h3 className={styles.drawerTitle}>Create Lead</h3>
                        <p className={styles.capturedSub}>Lead Source: Data Extractor. Extraction continues in the background.</p>
                        {!row.flags?.isVerifiedRelevant && row.ownerReviewStatus !== 'approved' ? (
                            <div className={styles.dupBanner}>
                                <strong>This company is not confirmed as a relevant prospect.</strong>
                                <p>Genuine website/business is not the same as a verified relevant lead. You can still create a lead after review.</p>
                            </div>
                        ) : null}
                        <dl className={styles.drawerDl}>
                            <dt>Company Name</dt><dd>{dash(draft.companyName)}</dd>
                            <dt>Contact Person</dt><dd>{dash(draft.contactPerson)}</dd>
                            <dt>Mobile</dt><dd>{dash(draft.mobile)}</dd>
                            <dt>Email</dt><dd>{dash(draft.email)}</dd>
                            <dt>Website</dt><dd>{dash(draft.website)}</dd>
                            <dt>Address</dt><dd>{dash([draft.address, draft.city, draft.state].filter(Boolean).join(', '))}</dd>
                            <dt>Industry</dt><dd>{dash(draft.industry)}</dd>
                            <dt>Sub-Industry</dt><dd>{dash(draft.subIndustry)}</dd>
                            <dt>AI</dt><dd>{dash(draft.verificationStatus)} {draft.aiScore != null ? `· ${draft.aiScore}%` : ''}</dd>
                        </dl>

                        {crm === 'EXISTING CUSTOMER' && existingCustomer ? (
                            <div className={styles.dupBanner}>
                                <strong>Existing Customer</strong>
                                <p>{existingCustomer.customerName}</p>
                                <button type="button" className={styles.primaryBtn} onClick={() => onOpenCustomer?.(existingCustomer)}>Open Customer</button>
                            </div>
                        ) : crm === 'EXISTING LEAD' || crm === 'LEAD CREATED' ? (
                            <div className={styles.dupBanner}>
                                <strong>Existing Lead</strong>
                                <p>{existingLead?.customerName}</p>
                                <button type="button" className={styles.primaryBtn} onClick={() => onOpenLead?.(existingLead)}>Open Existing Lead</button>
                            </div>
                        ) : (
                            <>
                                {preview?.canAssign && (preview.assignableUsers || []).length > 0 ? (
                                    <label className={styles.fieldWrap}>
                                        <span className={styles.label}>Assign To</span>
                                        <select className={styles.select} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                                            {(preview.assignableUsers || []).map((u) => (
                                                <option key={u._id} value={u._id}>{u.name || u.email}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : null}
                                <label className={styles.fieldWrap}>
                                    <span className={styles.label}>Priority</span>
                                    <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
                                        <option value="high">Hot</option>
                                        <option value="medium">Warm</option>
                                        <option value="normal">Normal</option>
                                    </select>
                                </label>
                                <label className={styles.fieldWrap}>
                                    <span className={styles.label}>Remarks</span>
                                    <textarea className={styles.field} rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                                </label>
                                <label className={styles.fieldWrap}>
                                    <span className={styles.label}>Follow-up Date (optional)</span>
                                    <input className={styles.field} type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                                </label>
                                <div className={styles.drawerActions}>
                                    <button type="button" className={styles.primaryBtn} disabled={saving || preview?.canCreate === false} onClick={submit}>
                                        {saving ? 'Creating…' : 'Create Lead'}
                                    </button>
                                    <button type="button" className={styles.howBtn} onClick={onClose}>Cancel</button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
