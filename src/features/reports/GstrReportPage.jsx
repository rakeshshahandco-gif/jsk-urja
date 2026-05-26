import React, { useState } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Download, FileSpreadsheet, ShieldCheck, Eye,
  AlertTriangle, AlertCircle, CheckCircle, RefreshCw,
  ChevronDown, ChevronUp, Settings
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  { label: 'April', value: '04' }, { label: 'May', value: '05' },
  { label: 'June', value: '06' }, { label: 'July', value: '07' },
  { label: 'August', value: '08' }, { label: 'September', value: '09' },
  { label: 'October', value: '10' }, { label: 'November', value: '11' },
  { label: 'December', value: '12' }, { label: 'January', value: '01' },
  { label: 'February', value: '02' }, { label: 'March', value: '03' },
];

const CUR_YEAR = new Date().getFullYear();
const FYS = [
  `${CUR_YEAR - 1}-${CUR_YEAR}`,
  `${CUR_YEAR}-${CUR_YEAR + 1}`,
  `${CUR_YEAR + 1}-${CUR_YEAR + 2}`,
];

function fyToRange(fy, monthVal) {
  if (!fy || !monthVal) return null;
  const [startYr, endYr] = fy.split('-').map(Number);
  // April–March FY: Apr–Dec use startYr, Jan–Mar use endYr
  const yr = Number(monthVal) >= 4 ? startYr : endYr;
  const lastDay = new Date(yr, Number(monthVal), 0).getDate();
  return {
    startDate: `${yr}-${monthVal}-01`,
    endDate: `${yr}-${monthVal}-${String(lastDay).padStart(2, '0')}`,
  };
}

function fmt(n) {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  if (severity === 'Blocking Error')
    return (
      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
        ⛔ Blocking
      </span>
    );
  return (
    <span style={{ background: '#fef9c3', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      ⚠ Warning
    </span>
  );
}

function SummaryCard({ title, value, color, icon }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '12px', padding: '20px 24px',
      border: `1px solid ${color}33`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      <div style={{ background: `${color}18`, borderRadius: '10px', padding: '10px', color, fontSize: '22px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{value}</div>
      </div>
    </div>
  );
}

function SheetPreviewTable({ title, data, columns }) {
  const [open, setOpen] = useState(false);
  if (!data || data.length === 0) return null;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: '#f8fafc', padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#1e293b',
        }}
      >
        <span>📋 {title} <span style={{ fontWeight: 400, color: '#64748b', marginLeft: '8px' }}>({data.length} rows)</span></span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f' }}>
                {columns.map(c => (
                  <th key={c} style={{ padding: '8px 12px', color: '#fff', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 20).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {columns.map(c => (
                    <td key={c} style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap' }}>
                      {row[c] !== undefined && row[c] !== null ? String(row[c]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.length > 20 && (
            <div style={{ padding: '10px 18px', fontSize: '12px', color: '#64748b', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              … and {data.length - 20} more rows. Download Excel for full data.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function GstrReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.roleName === 'admin' || user?.roleName === 'superadmin';

  const [fy, setFy] = useState('2025-2026');
  const [month, setMonth] = useState('04');

  const [loading, setLoading] = useState({ validate: false, preview: false, download: false, missingPos: false, syncPos: false });
  const [validation, setValidation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [missingPosList, setMissingPosList] = useState(null);
  const [gstr3bSummary, setGstr3bSummary] = useState(null);


  const range = fyToRange(fy, month);

  async function handleFindMissingPos() {
    setLoading(l => ({ ...l, missingPos: true }));
    setMissingPosList(null);
    try {
      const { data } = await api.get('/gst-reports/missing-pos-preview');
      setMissingPosList(data.preview);
      if (data.count === 0) toast.success('No missing Place of Supply found!');
      else toast.success(`Found ${data.count} invoices missing POS.`);
    } catch (e) {
      toast.error('Failed to fetch: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, missingPos: false }));
    }
  }

  async function handleSyncMissingPos() {
    if (!missingPosList || missingPosList.length === 0) return;
    const updates = missingPosList.filter(m => m.canUpdate).map(m => ({ id: m._id, suggestedPos: m.suggestedPos }));
    if (updates.length === 0) return toast.error('No updatable invoices found.');
    
    if (!window.confirm(`Are you sure you want to update Place of Supply for ${updates.length} invoices?`)) return;

    setLoading(l => ({ ...l, syncPos: true }));
    try {
      const { data } = await api.post('/gst-reports/sync-missing-pos', { updates });
      toast.success(`Successfully updated ${data.updatedCount} invoices!`);
      setMissingPosList(null);
      if (range) handleValidate();
    } catch (e) {
      toast.error('Sync failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, syncPos: false }));
    }
  }

  async function handleValidate() {
    if (!range) return toast.error('Select FY and Month first');
    setLoading(l => ({ ...l, validate: true }));
    setValidation(null);
    try {
      const { data } = await api.get('/gst-reports/validate', { params: range });
      setValidation(data);
      if (data.blockingErrors === 0) toast.success('✅ No blocking errors found!');
      else toast.error(`⛔ ${data.blockingErrors} blocking error(s) found. Fix before export.`);
    } catch (e) {
      toast.error('Validation failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, validate: false }));
    }
  }

  async function handlePreview() {
    if (!range) return toast.error('Select FY and Month first');
    setLoading(l => ({ ...l, preview: true }));
    setPreview(null);
    try {
      const { data } = await api.get('/gst-reports/preview', { params: range });
      setPreview(data.data);
      toast.success('Preview loaded');
    } catch (e) {
      toast.error('Preview failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, preview: false }));
    }
  }

  async function handleGSTR3B() {
    if (!range) return toast.error('Select FY and Month first');
    setLoading(l => ({ ...l, preview: true }));
    try {
      const { data } = await api.get('/gst-reports/gstr3b-summary', { params: range });
      setGstr3bSummary(data.data);
      toast.success('GSTR-3B Summary loaded');
    } catch (e) {
      toast.error('GSTR-3B failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, preview: false }));
    }
  }

  async function handleDownload() {
    if (!range) return toast.error('Select FY and Month first');
    if (validation && validation.blockingErrors > 0) {
      toast.error('⛔ Fix all blocking errors before downloading');
      return;
    }
    setLoading(l => ({ ...l, download: true }));
    try {
      const response = await api.get('/gst-reports/download', {
        params: range,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `GSTR1_${MONTHS.find(m => m.value === month)?.label}_${fy}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('GSTR-1 Excel downloaded!');
    } catch (e) {
      toast.error('Download failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(l => ({ ...l, download: false }));
    }
  }

  const blockingCount = validation?.blockingErrors || 0;
  const warnCount = validation?.warnings || 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
          <div style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
            <FileSpreadsheet size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>GSTR-1 Compliance Portal</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Sheet-wise GSTR-1 Export · GST Portal / Offline Tool Format · HSN B2B/B2C Split · Table 13 Docs · ₹1 Lakh B2CL Logic
            </p>
          </div>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 18px', marginTop: '12px', fontSize: '13px', color: '#1e40af', lineHeight: '1.7' }}>
          <strong>✅ May 2025+:</strong> HSN split into <code>hsn(b2b)</code> + <code>hsn(b2c)</code> &nbsp;|&nbsp;
          <strong>✅ Aug 2024+:</strong> B2CL threshold is <strong>₹1 Lakh</strong> (not ₹2.5 Lakh) &nbsp;|&nbsp;
          <strong>✅ Estimates excluded</strong> from all GST reporting &nbsp;|&nbsp;
          <strong>✅ Table 13 (docs)</strong> auto-generated from invoice series
        </div>
      </div>

      {/* Admin Utility */}
      {isAdmin && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: missingPosList ? '20px' : '0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} color="#475569" />
              Admin Utility: Sync Missing Place of Supply
            </h3>
            <button
              onClick={handleFindMissingPos}
              disabled={loading.missingPos}
              style={{
                background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 16px',
                fontSize: '13px', fontWeight: 600, cursor: loading.missingPos ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {loading.missingPos ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} />}
              Find Missing POS Invoices
            </button>
          </div>

          {missingPosList && missingPosList.length > 0 && (
            <div>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Invoice No.', 'Date', 'Customer', 'GSTIN', 'Current POS', 'Suggested POS'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', color: '#475569', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {missingPosList.map((m, i) => (
                      <tr key={m._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2563eb' }}>{m.invoiceNumber}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(m.invoiceDate).toLocaleDateString('en-GB')}</td>
                        <td style={{ padding: '8px 12px', color: '#334155' }}>{m.customerName}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#64748b' }}>{m.gstin}</td>
                        <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 600 }}>{m.currentPos}</td>
                        <td style={{ padding: '8px 12px', color: m.canUpdate ? '#16a34a' : '#d97706', fontWeight: 600 }}>{m.suggestedPos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSyncMissingPos}
                  disabled={loading.syncPos || !missingPosList.some(m => m.canUpdate)}
                  style={{
                    background: 'linear-gradient(135deg,#ca8a04,#a16207)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
                    fontSize: '14px', fontWeight: 600, cursor: loading.syncPos ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  {loading.syncPos ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
                  Update Blank POS Only
                </button>
              </div>
            </div>
          )}
          {missingPosList && missingPosList.length === 0 && (
             <div style={{ padding: '16px', background: '#f0fdf4', color: '#166534', borderRadius: '8px', marginTop: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <CheckCircle size={16} /> All GST invoices have a valid Place of Supply.
             </div>
          )}
        </div>
      )}

      {/* Period Selector */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '20px', margin: '0 0 20px 0' }}>
          📅 Select Return Period
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', maxWidth: '500px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FINANCIAL YEAR</label>
            <select
              value={fy}
              onChange={e => setFy(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#0f172a', outline: 'none' }}
            >
              {FYS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MONTH</label>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#0f172a', outline: 'none' }}
            >
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {range && (
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            📆 Period: <strong style={{ color: '#1e293b' }}>{range.startDate}</strong> to <strong style={{ color: '#1e293b' }}>{range.endDate}</strong>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handleValidate}
            disabled={loading.validate}
            style={{
              background: loading.validate ? '#e2e8f0' : 'linear-gradient(135deg,#0891b2,#0e7490)',
              color: loading.validate ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: '8px', padding: '11px 20px',
              fontSize: '14px', fontWeight: 600, cursor: loading.validate ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            {loading.validate ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={16} />}
            Validate Data
          </button>

          <button
            onClick={handlePreview}
            disabled={loading.preview}
            style={{
              background: loading.preview ? '#e2e8f0' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color: loading.preview ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: '8px', padding: '11px 20px',
              fontSize: '14px', fontWeight: 600, cursor: loading.preview ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            {loading.preview ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={16} />}
            Preview Sheets
          </button>

          <button
            onClick={handleGSTR3B}
            disabled={loading.preview}
            style={{
              background: loading.preview ? '#e2e8f0' : 'linear-gradient(135deg,#0d9488,#0f766e)',
              color: loading.preview ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: '8px', padding: '11px 20px',
              fontSize: '14px', fontWeight: 600, cursor: loading.preview ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            {loading.preview ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
            GSTR-3B Summary
          </button>

          <button
            onClick={handleDownload}
            disabled={loading.download || (validation && blockingCount > 0)}
            title={validation && blockingCount > 0 ? 'Fix blocking errors before download' : ''}
            style={{
              background: (loading.download || (validation && blockingCount > 0)) ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)',
              color: (loading.download || (validation && blockingCount > 0)) ? '#94a3b8' : '#fff',
              border: 'none', borderRadius: '8px', padding: '11px 20px',
              fontSize: '14px', fontWeight: 600, cursor: (loading.download || (validation && blockingCount > 0)) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            {loading.download ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
            Download GSTR-1 Excel
          </button>
        </div>
      </div>

      {/* Validation Results */}
      {validation && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 28px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>
            🛡️ Validation Results
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <SummaryCard title="Total Errors" value={validation.totalErrors} color="#6366f1" icon="🔍" />
            <SummaryCard title="Blocking Errors" value={blockingCount} color={blockingCount > 0 ? '#dc2626' : '#16a34a'} icon={blockingCount > 0 ? '⛔' : '✅'} />
            <SummaryCard title="Warnings" value={warnCount} color="#d97706" icon="⚠️" />
          </div>

          {validation.errors.length === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={22} color="#16a34a" />
              <div>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: '14px' }}>All Clear — Ready to Export!</div>
                <div style={{ color: '#166534', fontSize: '13px' }}>No validation errors found. You can safely download the GSTR-1 Excel.</div>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {['#', 'Severity', 'Error Type', 'Invoice No.', 'Date', 'Customer', 'GSTIN', 'Message', 'Suggested Fix'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', color: '#fff', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validation.errors.map((e, i) => (
                    <tr key={i} style={{ background: e.severity === 'Blocking Error' ? '#fff5f5' : i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px' }}><SeverityBadge severity={e.severity} /></td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>{e.errorType}</td>
                      <td style={{ padding: '8px 12px', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.invoiceNo || '–'}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{e.date || '–'}</td>
                      <td style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{e.customerName || '–'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#64748b', whiteSpace: 'nowrap' }}>{e.gstin || '–'}</td>
                      <td style={{ padding: '8px 12px', color: '#475569', minWidth: '200px' }}>{e.message}</td>
                      <td style={{ padding: '8px 12px', color: '#0891b2', minWidth: '200px' }}>{e.suggestedFix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Results */}
      {preview && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>
            👁️ GSTR-1 Sheet Preview
          </h3>

          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            <SummaryCard title="B2B Rows" value={preview.summary?.b2bCount || 0} color="#2563eb" icon="🏢" />
            <SummaryCard title="B2CL Rows" value={preview.summary?.b2clCount || 0} color="#7c3aed" icon="📦" />
            <SummaryCard title="B2CS Groups" value={preview.summary?.b2csCount || 0} color="#0891b2" icon="🛍️" />
            <SummaryCard title="HSN B2B" value={preview.summary?.hsnB2BCount || 0} color="#16a34a" icon="📊" />
            <SummaryCard title="HSN B2C" value={preview.summary?.hsnB2CCount || 0} color="#d97706" icon="📈" />
            <SummaryCard title="Docs Series" value={preview.summary?.docsCount || 0} color="#dc2626" icon="📄" />
            <SummaryCard title="CN/DN Rows" value={(preview.summary?.cdnrCount || 0) + (preview.summary?.cdnurCount || 0)} color="#db2777" icon="📜" />
          </div>

          {/* Sheet Tables */}
          <SheetPreviewTable
            title="B2B – Registered Customers"
            data={preview.b2b}
            columns={['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Central Tax', 'State/UT Tax', 'Integrated Tax']}
          />
          <SheetPreviewTable
            title="CDNR – Credit/Debit Notes (Registered)"
            data={preview.cdnr}
            columns={['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note date', 'Note Type', 'Invoice Number', 'Invoice date', 'Note Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax']}
          />
          <SheetPreviewTable
            title="CDNUR – Credit/Debit Notes (Unregistered)"
            data={preview.cdnur}
            columns={['Note Type', 'Note Number', 'Note date', 'Invoice Type', 'Invoice Number', 'Invoice date', 'Note Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax']}
          />
          <SheetPreviewTable
            title="B2CL – Inter-State Unregistered > ₹1 Lakh"
            data={preview.b2cl}
            columns={['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax']}
          />
          <SheetPreviewTable
            title="B2CS – Unregistered (Intra-State + Inter-State ≤ ₹1 Lakh)"
            data={preview.b2cs}
            columns={['Type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Central Tax', 'State/UT Tax', 'Integrated Tax']}
          />
          <SheetPreviewTable
            title="HSN Summary – B2B"
            data={preview.hsnB2B}
            columns={['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Central Tax Amount', 'State/UT Tax Amount', 'Integrated Tax Amount']}
          />
          <SheetPreviewTable
            title="HSN Summary – B2C"
            data={preview.hsnB2C}
            columns={['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Central Tax Amount', 'State/UT Tax Amount', 'Integrated Tax Amount']}
          />
          <SheetPreviewTable
            title="Docs / Table 13 – Document Summary"
            data={preview.docs}
            columns={['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled', 'Net Issued']}
          />
        </div>
      )}

      {/* GSTR-3B Summary */}
      {gstr3bSummary && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 28px', marginTop: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 20px 0' }}>
            📊 GSTR-3B Liability Summary (Table 3.1)
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#475569' }}>Nature of Supplies</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>Total Taxable Value</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>Integrated Tax</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>Central Tax</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>State/UT Tax</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#475569' }}>Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.taxableValue)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.igst)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.cgst)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.sgst)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.cess)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>(b) Outward taxable supplies (zero rated)</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardZeroRated?.taxableValue)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardZeroRated?.igst)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>₹{fmt(gstr3bSummary.table31?.outwardZeroRated?.cess)}</td>
                </tr>
                <tr style={{ background: '#f0fdf4' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#166534' }}>Net Total Liability</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt((gstr3bSummary.table31?.outwardTaxable?.taxableValue || 0) + (gstr3bSummary.table31?.outwardZeroRated?.taxableValue || 0))}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt((gstr3bSummary.table31?.outwardTaxable?.igst || 0) + (gstr3bSummary.table31?.outwardZeroRated?.igst || 0))}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.cgst)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt(gstr3bSummary.table31?.outwardTaxable?.sgst)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt((gstr3bSummary.table31?.outwardTaxable?.cess || 0) + (gstr3bSummary.table31?.outwardZeroRated?.cess || 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
            * Note: These values include net adjustments for Credit Notes (-) and Debit Notes (+). Use these values for Table 3.1 of GSTR-3B.
          </div>
        </div>
      )}

      {/* Sheets Info */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', marginTop: '24px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Excel Sheets Generated
        </h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['b2b', 'b2cl', 'b2cs', 'exp', 'cdnr', 'cdnur', 'exemp', 'at', 'atadj', 'hsn(b2b)', 'hsn(b2c)', 'docs', 'eco', 'b2ba', 'b2cla', 'b2csa', 'expa', 'cdnra', 'cdnura', 'ata', 'atadja', 'ecoa', 'supeco'].map(s => (
            <span key={s} style={{
              background: ['b2b', 'b2cl', 'b2cs', 'hsn(b2b)', 'hsn(b2c)', 'docs'].includes(s) ? '#dbeafe' : '#f1f5f9',
              color: ['b2b', 'b2cl', 'b2cs', 'hsn(b2b)', 'hsn(b2c)', 'docs'].includes(s) ? '#1e40af' : '#64748b',
              fontWeight: ['b2b', 'b2cl', 'b2cs', 'hsn(b2b)', 'hsn(b2c)', 'docs'].includes(s) ? 700 : 500,
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace',
            }}>
              {s}
            </span>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '12px 0 0 0' }}>
          <span style={{ color: '#1e40af', fontWeight: 600 }}>Blue = data populated</span> &nbsp;·&nbsp; Gray = empty template sheets (required by GST portal format)
        </p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
