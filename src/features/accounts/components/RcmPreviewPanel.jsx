import React, { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const box = {
    marginTop: 12,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #fde68a',
    background: '#fffbeb',
    fontSize: 12,
    color: '#78350f',
    lineHeight: 1.45,
};

const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 8,
    marginTop: 10,
};

const cell = { background: '#fff', border: '1px solid #fef3c7', borderRadius: 8, padding: '8px 10px' };
const k = { fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' };
const v = { fontSize: 13, fontWeight: 650, color: '#1c1917', marginTop: 2 };

/**
 * Phase 2A preview panel — never posts tax.
 */
export default function RcmPreviewPanel({
    result,
    loading,
    questions,
    onQuestionChange,
    onOverride,
    canOverride = false,
}) {
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [finalTreatment, setFinalTreatment] = useState('');
    const [reason, setReason] = useState('');

    if (loading) {
        return <div style={box}>Evaluating RCM / GST treatment (preview)…</div>;
    }
    if (!result) return null;

    return (
        <div style={box} data-jsk-ui-component="rcm-preview-panel">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                    <strong>RCM / GST Treatment Preview</strong>
                    <div style={{ marginTop: 4, fontWeight: 600 }}>
                        {result.banner || 'RCM evaluation is for review only. Accounting posting is not enabled in this phase.'}
                    </div>
                </div>
            </div>

            {questions ? (
                <div style={{ ...grid, marginBottom: 10 }}>
                    {questions.map((q) => (
                        <div key={q.key} style={cell}>
                            <div style={k}>{q.label}</div>
                            {q.type === 'select' ? (
                                <select
                                    value={q.value || ''}
                                    onChange={(e) => onQuestionChange?.(q.key, e.target.value)}
                                    style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">— Select —</option>
                                    {(q.options || []).map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            ) : q.type === 'yesno' ? (
                                <select
                                    value={q.value === true || q.value === 'YES' ? 'YES' : q.value === false || q.value === 'NO' ? 'NO' : ''}
                                    onChange={(e) => onQuestionChange?.(q.key, e.target.value === 'YES' ? true : e.target.value === 'NO' ? false : '')}
                                    style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">—</option>
                                    <option value="YES">Yes</option>
                                    <option value="NO">No</option>
                                </select>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}

            <div style={grid}>
                <div style={cell}><div style={k}>GST Treatment</div><div style={v}>{result.treatmentLabel || result.treatment}</div></div>
                <div style={cell}><div style={k}>Suggested</div><div style={v}>{result.suggestedTreatmentLabel || result.suggestedTreatment || '—'}</div></div>
                <div style={cell}><div style={k}>Status</div><div style={v}>{result.statusText || '—'}</div></div>
                <div style={cell}><div style={k}>RCM Category</div><div style={v}>{result.rcmCategory || '—'}</div></div>
                <div style={cell}><div style={k}>Supplier GST Status</div><div style={v}>{result.supplierGstStatus || '—'}</div></div>
                <div style={cell}><div style={k}>Supplier GST Option</div><div style={v}>{result.supplierGstOption || '—'}</div></div>
                <div style={cell}><div style={k}>Place of Supply</div><div style={v}>{result.placeOfSupply || '—'}</div></div>
                <div style={cell}><div style={k}>Taxable Value</div><div style={v}>{Number(result.taxableValue || 0).toLocaleString('en-IN')}</div></div>
                <div style={cell}><div style={k}>Suggested GST Rate</div><div style={v}>{result.suggestedGstRate != null ? `${result.suggestedGstRate}%` : '—'}</div></div>
                <div style={cell}><div style={k}>CGST / SGST / IGST</div><div style={v}>{result.suggestedCgst || 0} / {result.suggestedSgst || 0} / {result.suggestedIgst || 0}</div></div>
                <div style={cell}><div style={k}>ITC Default</div><div style={v}>{result.itcDefault || '—'}</div></div>
                <div style={cell}><div style={k}>Confidence</div><div style={v}>{result.confidence || '—'}</div></div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                    <div style={{ fontWeight: 700 }}>Decision reason</div>
                    <div>{result.decisionReason || '—'}</div>
                    {result.matchedRule ? (
                        <div style={{ marginTop: 4 }}>
                            Matched rule: <code>{result.matchedRule.ruleCode}</code>
                            {result.matchedRule.statutoryReference ? ` — ${result.matchedRule.statutoryReference}` : ''}
                        </div>
                    ) : null}
                    {result.matchedDraftRule ? (
                        <div style={{ marginTop: 4 }}>
                            Draft rule (inactive): <code>{result.matchedDraftRule.ruleCode}</code>
                        </div>
                    ) : null}
                    {(result.matchedConditions || []).length ? (
                        <div style={{ marginTop: 4 }}>Conditions: {(result.matchedConditions || []).join('; ')}</div>
                    ) : null}
                    {(result.missingInformation || []).length ? (
                        <div style={{ marginTop: 4, color: '#b45309' }}>
                            Missing: {(result.missingInformation || []).join(', ')}
                        </div>
                    ) : null}
                    {(result.warnings || []).length ? (
                        <div style={{ marginTop: 4 }}>{(result.warnings || []).map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
                    ) : null}
                </div>
            </div>

            {canOverride ? (
                <div style={{ marginTop: 12 }}>
                    {!overrideOpen ? (
                        <button type="button" onClick={() => setOverrideOpen(true)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d97706', background: '#fff', cursor: 'pointer' }}>
                            Authorised override (preview only)
                        </button>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                            <div>
                                <div style={k}>Final treatment</div>
                                <select value={finalTreatment} onChange={(e) => setFinalTreatment(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
                                    <option value="">—</option>
                                    {['FORWARD_CHARGE', 'REVERSE_CHARGE', 'EXEMPT', 'NON_GST', 'NOT_APPLICABLE', 'REVIEW_REQUIRED'].map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                                <div style={k}>Reason</div>
                                <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                            </div>
                            <button
                                type="button"
                                disabled={!finalTreatment || !reason.trim()}
                                onClick={() => onOverride?.({ finalTreatment, reason: reason.trim() })}
                                style={{ padding: '6px 12px', borderRadius: 6, background: '#b45309', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 650 }}
                            >
                                Apply override preview
                            </button>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
