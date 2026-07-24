import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { whatsappBulkApi } from '@/services/whatsappBulkApi';
import {
  DEFAULT_NUMBER_HEALTH_FILTER,
  FILTER_ALL,
  applyAvailabilityResultsToRows,
  applyNumberHealthFilters,
  applyValidateDataset,
  emptyStateMessage,
  lookupButtonState,
  numbersForAvailabilityLookup,
  parseNumberHealthTextarea,
  toNumberHealthListParams,
  normalizeHealthRow,
} from './numberHealthListUi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const warn = { background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 };
const metric = { ...card, padding: 12 };
const btn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const btnPrimary = { ...btn, background: '#0f766e', color: '#fff', borderColor: '#0f766e' };
const inp = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const tableWrap = { ...card, overflowX: 'auto' };

const WARNING =
  'This is an estimated delivery risk only. WhatsApp does not provide reliable confirmation that a recipient has blocked this number.';

export default function WhatsappBulkNumberHealthPage() {
  const [summary, setSummary] = useState(null);
  const [sourceRows, setSourceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rawText, setRawText] = useState('');
  const [filter, setFilter] = useState({ ...DEFAULT_NUMBER_HEALTH_FILTER });
  const [aiDraft, setAiDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [lookupProgress, setLookupProgress] = useState('');

  const visibleRows = useMemo(
    () => applyNumberHealthFilters(sourceRows, filter),
    [sourceRows, filter],
  );

  const emptyMsg = useMemo(
    () => emptyStateMessage({ sourceRowCount: sourceRows.length, visibleRowCount: visibleRows.length }),
    [sourceRows.length, visibleRows.length],
  );

  const lookupNumbers = useMemo(
    () => numbersForAvailabilityLookup(sourceRows, 20),
    [sourceRows],
  );

  const lookupUi = useMemo(
    () => lookupButtonState({
      lookupEnabled,
      hasPermission: true,
      busy,
      eligibleCount: lookupNumbers.length,
    }),
    [lookupEnabled, busy, lookupNumbers.length],
  );

  /** Reload latest records from server; preserves textarea and selected filters. */
  const load = async () => {
    setLoading(true);
    try {
      const [s, list, settings] = await Promise.all([
        whatsappBulkApi.numberHealthSummary(),
        whatsappBulkApi.numberHealthList({}),
        whatsappBulkApi.getSettings().catch(() => null),
      ]);
      setSummary(s);
      setSourceRows((list?.results || []).map(normalizeHealthRow));
      setLookupEnabled(settings?.whatsappAvailabilityCheckEnabled === true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load Number Health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => ([
    ['Total', summary?.total],
    ['Valid', summary?.valid],
    ['Invalid', summary?.invalid],
    ['Duplicates', summary?.duplicates],
    ['WA Available', summary?.whatsappAvailable],
    ['Not on WA', summary?.notOnWhatsApp],
    ['Unknown', summary?.unknown],
    ['Check Failed', summary?.checkFailed],
    ['Blacklisted', summary?.blacklisted],
    ['Opted Out', summary?.optedOut],
    ['Delivery Risk', summary?.possibleDeliveryRisk],
    ['Eligible', summary?.eligible],
  ]), [summary]);

  const parseItems = () => parseNumberHealthTextarea(rawText);

  const onValidate = async () => {
    const items = parseItems();
    if (!items.length) return toast.error('Enter numbers to validate');
    setBusy(true);
    try {
      const data = await whatsappBulkApi.numberHealthValidate(items);
      const next = applyValidateDataset(data);
      setFilter(next.filter);
      setSourceRows(next.sourceRows);
      setSummary(next.summary);
      setRawText('');
      toast.success(`Validated ${data.summary?.total || next.sourceRows.length || 0} numbers`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Validation failed');
    } finally { setBusy(false); }
  };

  const onLookup = async () => {
    if (lookupUi.disabled) return toast.error(lookupUi.reason || 'Availability check unavailable');
    const nums = lookupNumbers;
    if (!nums.length) return toast.error('No valid normalized numbers to check');
    setBusy(true);
    setLookupProgress(`Checking 0/${nums.length}…`);
    try {
      const data = await whatsappBulkApi.numberHealthAvailabilityCheck({ normalizedNumbers: nums });
      const results = data?.results || data?.lookup?.results || [];
      if (results.length) {
        setSourceRows((prev) => applyAvailabilityResultsToRows(prev, results));
      }
      setLookupProgress(`Checked ${data?.lookedUp ?? results.length}/${nums.length}${data?.stoppedReason ? ` (stopped: ${data.stoppedReason})` : ''}`);
      toast.success(data?.stoppedReason
        ? `Availability lookup stopped (${data.stoppedReason})`
        : `Availability lookup finished for ${data?.lookedUp ?? nums.length} number(s)`);
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Lookup failed / disabled';
      if (/not connected|SESSION_NOT_CONNECTED/i.test(msg)) {
        toast.error('WhatsApp session not connected');
      } else if (/disabled/i.test(msg)) {
        toast.error('WhatsApp availability lookup is disabled for this company');
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    try {
      const blob = await whatsappBulkApi.numberHealthExport(toNumberHealthListParams(filter));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whatsapp-bulk-number-health.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    }
  };

  const onAiDraft = async () => {
    setBusy(true);
    try {
      const data = await whatsappBulkApi.aiAssist({
        action: 'number_health_management_summary',
        language: 'en',
        invalidCount: summary?.invalid || 0,
        duplicateCount: summary?.duplicates || 0,
        eligibleCount: summary?.eligible || 0,
      });
      setAiDraft(data.draftText || '');
      toast.success('AI draft generated (review required)');
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI assist disabled or failed');
    } finally { setBusy(false); }
  };

  if (loading && !summary && sourceRows.length === 0) return <div style={page}>Loading Number Health...</div>;

  return (
    <div style={page}>
      <h1 style={{ marginBottom: 8 }}>WhatsApp Number Health</h1>
      <p style={{ color: '#64748b', marginBottom: 12 }}>Validate, dedupe and review campaign recipients. Does not change WhatsApp Chat or Customer/Lead masters.</p>
      <div style={warn}>{summary?.warning || WARNING}</div>

      <div style={grid}>
        {cards.map(([label, value]) => (
          <div key={label} style={metric}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value ?? 0}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Validate numbers (one per line)</label>
        <textarea style={{ ...inp, minHeight: 90, marginTop: 6 }} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder={'+91 99207 30373\n09920730373\n9920730373'} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" style={btnPrimary} disabled={busy} onClick={onValidate}>Validate Selected</button>
          <button type="button" style={btn} disabled={lookupUi.disabled} onClick={onLookup}>Check WhatsApp Availability</button>
          <button type="button" style={btn} disabled={busy} onClick={async () => { setBusy(true); try { await whatsappBulkApi.numberHealthRecheckUnknown({}); await load(); toast.success('Recheck unknown done'); } catch (e) { toast.error(e.response?.data?.message || 'Recheck failed'); } finally { setBusy(false); } }}>Recheck Unknown</button>
          <button type="button" style={btn} onClick={onExport}>Export Report</button>
          <button type="button" style={btn} disabled={busy} onClick={onAiDraft}>AI Report Draft</button>
          <button type="button" style={btn} onClick={load}>Refresh</button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Availability lookup is disabled by default, sequential only, and never sends messages. Live Chat session is not modified.</p>
        {lookupUi.reason ? <p style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{lookupUi.reason}</p> : null}
        {lookupProgress ? <p style={{ fontSize: 12, color: '#0f766e', marginTop: 6 }}>{lookupProgress}</p> : null}
      </div>

      {aiDraft ? (
        <div style={{ ...card, marginBottom: 16, background: '#f8fafc' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>AI Report Assistant (DRAFT — human review required)</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{aiDraft}</div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select style={inp} value={filter.validationStatus} onChange={(e) => setFilter({ ...filter, validationStatus: e.target.value })}>
          <option value={FILTER_ALL}>ALL</option>
          <option value="VALID">VALID</option>
          <option value="INVALID">INVALID</option>
          <option value="UNKNOWN">UNKNOWN</option>
        </select>
        <select style={inp} value={filter.availabilityStatus} onChange={(e) => setFilter({ ...filter, availabilityStatus: e.target.value })}>
          <option value={FILTER_ALL}>ALL</option>
          <option value="WHATSAPP_AVAILABLE">AVAILABLE</option>
          <option value="NOT_ON_WHATSAPP">NOT ON WA</option>
          <option value="UNKNOWN">UNKNOWN</option>
          <option value="NOT_CHECKED">NOT CHECKED</option>
        </select>
        <select style={inp} value={filter.riskLevel} onChange={(e) => setFilter({ ...filter, riskLevel: e.target.value })}>
          <option value={FILTER_ALL}>ALL</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="UNKNOWN">UNKNOWN</option>
        </select>
        <button type="button" style={btnPrimary} onClick={load}>Apply Filters</button>
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b' }}>
              {['Name', 'Source', 'Original', 'Normalized', 'Validation', 'Reason', 'WhatsApp', 'Dup', 'Blacklist', 'Opt-out', 'Risk', 'Eligible', 'Checked'].map((h) => (
                <th key={h} style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={13} style={{ padding: 16, color: '#94a3b8' }}>{emptyMsg}</td></tr>
            ) : visibleRows.map((r, idx) => (
              <tr key={`${r.normalizedNumber || r._id || 'row'}-${r.originalNumberSample || ''}-${idx}`}>
                <td style={{ padding: '8px 6px' }}>{r.displayName || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{r.sourceType || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{r.originalNumberSample || r.originalNumber || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{r.normalizedNumber || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{r.validationStatus}</td>
                <td style={{ padding: '8px 6px' }}>{r.reasonCode || r.validationReason || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{r.availabilityStatus}</td>
                <td style={{ padding: '8px 6px' }}>{r.duplicateCount || 0}</td>
                <td style={{ padding: '8px 6px' }}>{r.blacklisted ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px 6px' }}>{r.optedOut ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px 6px' }}>{r.riskLevel || 'UNKNOWN'}</td>
                <td style={{ padding: '8px 6px' }}>{r.eligible ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px 6px' }}>{r.checkedAt ? new Date(r.checkedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
