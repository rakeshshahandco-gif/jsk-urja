import React from 'react';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

/**
 * TDS liability confirm — supports single-section and multi-nature (tdsLines) previews.
 */
export function TdsLiabilityAlertModal({ open, supplierName, decision, master, tdsLines, onYes, onNo, loading }) {
    if (!open || !decision) return null;
    const lines = Array.isArray(tdsLines) && tdsLines.length
        ? tdsLines.filter((l) => Number(l.tdsAmount || 0) > 0 || Number(l.tdsBase || 0) > 0)
        : null;
    const multi = lines && lines.length > 1;
    const totalTds = lines
        ? lines.reduce((s, l) => s + (Number(l.tdsAmount) || 0), 0)
        : Number(decision.tdsAmount || 0);
    const totalBase = lines
        ? lines.reduce((s, l) => s + (Number(l.tdsBase) || 0), 0)
        : Number(decision.tdsBase || 0);
    const sectionLabel = master?.sectionName
        ? `${decision.tdsSection} - ${master.sectionName}`
        : decision.tdsSection;

    return (
        <div
            role="presentation"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.55)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={() => !loading && onNo()}
        >
            <div
                role="dialog"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: multi ? 720 : 480,
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                    border: '2px solid #fecaca',
                }}
            >
                <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#991b1b' }}>TDS LIABILITY ALERT</h2>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1e293b' }}>
                    <p style={{ margin: '0 0 6px' }}><strong>Supplier:</strong> {supplierName || '-'}</p>
                    <p style={{ margin: '0 0 6px' }}><strong>Constitution:</strong> {lines?.[0]?.supplierConstitution || decision.deducteeConstitution || '—'}</p>

                    {multi ? (
                        <>
                            <p style={{ margin: '12px 0 8px', fontWeight: 700 }}>Separate TDS by nature (not combined):</p>
                            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                                            <th style={{ padding: 6 }}>Ledger</th>
                                            <th style={{ padding: 6 }}>Nature</th>
                                            <th style={{ padding: 6 }}>Section</th>
                                            <th style={{ padding: 6 }}>Rate</th>
                                            <th style={{ padding: 6 }}>Base</th>
                                            <th style={{ padding: 6 }}>TDS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((l, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid #fee2e2' }}>
                                                <td style={{ padding: 6 }}>{l.expenseLedgerName || '—'}</td>
                                                <td style={{ padding: 6 }}>{l.tdsNature || '—'}</td>
                                                <td style={{ padding: 6 }}>
                                                    {l.sectionDisplay || l.section}
                                                    {l.section393Label ? (
                                                        <div style={{ fontSize: 10, color: '#64748b' }}>{l.section393Label}</div>
                                                    ) : null}
                                                </td>
                                                <td style={{ padding: 6 }}>{l.rate}%</td>
                                                <td style={{ padding: 6 }}>{fmt(l.tdsBase)}</td>
                                                <td style={{ padding: 6, fontWeight: 700 }}>{fmt(l.tdsAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {lines.map((l, i) => (
                                l.rateReason ? (
                                    <p key={`r-${i}`} style={{ margin: '0 0 4px', fontSize: 12, color: '#475569' }}>• {l.rateReason}</p>
                                ) : null
                            ))}
                            <p style={{ margin: '10px 0 0' }}><strong>Gross TDS base:</strong> {fmt(totalBase)}</p>
                            <p style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 0', color: '#b91c1c' }}>
                                Total TDS to deduct: {fmt(totalTds)}
                            </p>
                            <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
                                Net supplier payable (after TDS): {fmt(Math.max(0, totalBase - totalTds))}
                            </p>
                        </>
                    ) : (
                        <>
                            <p style={{ margin: '0 0 6px' }}><strong>Section:</strong> {sectionLabel}</p>
                            {lines?.[0]?.section393Label && (
                                <p style={{ margin: '0 0 6px' }}><strong>FY statutory mapping:</strong> {lines[0].section393Label}</p>
                            )}
                            <p style={{ margin: '0 0 6px' }}><strong>Previous aggregate (FY, same section/nature):</strong> {fmt(decision.cumulativeBefore)}</p>
                            <p style={{ margin: '0 0 6px' }}><strong>Current voucher (TDS base):</strong> {fmt(decision.tdsBase)}</p>
                            <p style={{ margin: '0 0 6px' }}><strong>New aggregate:</strong> {fmt(decision.cumulativeAfter)}</p>
                            <p style={{ margin: '0 0 6px' }}><strong>Applicable TDS:</strong> {decision.tdsRate}%</p>
                            {lines?.[0]?.rateReason && (
                                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#475569' }}>{lines[0].rateReason}</p>
                            )}
                            <p style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 0', color: '#b91c1c' }}>
                                TDS to deduct now: {fmt(decision.tdsAmount)}
                            </p>
                            <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Net payable (after this TDS): {fmt(decision.netPayable)}</p>
                        </>
                    )}
                </div>
                <p style={{ margin: '16px 0', fontSize: 13 }}>Confirm TDS deduction on posting, or skip (engine skipped for this voucher).</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onNo} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        Skip
                    </button>
                    <button type="button" onClick={onYes} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                        {loading ? 'Saving...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
