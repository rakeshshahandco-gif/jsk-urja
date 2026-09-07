import React from 'react';
import styles from './DataExtractorSimpleLeadSearchPage.module.css';

const AI_TIP = 'AI verification is based on matching public-source evidence and does not constitute legal certification.';

function dash(v) {
    if (v == null || v === '') return '—';
    return String(v);
}

function safeHttpUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return u.href;
    } catch {
        return '';
    }
}

function ExtLink({ href, children }) {
    const safe = safeHttpUrl(href);
    if (!safe) return <span>{dash('')}</span>;
    return (
        <a href={safe} target="_blank" rel="noopener noreferrer" className={styles.extLink} onClick={(e) => e.stopPropagation()}>
            {children || safe}
        </a>
    );
}

export default function SimpleLeadSearchCompanyDrawer({
    row,
    onClose,
    onCreateLead,
    onOpenLead,
    onOpenCustomer,
    onMarkReviewed,
    processRunning = false,
}) {
    if (!row) return null;
    const crm = row.crmStatusLabel || 'NOT IN CRM';
    const evidence = row.verificationEvidence || [];
    const sources = [
        row.website,
        row.sourceUrl,
        ...(row.detail?.sourceEvidence || []).map((e) => e.sourceUrl),
        ...(row.detail?.pagesVisited || []),
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 12);

    return (
        <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
            <aside className={styles.companyDrawer} role="dialog" aria-label="View Company" onClick={(e) => e.stopPropagation()}>
                <header className={styles.drawerHead}>
                    <div>
                        <h3 className={styles.drawerTitle}>{dash(row.companyName || row.title)}</h3>
                        <p className={styles.capturedSub}>
                            Genuineness: {dash(row.aiStatus || 'PENDING')}
                            {row.industryMatchLabel ? ` · Industry Match: ${row.industryMatchLabel}` : ''}
                            {row.businessType ? ` · ${String(row.businessType).replace(/_/g, ' ').toUpperCase()}` : ''}
                        </p>
                        <p className={styles.capturedSub}>
                            Location: {dash(row.locationRelevanceLabel || row.locationMatchLabel)}
                        </p>
                        <p className={styles.capturedSub}>
                            {processRunning ? 'Campaign still running — you can open links and create a Lead now.' : 'Company detail'}
                        </p>
                    </div>
                    <button type="button" className={styles.howBtn} onClick={onClose}>Close</button>
                </header>

                <section className={styles.drawerSection}>
                    <h4>Company Overview</h4>
                    <dl className={styles.drawerDl}>
                        <dt>Company Name</dt><dd>{dash(row.companyName || row.title)}</dd>
                        <dt>Industry</dt><dd>{dash(row.searchKeyword || row.industry)}</dd>
                        <dt>Sub-Industry</dt><dd>{dash(row.subIndustry || row.businessType)}</dd>
                        <dt>Business Type</dt><dd>{dash(row.businessType)}</dd>
                        <dt>Description</dt><dd>{dash(row.detail?.snippet || row.snippet)}</dd>
                        <dt>Products / services</dt><dd>{dash(row.productsServices)}</dd>
                    </dl>
                </section>

                <section className={styles.drawerSection}>
                    <h4>Contact</h4>
                    <dl className={styles.drawerDl}>
                        <dt>Mobile</dt><dd>{dash(row.mobile || row.phone)}</dd>
                        <dt>WhatsApp</dt><dd>{row.whatsappUrl ? <ExtLink href={row.whatsappUrl}>Open WhatsApp</ExtLink> : '—'}</dd>
                        <dt>Telephone</dt><dd>{dash(row.telephone)}</dd>
                        <dt>Email</dt><dd>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</dd>
                        <dt>Address</dt><dd>{dash(row.primaryAddress)}</dd>
                        <dt>City</dt><dd>{dash(row.city)}</dd>
                        <dt>State</dt><dd>{dash(row.state)}</dd>
                        <dt>Country</dt><dd>{dash(row.country)}</dd>
                    </dl>
                </section>

                <section className={styles.drawerSection}>
                    <h4>Online Presence</h4>
                    <div className={styles.drawerActions} style={{ padding: 0, border: 0 }}>
                        {row.website ? <ExtLink href={row.website}>Open Website</ExtLink> : null}
                        {row.facebook ? <ExtLink href={row.facebook}>Facebook</ExtLink> : null}
                        {row.instagram ? <ExtLink href={row.instagram}>Instagram</ExtLink> : null}
                        {row.linkedin ? <ExtLink href={row.linkedin}>LinkedIn</ExtLink> : null}
                        {row.youtube ? <ExtLink href={row.youtube}>YouTube</ExtLink> : null}
                        {row.googleBusinessUrl ? <ExtLink href={row.googleBusinessUrl}>Google / business profile</ExtLink> : null}
                        {!row.website && !row.facebook && !row.instagram && !row.linkedin && !row.youtube && !row.googleBusinessUrl
                            ? <p className={styles.capturedSub}>No public website or social URLs captured yet.</p>
                            : null}
                    </div>
                </section>

                <section className={styles.drawerSection}>
                    <h4 title={AI_TIP}>AI Verification</h4>
                    <p className={styles.aiTip}>{AI_TIP}</p>
                    <dl className={styles.drawerDl}>
                        <dt>Verification Status</dt><dd>{dash(row.aiStatus || row.verificationStatusLabel)}</dd>
                        <dt>Confidence %</dt><dd>{row.confidencePercent != null && row.confidencePercent !== '' ? `${row.confidencePercent}%` : '—'}</dd>
                        <dt>Industry Match %</dt><dd>{row.industryMatchPercent != null ? `${row.industryMatchPercent}%` : '—'}</dd>
                        <dt>Contact Completeness %</dt><dd>{row.contactCompletenessPercent != null ? `${row.contactCompletenessPercent}%` : '—'}</dd>
                        <dt>Business Potential</dt><dd>{row.businessPotentialLabel ? `${row.businessPotentialLabel} ${row.businessPotentialScore}/100` : '—'}</dd>
                        <dt>Evidence summary</dt><dd>{dash(row.detail?.genuinenessReason)}</dd>
                    </dl>
                    {(row.suggestedProducts || []).length ? (
                        <p className={styles.capturedSub}>Suggested opportunities: {(row.suggestedProducts || []).join(', ')}</p>
                    ) : null}
                    <h5 className={styles.drawerSub}>View Verification Evidence</h5>
                    <ul className={styles.evidenceList}>
                        {evidence.length ? evidence.map((ev) => (
                            <li key={ev.key}>{ev.label}: <strong>{ev.value ? 'YES' : 'NO'}</strong></li>
                        )) : <li>No structured evidence checklist yet.</li>}
                    </ul>
                </section>

                <section className={styles.drawerSection}>
                    <h4>Source Evidence</h4>
                    <ul className={styles.evidenceList}>
                        {sources.length ? sources.map((url) => (
                            <li key={url}><ExtLink href={url}>{url}</ExtLink></li>
                        )) : <li>—</li>}
                    </ul>
                </section>

                <section className={styles.drawerSection}>
                    <h4>CRM</h4>
                    <p><strong>{crm}</strong></p>
                </section>

                <footer className={styles.drawerActions}>
                    {row.website ? <ExtLink href={row.website}>Open Website</ExtLink> : null}
                    {row.facebook ? <ExtLink href={row.facebook}>Facebook</ExtLink> : null}
                    {row.instagram ? <ExtLink href={row.instagram}>Instagram</ExtLink> : null}
                    {row.linkedin ? <ExtLink href={row.linkedin}>LinkedIn</ExtLink> : null}
                    {row.youtube ? <ExtLink href={row.youtube}>YouTube</ExtLink> : null}
                    {row.googleBusinessUrl ? <ExtLink href={row.googleBusinessUrl}>Google / business profile</ExtLink> : null}
                    {row.whatsappUrl ? <ExtLink href={row.whatsappUrl}>Open WhatsApp</ExtLink> : null}
                    {row.qualificationId && row.ownerReviewStatus !== 'approved' ? (
                        <button type="button" className={styles.howBtn} onClick={() => onMarkReviewed?.(row)}>Mark Reviewed / Approve</button>
                    ) : row.ownerReviewStatus === 'approved' ? (
                        <span className={styles.capturedSub}>Owner approved (manual)</span>
                    ) : null}
                    {crm === 'LEAD CREATED' || crm === 'EXISTING LEAD' ? (
                        <button type="button" className={styles.primaryBtn} onClick={() => onOpenLead?.(row)}>Open Lead</button>
                    ) : crm === 'EXISTING CUSTOMER' ? (
                        <button type="button" className={styles.primaryBtn} onClick={() => onOpenCustomer?.(row)}>Open Customer</button>
                    ) : (
                        <>
                            {!row.flags?.isVerifiedRelevant && row.ownerReviewStatus !== 'approved' ? (
                                <span className={styles.capturedSub}>This company is not confirmed as a relevant prospect.</span>
                            ) : null}
                            <button type="button" className={styles.primaryBtn} onClick={() => onCreateLead?.(row)}>Create Lead</button>
                        </>
                    )}
                </footer>
            </aside>
        </div>
    );
}
