import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import {
    buildHistoryClearPayload,
    facebookClearLabel,
    historyClearErrorMessage,
    isClearConfirmEnabled,
    notifyHistoryCleared,
    validateClearConfirm,
} from './clearHistoryUi.util';

const field = { padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, width: '100%' };
const btn = (bg = '#2563eb', color = '#fff', enabled = true) => ({
    padding: '8px 12px',
    borderRadius: 8,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    background: bg,
    color,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 13,
    opacity: enabled ? 1 : 0.45,
});

const SCOPES = [
    ['facebook_current', 'Current Facebook search/history'],
    ['facebook_all', 'All Facebook extraction history'],
    ['instagram', 'Instagram extraction history'],
    ['web', 'Google / Public Web extraction history'],
    ['linkedin_x', 'LinkedIn / X extraction history'],
    ['saved_search_runs', 'Saved Search run history'],
    ['processing', 'Processing / search-job history'],
    ['contactable_prospects', 'Contactable Prospect extraction history'],
    ['all_extractor', 'All Data Extractor extraction history'],
];

function canClearHistory(user, hasRole, hasPermission) {
    const role = String(user?.roleName || user?.role?.name || '').trim().toLowerCase();
    const isAdmin = ['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role)
        || hasRole?.('superadmin') || hasRole?.('admin');
    return isAdmin && (hasPermission?.('data_extractor.extractor.settings') === true || isAdmin);
}

export function useCanClearExtractorHistory() {
    const { user, hasRole, hasPermission } = useAuth();
    return canClearHistory(user, hasRole, hasPermission);
}

export default function DataExtractorClearHistoryModal({
    open,
    onClose,
    defaultScope = 'facebook_current',
    keyword = '',
    location = '',
    freshMode = false,
    onCleared,
}) {
    const allowed = useCanClearExtractorHistory();
    const [scope, setScope] = useState(defaultScope);
    const [kw, setKw] = useState(keyword);
    const [loc, setLoc] = useState(location);
    const [matchKeyword, setMatchKeyword] = useState(false);
    const [matchLocation, setMatchLocation] = useState(false);
    const [reason, setReason] = useState('Fresh extraction test');
    const [confirmText, setConfirmText] = useState('');
    const [confirmAll, setConfirmAll] = useState(false);
    const [includeProtected, setIncludeProtected] = useState(false);
    const [confirmProtected, setConfirmProtected] = useState(false);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [retained, setRetained] = useState([]);

    useEffect(() => {
        if (!open) return;
        setScope(defaultScope);
        setKw(keyword);
        setLoc(location);
        const filterOn = Boolean(freshMode && defaultScope !== 'facebook_all');
        setMatchKeyword(filterOn && Boolean(keyword));
        setMatchLocation(filterOn && Boolean(location));
        setConfirmText('');
        setConfirmAll(false);
        setIncludeProtected(false);
        setConfirmProtected(false);
        setPreview(null);
        setError('');
        setRetained([]);
        setBusy('');
    }, [open, defaultScope, keyword, location, freshMode]);

    if (!open) return null;
    if (!allowed) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40000 }} onClick={onClose}>
                <div style={{ width: 420, background: '#fff', borderRadius: 12, padding: 16 }} onClick={(e) => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0 }}>Clear History</h3>
                    <p style={{ fontSize: 13 }}>Only admin can clear Data Extractor extraction history.</p>
                    <button type="button" style={btn('#334155')} onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    const payload = () => buildHistoryClearPayload({
        scope,
        keyword: kw,
        location: loc,
        matchKeyword,
        matchLocation,
        reason,
        includeProtected: includeProtected === true && confirmProtected === true,
    });

    const showFail = (err) => {
        const msg = typeof err === 'string' ? (err.startsWith('Unable to') ? err : `Unable to clear history: ${err}`) : historyClearErrorMessage(err);
        setError(msg);
        toast.error(msg);
    };

    const onPreview = async () => {
        setBusy('preview');
        setError('');
        try {
            setPreview(await dataExtractorApi.previewExtractorHistoryClear(payload()));
        } catch (e) {
            showFail(e);
        } finally {
            setBusy('');
        }
    };

    const onConfirm = async () => {
        const check = validateClearConfirm({
            confirmText,
            scope,
            confirmAll,
            includeProtected,
            confirmProtected,
        });
        if (!check.ok) {
            showFail(check.error);
            return;
        }
        setBusy('clear');
        setError('');
        try {
            let counts = preview;
            if (!counts) {
                counts = await dataExtractorApi.previewExtractorHistoryClear(payload());
                setPreview(counts);
            }
            const res = await dataExtractorApi.executeExtractorHistoryClear({
                ...payload(),
                confirm: true,
                confirmText: 'CLEAR',
                confirmAll,
                confirmProtected: includeProtected === true && confirmProtected === true,
                includeProtected: includeProtected === true && confirmProtected === true,
            });
            const deleted = res.rawCapturesDeleted || 0;
            toast.success(`Cleared ${deleted} extraction records`);
            setRetained(res.retained || []);
            notifyHistoryCleared(res);
            onCleared?.(res);
            onClose();
        } catch (e) {
            showFail(e);
        } finally {
            setBusy('');
        }
    };

    const c = preview?.counts || {};
    const confirmEnabled = isClearConfirmEnabled({ busy, confirmText });
    const opLabel = facebookClearLabel(scope, matchKeyword, matchLocation);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40000 }} onClick={onClose}>
            <div style={{ width: 560, maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 12, padding: 16 }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Clear Data Extractor History</h3>
                <p style={{ fontSize: 13, color: '#64748b' }}>
                    Extraction/test history only. CRM Leads, Customers, Sales, WhatsApp, GST, and Verified/Converted records stay by default.
                </p>
                <label style={{ fontSize: 12, fontWeight: 600 }}>What to clear</label>
                <select
                    value={scope}
                    onChange={(e) => {
                        const next = e.target.value;
                        setScope(next);
                        setPreview(null);
                        if (next === 'facebook_all') {
                            setMatchKeyword(false);
                            setMatchLocation(false);
                        }
                    }}
                    style={{ ...field, margin: '4px 0 10px' }}
                >
                    {SCOPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                {scope === 'facebook_all' && (matchKeyword || matchLocation) ? (
                    <p style={{ fontSize: 12, color: '#9a3412' }}>Filters are on — this is <strong>{opLabel}</strong>, not every Facebook record.</p>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                        <label style={{ fontSize: 12 }}>Current keyword</label>
                        <input value={kw} onChange={(e) => setKw(e.target.value)} style={field} />
                        <label style={{ fontSize: 12 }}><input type="checkbox" checked={matchKeyword} onChange={(e) => setMatchKeyword(e.target.checked)} /> Filter by keyword</label>
                    </div>
                    <div>
                        <label style={{ fontSize: 12 }}>Current location</label>
                        <input value={loc} onChange={(e) => setLoc(e.target.value)} style={field} />
                        <label style={{ fontSize: 12 }}><input type="checkbox" checked={matchLocation} onChange={(e) => setMatchLocation(e.target.checked)} /> Filter by location</label>
                    </div>
                </div>
                <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Reason</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} style={field} />
                <p style={{ fontSize: 12, color: '#9a3412' }}>Prefer Start Fresh Search (source + keyword + location) over Clear All.</p>
                <button type="button" style={btn('#334155', '#fff', !busy)} disabled={!!busy} onClick={onPreview}>
                    {busy === 'preview' ? 'Counting…' : 'Show counts'}
                </button>
                {preview ? (
                    <div style={{ marginTop: 12, fontSize: 13, background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                        <div>Facebook source records: <strong>{c.facebookRawCaptures || 0}</strong></div>
                        <div>Community records: <strong>{c.facebookCommunityRecords || c.facebookRawCaptures || 0}</strong></div>
                        <div>Instagram records: <strong>{c.instagramRecords || 0}</strong></div>
                        <div>Web records: <strong>{c.webRecords || 0}</strong></div>
                        <div>Jobs/history: <strong>{(c.discoveryJobs || 0) + (c.processingJobs || 0)}</strong></div>
                        <div>Company identities affected: <strong>{c.companyIdentitiesAffected || 0}</strong></div>
                        <div>Protected verified: <strong>{c.protectedVerified || 0} (kept)</strong></div>
                        <div>Converted leads: <strong>{c.convertedSkipped || 0} (CRM records kept)</strong></div>
                        <p style={{ fontSize: 12, color: '#0f766e' }}>{preview.protectedNote}</p>
                        <p style={{ fontSize: 12 }}>{preview.crmNote}</p>
                    </div>
                ) : (
                    <p style={{ fontSize: 12, color: '#64748b' }}>Show counts is optional. Typing CLEAR and clicking the red button will count, then clear.</p>
                )}
                <label style={{ display: 'block', fontSize: 12, marginTop: 12 }}>
                    <input
                        type="checkbox"
                        checked={includeProtected}
                        onChange={(e) => {
                            setIncludeProtected(e.target.checked);
                            if (!e.target.checked) setConfirmProtected(false);
                        }}
                    />
                    {' '}Also clear protected verified/converted extractor records (leave unchecked)
                </label>
                {includeProtected ? (
                    <label style={{ display: 'block', fontSize: 12, color: '#b91c1c' }}>
                        <input type="checkbox" checked={confirmProtected} onChange={(e) => setConfirmProtected(e.target.checked)} />
                        {' '}I understand this can remove verified extractor evidence (CRM Leads still stay)
                    </label>
                ) : null}
                {scope === 'all_extractor' ? (
                    <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                        <input type="checkbox" checked={confirmAll} onChange={(e) => setConfirmAll(e.target.checked)} />
                        {' '}CLEAR ALL EXTRACTOR HISTORY (second confirmation)
                    </label>
                ) : null}
                <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Type CLEAR</label>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CLEAR" style={field} />
                {error ? (
                    <div style={{ marginTop: 10, padding: 10, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
                        {error}
                    </div>
                ) : null}
                {(retained || []).length ? (
                    <div style={{ marginTop: 10, fontSize: 12 }}>
                        {retained.map((row) => (
                            <div key={`${row.title}-${row.reason}`}>{row.title || '(untitled)'} — {row.reason}</div>
                        ))}
                    </div>
                ) : null}
                <div style={{ marginTop: 12 }}>
                    <button
                        type="button"
                        data-testid="clear-selected-history"
                        style={btn('#b91c1c', '#fff', confirmEnabled)}
                        disabled={!!busy}
                        onClick={onConfirm}
                    >
                        {busy === 'clear' ? 'Clearing…' : 'CLEAR SELECTED HISTORY'}
                    </button>
                    {' '}
                    <button type="button" style={btn('#fff', '#334155', !busy)} onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
