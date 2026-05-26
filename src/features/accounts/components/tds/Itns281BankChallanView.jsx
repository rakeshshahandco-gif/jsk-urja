import React from 'react';
import { numberToWords } from '@/utils/numberToWords';
import styles from './Itns281BankChallan.module.scss';

function Tick({ checked, label }) {
    return (
        <div className={styles.tickItem}>
            <span className={styles.box}>{checked ? '✓' : ''}</span>
            <span>{label}</span>
        </div>
    );
}

export function Itns281BankChallanView({ ctx, breakup, onBreakupChange }) {
    if (!ctx) return null;
    const pb = breakup || ctx.paymentBreakup;
    const d = ctx.deductor;
    const pd = ctx.paymentDetails || {};

    const setBreakup = (field, val) => {
        if (!onBreakupChange) return;
        const n = Math.round((Number(val) || 0) * 100) / 100;
        const next = { ...pb, [field]: n };
        const total =
            (Number(next.incomeTax) || 0) +
            (Number(next.surcharge) || 0) +
            (Number(next.educationCess) || 0) +
            (Number(next.interest) || 0) +
            (Number(next.penalty) || 0);
        next.total = Math.round(total * 100) / 100;
        next.totalInWords = numberToWords(next.total);
        onBreakupChange(next);
    };

    return (
        <div className={styles.printRoot} id="itns281-print-area">
            <div className={styles.header}>
                <p className={styles.title}>{ctx.formTitle}</p>
                <p className={styles.code}>{ctx.formCode}</p>
                <p className={styles.sub}>{ctx.ruleRef}</p>
                <p className={styles.sub}>{ctx.copyNote}</p>
                <p className={styles.sub}>{ctx.usageNote}</p>
                <p className={styles.sub}>{ctx.challanNoLabel}</p>
            </div>

            <p className={styles.sectionTitle}>1. Tax applicable</p>
            <div className={styles.tickRow}>
                <Tick checked={ctx.taxApplicable?.company} label="0020 Company Deductees" />
                <Tick checked={ctx.taxApplicable?.nonCompany} label="0021 Non-Company Deductees" />
            </div>

            <p className={styles.sectionTitle}>2. Deductor details</p>
            <table className={styles.fieldTable}>
                <tbody>
                    <tr>
                        <td className={styles.fieldLabel}>Assessment Year</td>
                        <td colSpan={3}>{d.assessmentYear}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>TAN</td>
                        <td colSpan={3}>{d.tan}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>Full Name</td>
                        <td colSpan={3}>{d.fullName}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>Complete Address</td>
                        <td colSpan={3}>{d.address}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>City</td>
                        <td>{d.city}</td>
                        <td className={styles.fieldLabel}>State</td>
                        <td>{d.state}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>PIN Code</td>
                        <td>{d.pinCode}</td>
                        <td className={styles.fieldLabel}>Telephone No.</td>
                        <td>{d.telephone}</td>
                    </tr>
                </tbody>
            </table>

            <p className={styles.sectionTitle}>3. Type of payment</p>
            <div className={styles.tickRow}>
                <Tick checked={ctx.typeOfPayment?.code200} label="200 TDS / TCS Payable by Taxpayer" />
                <Tick checked={ctx.typeOfPayment?.code400} label="400 TDS / TCS Regular Assessment" />
            </div>

            <p className={styles.sectionTitle}>4. Nature of payment</p>
            <div className={styles.natureGrid}>
                {(ctx.natureOptions || []).map((opt) => (
                    <Tick key={opt.key} checked={!!ctx.natureOfPayment?.[opt.key]} label={opt.label} />
                ))}
            </div>

            <p className={styles.sectionTitle}>5. Details of payment</p>
            <table className={styles.gridTable}>
                <thead>
                    <tr>
                        <th>Particulars</th>
                        <th className={styles.amountCol}>Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>1. Income Tax / Basic TDS</td>
                        <td className={styles.amountCol}>{Number(pb.incomeTax || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>2. Surcharge</td>
                        <td className={styles.amountCol}>
                            {onBreakupChange ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pb.surcharge ?? 0}
                                    onChange={(e) => setBreakup('surcharge', e.target.value)}
                                    style={{ width: '100%', border: 'none', textAlign: 'right', fontSize: 'inherit' }}
                                />
                            ) : (
                                Number(pb.surcharge || 0).toFixed(2)
                            )}
                        </td>
                    </tr>
                    <tr>
                        <td>3. Education Cess / Health &amp; Education Cess</td>
                        <td className={styles.amountCol}>
                            {onBreakupChange ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pb.educationCess ?? 0}
                                    onChange={(e) => setBreakup('educationCess', e.target.value)}
                                    style={{ width: '100%', border: 'none', textAlign: 'right', fontSize: 'inherit' }}
                                />
                            ) : (
                                Number(pb.educationCess || 0).toFixed(2)
                            )}
                        </td>
                    </tr>
                    <tr>
                        <td>4. Interest</td>
                        <td className={styles.amountCol}>
                            {onBreakupChange ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pb.interest ?? 0}
                                    onChange={(e) => setBreakup('interest', e.target.value)}
                                    style={{ width: '100%', border: 'none', textAlign: 'right', fontSize: 'inherit' }}
                                />
                            ) : (
                                Number(pb.interest || 0).toFixed(2)
                            )}
                        </td>
                    </tr>
                    <tr>
                        <td>5. Penalty</td>
                        <td className={styles.amountCol}>
                            {onBreakupChange ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={pb.penalty ?? 0}
                                    onChange={(e) => setBreakup('penalty', e.target.value)}
                                    style={{ width: '100%', border: 'none', textAlign: 'right', fontSize: 'inherit' }}
                                />
                            ) : (
                                Number(pb.penalty || 0).toFixed(2)
                            )}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <strong>6. TOTAL</strong>
                        </td>
                        <td className={styles.amountCol}>
                            <strong>{Number(pb.total || 0).toFixed(2)}</strong>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p className={styles.words}>Amount in words: {pb.totalInWords || '—'}</p>

            <p className={styles.sectionTitle}>6. Payment details</p>
            <table className={styles.fieldTable}>
                <tbody>
                    <tr>
                        <td className={styles.fieldLabel}>Paid in Cash / Debit to A/c / Cheque No.</td>
                        <td>{pd.paidInCashOrCheque || '—'}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>Cheque Date</td>
                        <td>{pd.chequeDateFormatted || '—'}</td>
                        <td className={styles.fieldLabel}>Drawn on Bank &amp; Branch</td>
                        <td>{pd.drawnOnBank || '—'}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>Date</td>
                        <td colSpan={3}>{pd.paymentDateFormatted || '—'}</td>
                    </tr>
                    <tr>
                        <td className={styles.fieldLabel}>Signature of person making payment</td>
                        <td colSpan={3} style={{ minHeight: 28 }} />
                    </tr>
                </tbody>
            </table>
            <p className={styles.footerNote}>{ctx.chequeFavourNote}</p>

            <p className={styles.sectionTitle}>7. For receiving bank use only</p>
            <div className={styles.bankSection}>
                <div className={styles.bankRow}>
                    <span>Debit to A/c / Cheque credited on:</span>
                    <span className={styles.bankBox} />
                </div>
                <div className={styles.bankRow}>
                    <span>Bank Seal:</span>
                    <span className={styles.bankBox} style={{ maxWidth: 140 }} />
                    <span>7 Digit BSR Code:</span>
                    <span className={styles.bankBox} style={{ maxWidth: 100 }} />
                </div>
                <div className={styles.bankRow}>
                    <span>Date of Deposit:</span>
                    <span className={styles.bankBox} style={{ maxWidth: 120 }} />
                    <span>Challan Serial Number:</span>
                    <span className={styles.bankBox} style={{ maxWidth: 120 }} />
                </div>
            </div>

            <div className={styles.footerNote}>
                {(ctx.footerNotes || []).map((note, i) => (
                    <p key={i} style={{ margin: '2px 0' }}>
                        {i + 1}. {note}
                    </p>
                ))}
            </div>
        </div>
    );
}
