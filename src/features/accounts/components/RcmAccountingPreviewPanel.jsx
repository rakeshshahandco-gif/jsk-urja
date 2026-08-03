import React, { useEffect, useState } from 'react';
import { Calculator, ShieldAlert } from 'lucide-react';
import { getLedgers } from '@/services/accountApi';

const box = {
    marginTop: 12,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    fontSize: 12,
    color: '#1e3a5f',
    lineHeight: 1.45,
};

const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 8,
    marginTop: 8,
};

const cell = {
    background: '#fff',
    border: '1px solid #dbeafe',
    borderRadius: 8,
    padding: '8px 10px',
};

const k = {
    fontSize: 10,
    fontWeight: 700,
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const v = { fontSize: 13, fontWeight: 650, color: '#0f172a', marginTop: 2 };

const sectionTitle = {
    margin: '12px 0 4px',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#1e40af',
};

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function EntryTable({ entries }) {
    if (!entries?.length) {
        return <div style={{ color: '#64748b', marginTop: 4 }}>No simulated lines in this section.</div>;
    }
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 11 }}>
            <thead>
                <tr style={{ textAlign: 'left', color: '#1d4ed8' }}>
                    <th style={{ padding: '4px 6px' }}>Dr/Cr</th>
                    <th style={{ padding: '4px 6px' }}>Ledger</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Amount</th>
                </tr>
            </thead>
            <tbody>
                {entries.map((e, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 700 }}>{e.drCr}</td>
                        <td style={{ padding: '4px 6px' }}>
                            {e.ledger}
                            {e.proposed ? (
                                <span style={{ marginLeft: 6, fontSize: 9, color: '#b45309' }}>(proposed)</span>
                            ) : null}
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 650 }}>₹{fmt(e.amount)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/**
 * Phase 2B-A simulation + 2B-B liability + 2B-C tax payment UI.
 * Does not post on voucher save — explicit actions only. ITC never released here.
 */
export default function RcmAccountingPreviewPanel({
    simulation,
    loading,
    rcmConfirmed,
    onConfirmChange,
    canConfirm = false,
    canPost = false,
    canRecordPayment = false,
    canReviewItc = false,
    canReleaseItc = false,
    postingEligibility = null,
    postingResult = null,
    sourceVoucherId = null,
    sourceSummary = null,
    postBusy = false,
    paymentBusy = false,
    itcBusy = false,
    onPostLiability,
    onRecordPayment,
    onSaveItcReview,
    onReleaseItc,
    paymentLedgers: paymentLedgersProp = null,
}) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [checkboxAccepted, setCheckboxAccepted] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [payDialogOpen, setPayDialogOpen] = useState(false);
    const [payAccepted, setPayAccepted] = useState(false);
    const [payForm, setPayForm] = useState({
        paymentLedgerId: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        challanReference: '',
        taxPeriod: '',
        cgstPaid: '',
        sgstPaid: '',
        igstPaid: '',
        cessPaid: '',
        remarks: '',
    });
    const [ledgers, setLedgers] = useState(paymentLedgersProp || []);
    const [itcDialogOpen, setItcDialogOpen] = useState(false);
    const [itcAccepted, setItcAccepted] = useState(false);
    const [itcForm, setItcForm] = useState({
        eligibilityDecision: 'FULLY_ELIGIBLE',
        eligiblePercent: '100',
        reason: '',
        remarks: '',
        cgstReleased: '',
        sgstReleased: '',
        igstReleased: '',
        cessReleased: '',
    });

    useEffect(() => {
        if (paymentLedgersProp?.length) {
            setLedgers(paymentLedgersProp);
            return undefined;
        }
        if (!payDialogOpen && !canRecordPayment) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await getLedgers({ limit: 500 });
                const list = Array.isArray(rows) ? rows : (rows?.data || rows?.ledgers || []);
                const filtered = list.filter((l) => {
                    const t = String(l.type || '');
                    const n = String(l.name || '');
                    return (
                        t === 'Bank'
                        || l.isBank
                        || /bank|gst.?cash|electronic cash|challan|tax.?payment/i.test(n)
                    );
                });
                if (!cancelled) setLedgers(filtered);
            } catch {
                if (!cancelled) setLedgers([]);
            }
        })();
        return () => { cancelled = true; };
    }, [payDialogOpen, canRecordPayment, paymentLedgersProp]);

    if (loading) {
        return <div style={box}>Building RCM accounting simulation…</div>;
    }

    const posted = postingResult?.posting || (postingResult?.alreadyPosted ? postingResult.posting : null);
    const isPosted = !!(posted && posted.postingStatus === 'POSTED')
        || postingResult?.status === 'POSTED'
        || postingResult?.status === 'ALREADY_POSTED';
    const blockReason = postingEligibility && !postingEligibility.eligible
        ? postingEligibility.reason
        : null;

    const liability = simulation?.rcmLiability;
    const outstandingCgst = posted?.outstandingCgst ?? Math.max(0, (Number(posted?.cgst) || 0) - Number(posted?.amountPaid ? 0 : 0));
    const payStatus = posted?.taxPaymentStatus || 'PAYMENT_PENDING';
    const canPayNow = isPosted
        && payStatus !== 'PAID'
        && posted?.postingStatus === 'POSTED';
    const itcStatus = posted?.itcStatus || 'NOT_AVAILABLE_YET';
    const canReviewItcNow = isPosted && payStatus === 'PAID' && posted?.postingStatus === 'POSTED';
    const itcAlreadyReleased = ['RELEASED', 'PARTLY_RELEASED'].includes(String(itcStatus));

    const openPayDialog = () => {
        setPayAccepted(false);
        setPayForm({
            paymentLedgerId: '',
            paymentDate: new Date().toISOString().slice(0, 10),
            challanReference: '',
            taxPeriod: sourceSummary?.taxPeriod
                ? String(sourceSummary.taxPeriod).slice(0, 7)
                : new Date().toISOString().slice(0, 7),
            cgstPaid: String(posted?.outstandingCgst ?? posted?.cgst ?? ''),
            sgstPaid: String(posted?.outstandingSgst ?? posted?.sgst ?? ''),
            igstPaid: String(posted?.outstandingIgst ?? posted?.igst ?? ''),
            cessPaid: String(posted?.outstandingCess ?? posted?.cess ?? 0),
            remarks: '',
        });
        setPayDialogOpen(true);
    };

    return (
        <div style={box} data-jsk-ui-component="rcm-accounting-preview-panel">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <Calculator size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                    <strong>{isPosted ? 'RCM Liability Posted' : 'RCM Accounting Preview'}</strong>
                    <div style={{ marginTop: 4, fontWeight: 700, color: isPosted ? '#047857' : '#b45309' }}>
                        {isPosted
                            ? (postingResult?.banner || 'RCM Liability Posted — Return Mapping Pending')
                            : 'SIMULATION ONLY — NOT POSTED TO ACCOUNTS'}
                    </div>
                    <div style={{ marginTop: 2 }}>
                        {isPosted
                            ? (postingResult?.message
                                || 'Record tax payment separately. ITC is not released in this phase.')
                            : (simulation?.banner
                                || 'RCM liability, payment and ITC are not written to ledgers until authorised posting.')}
                    </div>
                </div>
            </div>

            {canConfirm && !isPosted ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={!!rcmConfirmed}
                        onChange={(e) => onConfirmChange?.(e.target.checked)}
                    />
                    <span style={{ fontWeight: 650 }}>
                        Confirm RCM for accounting simulation / posting gate (authorised)
                    </span>
                </label>
            ) : null}

            {isPosted && posted ? (
                <div style={{ ...grid, marginBottom: 10 }}>
                    <div style={cell}><div style={k}>Posting voucher</div><div style={v}>{posted.accountingVoucherNumber || '—'}</div></div>
                    <div style={cell}><div style={k}>Posting date</div><div style={v}>{posted.accountingVoucherDate ? String(posted.accountingVoucherDate).slice(0, 10) : '—'}</div></div>
                    <div style={cell}><div style={k}>Total liability</div><div style={v}>₹{fmt(posted.totalLiability)}</div></div>
                    <div style={cell}><div style={k}>Amount paid</div><div style={v}>₹{fmt(posted.amountPaid)}</div></div>
                    <div style={cell}><div style={k}>Outstanding</div><div style={v}>₹{fmt(posted.outstandingTotal ?? ((Number(posted.totalLiability) || 0) - (Number(posted.amountPaid) || 0)))}</div></div>
                    <div style={cell}><div style={k}>Supplier payable</div><div style={v}>₹{fmt(posted.supplierPayable)}</div></div>
                    <div style={cell}><div style={k}>Payment status</div><div style={v}>{payStatus}</div></div>
                    <div style={cell}><div style={k}>Challan ref</div><div style={v}>{posted.lastChallanReference || '—'}</div></div>
                    <div style={cell}><div style={k}>Payment date</div><div style={v}>{posted.lastPaymentDate ? String(posted.lastPaymentDate).slice(0, 10) : '—'}</div></div>
                    <div style={cell}><div style={k}>ITC status</div><div style={v}>{posted.itcStatus === 'PENDING_ELIGIBILITY_REVIEW' ? 'Pending Eligibility Review' : (posted.itcStatus || 'Not Available Yet')}</div></div>
                    <div style={cell}><div style={k}>GSTR-3B</div><div style={v}>Not Automatically Updated</div></div>
                    <div style={cell}><div style={k}>CGST / SGST / IGST</div><div style={v}>{fmt(posted.cgst)} / {fmt(posted.sgst)} / {fmt(posted.igst)}</div></div>
                </div>
            ) : null}

            {isPosted && canPayNow ? (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid #bfdbfe' }}>
                    <div style={sectionTitle}>Record RCM Tax Payment</div>
                    <div style={{ fontSize: 11, color: '#9a3412', fontWeight: 650, marginBottom: 8 }}>
                        This records payment of the RCM liability. It does not release or claim Input Tax Credit.
                    </div>
                    {canRecordPayment ? (
                        <button
                            type="button"
                            disabled={paymentBusy}
                            onClick={openPayDialog}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#047857',
                                color: '#fff',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Record RCM Tax Payment…
                        </button>
                    ) : (
                        <div style={{ color: '#64748b' }}>Requires permission gst.rcm.record_payment.</div>
                    )}
                </div>
            ) : null}

            {canReviewItcNow ? (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid #bfdbfe' }}>
                    <div style={sectionTitle}>RCM ITC Eligibility Review</div>
                    <div style={{ fontWeight: 700, color: itcAlreadyReleased ? '#047857' : '#b45309' }}>
                        {itcAlreadyReleased
                            ? `ITC ${itcStatus} — GSTR-3B Mapping Pending`
                            : 'Tax Paid — ITC Review Pending'}
                    </div>
                    <div style={{ ...grid, marginTop: 8 }}>
                        <div style={cell}><div style={k}>ITC status</div><div style={v}>{itcStatus}</div></div>
                        <div style={cell}><div style={k}>Released</div><div style={v}>₹{fmt(posted?.itcReleasedTotal)}</div></div>
                        <div style={cell}><div style={k}>Release voucher</div><div style={v}>{posted?.lastItcReleaseVoucherNumber || '—'}</div></div>
                        <div style={cell}><div style={k}>GSTR-3B</div><div style={v}>Not Automatically Updated</div></div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9a3412', fontWeight: 650, margin: '8px 0' }}>
                        This will post eligible RCM Input Tax Credit into accounts. It will not automatically update GSTR-3B.
                    </div>
                    {(canReviewItc || canReleaseItc) && !itcAlreadyReleased ? (
                        <button
                            type="button"
                            disabled={itcBusy}
                            onClick={() => {
                                setItcAccepted(false);
                                setItcForm({
                                    eligibilityDecision: 'FULLY_ELIGIBLE',
                                    eligiblePercent: '100',
                                    reason: '',
                                    remarks: '',
                                    cgstReleased: String(posted?.cgst ?? ''),
                                    sgstReleased: String(posted?.sgst ?? ''),
                                    igstReleased: String(posted?.igst ?? ''),
                                    cessReleased: String(posted?.cess ?? 0),
                                });
                                setItcDialogOpen(true);
                            }}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#7c3aed',
                                color: '#fff',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Review / Release RCM ITC…
                        </button>
                    ) : null}
                    {!canReviewItc && !canReleaseItc ? (
                        <div style={{ color: '#64748b' }}>
                            Requires gst.rcm.review_itc / gst.rcm.release_itc.
                        </div>
                    ) : null}
                </div>
            ) : null}

            {!simulation && !isPosted ? (
                <div style={{ color: '#64748b' }}>
                    {rcmConfirmed
                        ? 'No simulation yet — evaluate Phase 2A Reverse Charge first.'
                        : 'Confirm RCM above (after Phase 2A Reverse Charge) to generate the accounting simulation.'}
                </div>
            ) : null}

            {simulation && !simulation.simulationGenerated && !isPosted ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                    <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <div style={{ fontWeight: 700 }}>Simulation not generated</div>
                        <div>{simulation.skipReason || 'Confirm Reverse Charge to simulate.'}</div>
                    </div>
                </div>
            ) : null}

            {simulation?.simulationGenerated ? (
                <>
                    <div style={sectionTitle}>A. Supplier Booking</div>
                    <div style={grid}>
                        <div style={cell}><div style={k}>Supplier payable</div><div style={v}>₹{fmt(simulation.supplierBooking?.supplierPayable)}</div></div>
                        <div style={cell}><div style={k}>RCM on payable?</div><div style={v}>{simulation.supplierBooking?.rcmGstAddedToSupplierPayable ? 'Yes' : 'No — excluded'}</div></div>
                    </div>
                    <EntryTable entries={simulation.supplierBooking?.entries} />

                    <div style={sectionTitle}>B. RCM Liability</div>
                    <div style={grid}>
                        <div style={cell}><div style={k}>Taxable</div><div style={v}>₹{fmt(liability?.taxableValue)}</div></div>
                        <div style={cell}><div style={k}>CGST</div><div style={v}>₹{fmt(liability?.cgst)}</div></div>
                        <div style={cell}><div style={k}>SGST</div><div style={v}>₹{fmt(liability?.sgst)}</div></div>
                        <div style={cell}><div style={k}>IGST</div><div style={v}>₹{fmt(liability?.igst)}</div></div>
                    </div>
                    <EntryTable entries={liability?.entries} />

                    <div style={sectionTitle}>E. Simulated Accounting Entries</div>
                    {!isPosted ? (
                        <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                            SIMULATION ONLY — NOT POSTED TO ACCOUNTS
                        </div>
                    ) : null}
                    <EntryTable entries={simulation.simulatedEntries} />
                </>
            ) : null}

            {!isPosted && simulation?.simulationGenerated ? (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #bfdbfe' }}>
                    <div style={sectionTitle}>Authorised RCM Liability Posting</div>
                    {blockReason ? (
                        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 10, color: '#9a3412' }}>
                            <strong>Post RCM Liability disabled:</strong> {blockReason}
                        </div>
                    ) : null}
                    {!sourceVoucherId ? (
                        <div style={{ marginTop: 8, color: '#b45309' }}>
                            Save the Expense / Purchase voucher first. Posting is never automatic on save.
                        </div>
                    ) : null}
                    {canPost && !blockReason && sourceVoucherId ? (
                        <button
                            type="button"
                            disabled={postBusy}
                            onClick={() => { setCheckboxAccepted(false); setDialogOpen(true); }}
                            style={{
                                marginTop: 10,
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#1d4ed8',
                                color: '#fff',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Post RCM Liability…
                        </button>
                    ) : null}
                    {!canPost ? (
                        <div style={{ marginTop: 8, color: '#64748b' }}>
                            Requires permission gst.rcm.post_liability.
                        </div>
                    ) : null}
                </div>
            ) : null}

            {dialogOpen ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.45)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div style={{ background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%', padding: 20, color: '#0f172a' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>RCM Liability Posting</h3>
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <div><strong>Source Voucher:</strong> {sourceSummary?.voucherNumber || sourceVoucherId}</div>
                            <div><strong>Supplier:</strong> {sourceSummary?.supplierName || '—'}</div>
                            <div><strong>Expense/Purchase Ledger:</strong> {sourceSummary?.ledgerName || '—'}</div>
                            <div><strong>Taxable Value:</strong> ₹{fmt(liability?.taxableValue)}</div>
                            <div><strong>CGST / SGST / IGST:</strong> ₹{fmt(liability?.cgst)} / ₹{fmt(liability?.sgst)} / ₹{fmt(liability?.igst)}</div>
                            <div><strong>Supplier Payable:</strong> ₹{fmt(simulation?.supplierBooking?.supplierPayable)} (RCM excluded)</div>
                            <div style={{ marginTop: 8 }}>
                                <strong>Accounting Entry:</strong> Dr RCM GST Recoverable / Cr RCM CGST+SGST or IGST Payable
                            </div>
                            <div><strong>Tax Period:</strong> {sourceSummary?.taxPeriod || '—'}</div>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: '#fff7ed', borderRadius: 8, color: '#9a3412', fontWeight: 650 }}>
                            This will create an RCM GST liability in the accounts. It will not record GST payment or release ITC.
                        </div>
                        <label style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={checkboxAccepted}
                                onChange={(e) => setCheckboxAccepted(e.target.checked)}
                            />
                            <span>I confirm authorised posting of RCM liability only (no payment / no ITC).</span>
                        </label>
                        <div style={{ marginTop: 10 }}>
                            <div style={k}>Optional remarks</div>
                            <textarea
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                rows={2}
                                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                            <button type="button" onClick={() => setDialogOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!checkboxAccepted || postBusy}
                                onClick={async () => {
                                    await onPostLiability?.({
                                        confirmPost: true,
                                        checkboxAccepted: true,
                                        remarks: remarks.trim(),
                                    });
                                    setDialogOpen(false);
                                }}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: checkboxAccepted ? '#1d4ed8' : '#94a3b8',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: checkboxAccepted ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {postBusy ? 'Posting…' : 'Post Liability'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {payDialogOpen && posted ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.45)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div style={{ background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%', padding: 20, color: '#0f172a', maxHeight: '90vh', overflow: 'auto' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Record RCM Tax Payment</h3>
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <div><strong>Source voucher:</strong> {posted.sourceVoucherNumber || sourceSummary?.voucherNumber || '—'}</div>
                            <div><strong>Supplier:</strong> {posted.supplierName || sourceSummary?.supplierName || '—'}</div>
                            <div><strong>Taxable value:</strong> ₹{fmt(posted.taxableValue)}</div>
                            <div><strong>Liability voucher:</strong> {posted.accountingVoucherNumber}</div>
                            <div><strong>Liability CGST/SGST/IGST:</strong> ₹{fmt(posted.cgst)} / ₹{fmt(posted.sgst)} / ₹{fmt(posted.igst)}</div>
                            <div><strong>Already paid:</strong> ₹{fmt(posted.amountPaid)}</div>
                            <div><strong>Outstanding:</strong> ₹{fmt(posted.outstandingTotal ?? outstandingCgst)}</div>
                            <div><strong>ITC status:</strong> Not Available Yet</div>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: '#fff7ed', borderRadius: 8, color: '#9a3412', fontWeight: 650 }}>
                            This records payment of the RCM liability. It does not release or claim Input Tax Credit.
                        </div>
                        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                            <label>
                                <div style={k}>Payment ledger *</div>
                                <select
                                    value={payForm.paymentLedgerId}
                                    onChange={(e) => setPayForm((f) => ({ ...f, paymentLedgerId: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">Select bank / GST cash ledger…</option>
                                    {ledgers.map((l) => (
                                        <option key={l._id} value={l._id}>{l.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <div style={k}>Payment date *</div>
                                <input
                                    type="date"
                                    value={payForm.paymentDate}
                                    onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                            <label>
                                <div style={k}>Challan / CPIN / CIN / reference *</div>
                                <input
                                    value={payForm.challanReference}
                                    onChange={(e) => setPayForm((f) => ({ ...f, challanReference: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                            <label>
                                <div style={k}>Tax period *</div>
                                <input
                                    placeholder="YYYY-MM"
                                    value={payForm.taxPeriod}
                                    onChange={(e) => setPayForm((f) => ({ ...f, taxPeriod: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <label>
                                    <div style={k}>CGST paid</div>
                                    <input type="number" min="0" step="0.01" value={payForm.cgstPaid}
                                        onChange={(e) => setPayForm((f) => ({ ...f, cgstPaid: e.target.value }))}
                                        style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                </label>
                                <label>
                                    <div style={k}>SGST paid</div>
                                    <input type="number" min="0" step="0.01" value={payForm.sgstPaid}
                                        onChange={(e) => setPayForm((f) => ({ ...f, sgstPaid: e.target.value }))}
                                        style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                </label>
                                <label>
                                    <div style={k}>IGST paid</div>
                                    <input type="number" min="0" step="0.01" value={payForm.igstPaid}
                                        onChange={(e) => setPayForm((f) => ({ ...f, igstPaid: e.target.value }))}
                                        style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                </label>
                                <label>
                                    <div style={k}>Cess paid</div>
                                    <input type="number" min="0" step="0.01" value={payForm.cessPaid}
                                        onChange={(e) => setPayForm((f) => ({ ...f, cessPaid: e.target.value }))}
                                        style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                </label>
                            </div>
                            <label>
                                <div style={k}>Remarks</div>
                                <textarea
                                    value={payForm.remarks}
                                    onChange={(e) => setPayForm((f) => ({ ...f, remarks: e.target.value }))}
                                    rows={2}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                        </div>
                        <label style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input type="checkbox" checked={payAccepted} onChange={(e) => setPayAccepted(e.target.checked)} />
                            <span>I confirm recording RCM tax payment only (no ITC release / no GSTR-3B auto-update).</span>
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                            <button type="button" onClick={() => setPayDialogOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!payAccepted || paymentBusy || !payForm.paymentLedgerId || !payForm.challanReference}
                                onClick={async () => {
                                    await onRecordPayment?.({
                                        confirmPayment: true,
                                        checkboxAccepted: true,
                                        paymentLedgerId: payForm.paymentLedgerId,
                                        paymentDate: payForm.paymentDate,
                                        challanReference: payForm.challanReference.trim(),
                                        taxPeriod: payForm.taxPeriod.trim(),
                                        cgstPaid: Number(payForm.cgstPaid) || 0,
                                        sgstPaid: Number(payForm.sgstPaid) || 0,
                                        igstPaid: Number(payForm.igstPaid) || 0,
                                        cessPaid: Number(payForm.cessPaid) || 0,
                                        remarks: payForm.remarks.trim(),
                                    });
                                    setPayDialogOpen(false);
                                }}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: payAccepted ? '#047857' : '#94a3b8',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: payAccepted ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {paymentBusy ? 'Recording…' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {itcDialogOpen && posted ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.45)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div style={{ background: '#fff', borderRadius: 12, maxWidth: 580, width: '100%', padding: 20, color: '#0f172a', maxHeight: '90vh', overflow: 'auto' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>RCM ITC Eligibility Review</h3>
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <div><strong>Source:</strong> {posted.sourceVoucherNumber || sourceSummary?.voucherNumber}</div>
                            <div><strong>Supplier:</strong> {posted.supplierName || sourceSummary?.supplierName}</div>
                            <div><strong>Ledger:</strong> {posted.expensePurchaseLedgerName || sourceSummary?.ledgerName}</div>
                            <div><strong>Tax paid CGST/SGST/IGST:</strong> ₹{fmt(posted.cgst)} / ₹{fmt(posted.sgst)} / ₹{fmt(posted.igst)}</div>
                            <div><strong>Challan:</strong> {posted.lastChallanReference || '—'}</div>
                            <div><strong>Proposed ledgers:</strong> Input CGST/SGST/IGST under RCM / Cr RCM GST Recoverable</div>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: '#f5f3ff', borderRadius: 8, color: '#5b21b6', fontWeight: 650 }}>
                            This will post eligible RCM Input Tax Credit into accounts. It will not automatically update GSTR-3B.
                        </div>
                        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                            <label>
                                <div style={k}>Eligibility decision *</div>
                                <select
                                    value={itcForm.eligibilityDecision}
                                    onChange={(e) => setItcForm((f) => ({ ...f, eligibilityDecision: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                >
                                    <option value="FULLY_ELIGIBLE">Fully Eligible</option>
                                    <option value="PARTLY_ELIGIBLE">Partly Eligible</option>
                                    <option value="INELIGIBLE">Ineligible</option>
                                    <option value="BLOCKED">Blocked</option>
                                </select>
                            </label>
                            {itcForm.eligibilityDecision === 'PARTLY_ELIGIBLE' ? (
                                <label>
                                    <div style={k}>Eligible %</div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={itcForm.eligiblePercent}
                                        onChange={(e) => setItcForm((f) => ({ ...f, eligiblePercent: e.target.value }))}
                                        style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                    />
                                </label>
                            ) : null}
                            <label>
                                <div style={k}>Reason *</div>
                                <input
                                    value={itcForm.reason}
                                    onChange={(e) => setItcForm((f) => ({ ...f, reason: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                            {['FULLY_ELIGIBLE', 'PARTLY_ELIGIBLE'].includes(itcForm.eligibilityDecision) ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <label>
                                        <div style={k}>CGST release</div>
                                        <input type="number" min="0" step="0.01" value={itcForm.cgstReleased}
                                            onChange={(e) => setItcForm((f) => ({ ...f, cgstReleased: e.target.value }))}
                                            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                    </label>
                                    <label>
                                        <div style={k}>SGST release</div>
                                        <input type="number" min="0" step="0.01" value={itcForm.sgstReleased}
                                            onChange={(e) => setItcForm((f) => ({ ...f, sgstReleased: e.target.value }))}
                                            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                    </label>
                                    <label>
                                        <div style={k}>IGST release</div>
                                        <input type="number" min="0" step="0.01" value={itcForm.igstReleased}
                                            onChange={(e) => setItcForm((f) => ({ ...f, igstReleased: e.target.value }))}
                                            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                    </label>
                                    <label>
                                        <div style={k}>Cess release</div>
                                        <input type="number" min="0" step="0.01" value={itcForm.cessReleased}
                                            onChange={(e) => setItcForm((f) => ({ ...f, cessReleased: e.target.value }))}
                                            style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                    </label>
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: '#9a3412' }}>
                                    Ineligible/Blocked: no Input GST under RCM will be posted. Recoverable remains until authorised reclassification.
                                </div>
                            )}
                            <label>
                                <div style={k}>Remarks</div>
                                <textarea
                                    value={itcForm.remarks}
                                    onChange={(e) => setItcForm((f) => ({ ...f, remarks: e.target.value }))}
                                    rows={2}
                                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                />
                            </label>
                        </div>
                        <label style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input type="checkbox" checked={itcAccepted} onChange={(e) => setItcAccepted(e.target.checked)} />
                            <span>I confirm authorised ITC review/release (no GSTR-3B auto-update).</span>
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setItcDialogOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            {canReviewItc ? (
                                <button
                                    type="button"
                                    disabled={!itcAccepted || itcBusy || !itcForm.reason}
                                    onClick={async () => {
                                        await onSaveItcReview?.({
                                            eligibilityDecision: itcForm.eligibilityDecision,
                                            eligiblePercent: Number(itcForm.eligiblePercent) || undefined,
                                            reason: itcForm.reason.trim(),
                                            remarks: itcForm.remarks.trim(),
                                            overrideIncompleteDocs: true,
                                            supportingDocuments: [
                                                { code: 'SUPPLIER_BILL', required: true, status: 'CONFIRMED' },
                                                { code: 'PAYMENT_VOUCHER', required: true, status: 'CONFIRMED' },
                                                { code: 'LIABILITY_POSTING', required: true, status: 'CONFIRMED' },
                                                { code: 'GST_CHALLAN', required: true, status: 'CONFIRMED' },
                                                { code: 'BUSINESS_USE', required: true, status: 'CONFIRMED' },
                                                { code: 'REVIEWER_CONFIRM', required: true, status: 'CONFIRMED' },
                                            ],
                                        });
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1px solid #7c3aed',
                                        background: '#fff',
                                        color: '#5b21b6',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {itcBusy ? 'Saving…' : 'Save Review'}
                                </button>
                            ) : null}
                            {canReleaseItc && ['FULLY_ELIGIBLE', 'PARTLY_ELIGIBLE'].includes(itcForm.eligibilityDecision) ? (
                                <button
                                    type="button"
                                    disabled={!itcAccepted || itcBusy || !itcForm.reason}
                                    onClick={async () => {
                                        await onSaveItcReview?.({
                                            eligibilityDecision: itcForm.eligibilityDecision,
                                            eligiblePercent: Number(itcForm.eligiblePercent) || undefined,
                                            reason: itcForm.reason.trim(),
                                            remarks: itcForm.remarks.trim(),
                                            overrideIncompleteDocs: true,
                                            supportingDocuments: [
                                                { code: 'SUPPLIER_BILL', required: true, status: 'CONFIRMED' },
                                                { code: 'PAYMENT_VOUCHER', required: true, status: 'CONFIRMED' },
                                                { code: 'LIABILITY_POSTING', required: true, status: 'CONFIRMED' },
                                                { code: 'GST_CHALLAN', required: true, status: 'CONFIRMED' },
                                                { code: 'BUSINESS_USE', required: true, status: 'CONFIRMED' },
                                                { code: 'REVIEWER_CONFIRM', required: true, status: 'CONFIRMED' },
                                            ],
                                        });
                                        await onReleaseItc?.({
                                            confirmRelease: true,
                                            checkboxAccepted: true,
                                            confirmCreate: true,
                                            reason: itcForm.reason.trim(),
                                            remarks: itcForm.remarks.trim(),
                                            cgstReleased: Number(itcForm.cgstReleased) || 0,
                                            sgstReleased: Number(itcForm.sgstReleased) || 0,
                                            igstReleased: Number(itcForm.igstReleased) || 0,
                                            cessReleased: Number(itcForm.cessReleased) || 0,
                                        });
                                        setItcDialogOpen(false);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: itcAccepted ? '#7c3aed' : '#94a3b8',
                                        color: '#fff',
                                        fontWeight: 700,
                                        cursor: itcAccepted ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {itcBusy ? 'Releasing…' : 'Release ITC'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
