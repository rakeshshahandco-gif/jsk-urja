import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

const sectionStyle = {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.65,
    color: '#334155',
};

export default function DataExtractorUserGuide({ variant = 'full', providerStatus = null }) {
    const [open, setOpen] = useState(variant === 'full');
    const compact = variant === 'compact';

    const webOk = providerStatus?.configured || providerStatus?.webSearchProviders?.some((p) => p.id === 'google_cse' && p.configured);
    const placesOk = providerStatus?.googleBusiness?.configured;
    const aiOn = providerStatus?.aiLayer?.aiEnabled;

    const checklist = [
        { label: 'Company Module Allocation → Data Extractor enabled', done: null },
        { label: 'Settings → Enable Data Extractor for this company', done: null },
        { label: 'Google CSE (Web Search) configured', done: webOk },
        { label: 'Google Places (Business / Maps) configured', done: placesOk },
        { label: 'AI layer enabled (optional)', done: aiOn },
    ];

    const body = (
        <>
            <p style={{ margin: '0 0 12px' }}>
                Find B2B companies by <strong>keyword + city</strong> without knowing URLs first.
                Everything stays in <strong>preview/draft</strong> until you save, approve, and convert.
            </p>

            <div style={sectionStyle}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Step 1 — Turn on (superadmin, once per company)</strong>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>Platform Setup → <strong>Company Module Allocation</strong> → tick <em>Data Extractor</em></li>
                    <li>
                        <Link to={PATHS.DATA_EXTRACTOR.SETTINGS}>Settings</Link>
                        {' '}
                        → enable <em>Data Extractor for this company</em> → Save → re-login if menu missing
                    </li>
                </ol>
            </div>

            <div style={sectionStyle}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Step 2 — Add API keys (backend/.env, restart)</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '6px 4px' }}>Priority</th>
                            <th style={{ padding: '6px 4px' }}>Purpose</th>
                            <th style={{ padding: '6px 4px' }}>Env vars</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style={{ padding: '6px 4px' }}>1</td><td>Web search (websites, trade portals)</td><td><code>EXTRACTOR_GOOGLE_CSE_API_KEY</code>, <code>EXTRACTOR_GOOGLE_CSE_CX</code></td></tr>
                        <tr><td style={{ padding: '6px 4px' }}>2</td><td>Google Business / Maps</td><td><code>GOOGLE_MAPS_API_KEY</code> or <code>EXTRACTOR_GOOGLE_PLACES_API_KEY</code></td></tr>
                        <tr><td style={{ padding: '6px 4px' }}>3</td><td>IndiaMART / TradeIndia inbox</td><td><code>INDIAMART_GLUSR_CRM_KEY</code>, <code>TRADEINDIA_*</code></td></tr>
                        <tr><td style={{ padding: '6px 4px' }}>4</td><td>AI translation (Alibaba / China)</td><td><code>EXTRACTOR_OPENAI_API_KEY</code> + enable AI in Settings</td></tr>
                    </tbody>
                </table>
            </div>

            {!compact && (
                <>
                    <div style={sectionStyle}>
                        <strong style={{ display: 'block', marginBottom: 8 }}>Step 3 — Keyword search workflow</strong>
                        <ol style={{ margin: 0, paddingLeft: 20 }}>
                            <li>
                                Open
                                {' '}
                                <Link to={PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH}>Keyword Search</Link>
                            </li>
                            <li>Enter keyword, city, state, country — pick a <strong>Source</strong></li>
                            <li>Review results in <strong>Preview</strong> (nothing saved yet)</li>
                            <li><strong>Save Draft</strong> → selected rows go to Extracted Leads</li>
                            <li><strong>Approve</strong> → <strong>Convert</strong> to Lead / Customer / Supplier</li>
                        </ol>
                    </div>

                    <div style={sectionStyle}>
                        <strong style={{ display: 'block', marginBottom: 8 }}>Which source to use?</strong>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                            <li><strong>Web Search</strong> — company websites (global)</li>
                            <li><strong>Google Business / Maps</strong> — local businesses with phone & address</li>
                            <li><strong>IndiaMART / TradeIndia</strong> — your paid seller inbox inquiries</li>
                            <li><strong>Justdial</strong> — webhook leads from your account manager</li>
                            <li><strong>Alibaba / Made-in-China</strong> — public listings (enable AI for Chinese text)</li>
                            <li><strong>Facebook / Instagram</strong> — public business pages only</li>
                        </ul>
                    </div>

                    <div style={sectionStyle}>
                        <strong style={{ display: 'block', marginBottom: 8 }}>Tips</strong>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                            <li>
                                <Link to={PATHS.DATA_EXTRACTOR.HISTORY}>Search History</Link>
                                {' '}
                                → <em>Re-run</em> repeats a search; <em>Run AI</em> re-scores preview rows
                            </li>
                            <li>Use Test buttons on this Settings page after each API change</li>
                            <li>Duplicates are flagged — confirmed duplicates cannot convert</li>
                            <li>No auto-save, no WhatsApp/email from this module</li>
                        </ul>
                    </div>
                </>
            )}

            {providerStatus && (
                <div style={{ ...sectionStyle, marginBottom: 0 }}>
                    <strong style={{ display: 'block', marginBottom: 8 }}>Setup checklist</strong>
                    <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'none' }}>
                        {checklist.map((item) => (
                            <li key={item.label} style={{ marginBottom: 4 }}>
                                {item.done === true && <span style={{ color: '#166534' }}>✓ </span>}
                                {item.done === false && <span style={{ color: '#92400e' }}>○ </span>}
                                {item.done === null && <span style={{ color: '#94a3b8' }}>· </span>}
                                {item.label}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );

    if (compact) {
        return (
            <div style={{ ...sectionStyle, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? 12 : 0 }}>
                    <strong>Quick Start Guide</strong>
                    <button type="button" onClick={() => setOpen((v) => !v)} style={{ fontSize: 12, cursor: 'pointer' }}>
                        {open ? 'Hide' : 'Show guide'}
                    </button>
                </div>
                {open && body}
                {!open && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                        Enable module → add Google CSE keys → Keyword Search → Preview → Save → Approve → Convert.
                        {' '}
                        <Link to={PATHS.DATA_EXTRACTOR.SETTINGS}>Full guide in Settings</Link>
                    </p>
                )}
            </div>
        );
    }

    return (
        <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Quick Start Guide</h3>
            {body}
        </div>
    );
}
