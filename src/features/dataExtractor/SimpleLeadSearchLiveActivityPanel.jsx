import React, { useMemo, useState } from 'react';
import styles from './DataExtractorSimpleLeadSearchPage.module.css';

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'processing', label: 'Processing' },
    { id: 'verified', label: 'Verified' },
    { id: 'review', label: 'Review' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'failed', label: 'Failed' },
];

function stageClass(stage) {
    if (stage === 'VERIFIED') return styles.liveStageVerified;
    if (stage === 'REVIEW_REQUIRED') return styles.liveStageReview;
    if (stage === 'REJECTED' || stage === 'DIRECTORY') return styles.liveStageRejected;
    if (stage === 'FAILED') return styles.liveStageFailed;
    if (stage === 'VERIFYING' || stage === 'QUALIFYING' || stage === 'ENRICHING') return styles.liveStageActive;
    return styles.liveStageNeutral;
}

function stageMark(stage) {
    if (stage === 'VERIFIED') return '✅';
    if (stage === 'REVIEW_REQUIRED') return '⚠️';
    if (stage === 'REJECTED') return '❌';
    if (stage === 'DIRECTORY') return '🗂️';
    if (stage === 'FAILED') return '❗';
    if (stage === 'DUPLICATE') return '🔁';
    return '';
}

function fmtTime(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return '';
    }
}

export default function SimpleLeadSearchLiveActivityPanel({
    activity,
    filter,
    onFilterChange,
    displayLimit,
    onDisplayLimitChange,
    loading,
}) {
    const [journeyRow, setJourneyRow] = useState(null);
    const items = activity?.items || [];
    const headline = activity?.headline || '';
    const captureTotal = Number(activity?.campaignCaptureCount || 0);

    const rows = useMemo(() => items, [items]);

    return (
        <section className={styles.liveActivityCard} aria-live="polite">
            <div className={styles.liveTitleRow}>
                <h3 className={styles.liveTitle}>Live Processing Activity</h3>
                {loading ? <span className={styles.liveActivityHint}>Updating…</span> : null}
            </div>
            {headline ? (
                <p className={styles.liveHeadline}>{headline}</p>
            ) : (
                <p className={styles.liveActivityHint}>Waiting for capture or processing activity.</p>
            )}
            <div className={styles.liveActivityToolbar}>
                <div className={styles.liveFilterRow} role="tablist" aria-label="Live activity filters">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            role="tab"
                            aria-selected={filter === f.id}
                            className={`${styles.liveFilterBtn} ${filter === f.id ? styles.liveFilterBtnOn : ''}`}
                            onClick={() => onFilterChange?.(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <label className={styles.liveLimitLabel}>
                    Latest
                    <select
                        className={styles.liveLimitSelect}
                        value={Number(displayLimit) || 50}
                        onChange={(e) => onDisplayLimitChange?.(Number(e.target.value) || 50)}
                    >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </label>
            </div>
            <p className={styles.liveActivityHint}>
                Showing {rows.length} of latest {activity?.displayLimit || displayLimit} source records.
                Campaign captures remain {captureTotal || '—'}. This window does not limit extraction.
            </p>
            <div className={styles.liveActivityTableWrap}>
                <table className={styles.liveActivityTable}>
                    <thead>
                        <tr>
                            <th>Company</th>
                            <th>Source</th>
                            <th>Current Stage</th>
                            <th>Status / Result</th>
                            <th>Contact</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length ? rows.map((r) => (
                            <tr key={r.captureId}>
                                <td>
                                    <div className={styles.liveCompany}>{r.companyName}</div>
                                    {r.canonicalDomain ? <div className={styles.liveDomain}>{r.canonicalDomain}</div> : null}
                                    {r.duplicateSource ? (
                                        <div className={styles.liveDup}>
                                            {r.consolidatedInto
                                                ? `Consolidated into: ${r.consolidatedInto}`
                                                : 'Duplicate source'}
                                        </div>
                                    ) : null}
                                </td>
                                <td>{r.source || '—'}</td>
                                <td>
                                    <span className={`${styles.liveStage} ${stageClass(r.stage)}`}>
                                        {stageMark(r.stage)} {r.stageLabel}
                                    </span>
                                </td>
                                <td>{r.result || '—'}</td>
                                <td className={styles.liveContact}>{r.contact || '—'}</td>
                                <td>
                                    <button
                                        type="button"
                                        className={styles.liveJourneyBtn}
                                        onClick={() => setJourneyRow(r)}
                                    >
                                        View Journey
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className={styles.liveActivityHint}>No records in this filter yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {journeyRow ? (
                <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Record journey">
                    <div className={styles.modal}>
                        <h3>Journey — {journeyRow.companyName}</h3>
                        <p className={styles.liveActivityHint} style={{ marginTop: 0 }}>
                            {journeyRow.source} · {journeyRow.canonicalDomain || journeyRow.sourceUrl || ''}
                        </p>
                        <ol className={styles.liveJourneyList}>
                            {(journeyRow.journey || []).map((step, i) => (
                                <li key={`${step.stage}-${i}`}>
                                    <span className={styles.liveJourneyTime}>{fmtTime(step.at)}</span>
                                    <strong>{String(step.stage || '').replace(/_/g, ' ')}</strong>
                                    <div>{step.label}</div>
                                </li>
                            ))}
                        </ol>
                        {journeyRow.businessType || journeyRow.locationLabel ? (
                            <p className={styles.liveActivityHint}>
                                {journeyRow.businessType ? `Business type: ${journeyRow.businessType}` : ''}
                                {journeyRow.locationLabel ? ` · Location: ${journeyRow.locationLabel}` : ''}
                                {journeyRow.productMatchStrength ? ` · Product: ${journeyRow.productMatchStrength}` : ''}
                            </p>
                        ) : null}
                        <button type="button" className={styles.ctrlBtn} onClick={() => setJourneyRow(null)}>
                            Close
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
