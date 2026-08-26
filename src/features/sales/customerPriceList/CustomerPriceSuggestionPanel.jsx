import React from 'react';

const inr = (n) => {
    if (n == null || n === '') return '—';
    return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const dmy = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
};

/**
 * Additive read-only panel. Does not participate in GST/totals.
 */
export default function CustomerPriceSuggestionPanel({ hints, items, soLocked }) {
    const rows = (items || []).map((item, i) => ({ item, hint: hints?.[i], i }))
        .filter((r) => r.item?.itemId && r.hint);

    if (!rows.length) return null;

    return (
        <div style={{
            marginTop: 12, padding: 12, background: '#f0fdfa', border: '1px solid #99f6e4',
            borderRadius: 8, fontSize: 12, color: '#134e4a',
        }}>
            <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                Customer price suggestion (read-only)
            </div>
            {soLocked && (
                <div style={{ marginBottom: 8, color: '#1d4ed8', fontWeight: 600 }}>
                    This invoice is from a Sales Order — the Sales Order rate is used. Customer Price List does not replace it.
                </div>
            )}
            {rows.map(({ item, hint, i }) => {
                const entered = Number(item.rate);
                const suggested = Number(hint.suggestedRate);
                const diff = Number.isFinite(entered) && Number.isFinite(suggested) ? entered - suggested : null;
                const pct = diff != null && suggested ? ((diff / suggested) * 100) : null;
                return (
                    <div key={i} style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
                        gap: 8, padding: '6px 0', borderTop: '1px solid #ccfbf1',
                    }}>
                        <div>
                            <strong>{item.itemName || item.itemCode}</strong>
                            {hint.needsSelection && (
                                <div style={{ color: '#b45309', fontWeight: 700, marginTop: 2 }}>
                                    Multiple valid customer prices found — select price source
                                </div>
                            )}
                        </div>
                        <div>
                            Suggested: <strong>{inr(hint.suggestedRate)}</strong>
                            <div style={{ color: '#0f766e' }}>Source: {hint.source?.label || '—'}</div>
                            <div>Valid Until: {dmy(hint.source?.validUpto)}</div>
                        </div>
                        <div>Last Sales Price: {inr(hint.lastSalesOrderPrice)}</div>
                        <div>Standard Price: {inr(hint.standardPrice)}</div>
                        <div>
                            Entered: <strong>{inr(item.rate)}</strong>
                            {diff != null && Number.isFinite(suggested) && Math.abs(diff) > 0.009 && (
                                <div style={{ color: diff < 0 ? '#b45309' : '#0f766e' }}>
                                    Difference: {diff < 0 ? '−' : '+'}{inr(Math.abs(diff))}
                                    {pct != null ? ` (${pct.toFixed(2)}%)` : ''}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
