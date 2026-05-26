import React, { useState, useMemo, useRef } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
  FileText, Download, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, ShieldCheck, BarChart2,
  Upload, Trash2, CheckCircle, AlertCircle, Clock, ArrowLeftRight
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CUR_YEAR = new Date().getFullYear();
const FYS = [`${CUR_YEAR - 2}-${CUR_YEAR - 1}`, `${CUR_YEAR - 1}-${CUR_YEAR}`, `${CUR_YEAR}-${CUR_YEAR + 1}`];
const MONTHS_ORDER = ['04','05','06','07','08','09','10','11','12','01','02','03'];
const MONTH_LABEL  = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' };

function fmt(n) { return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function r2(n) { return Math.round((n || 0) * 100) / 100; }
function diffColor(d) { return Math.abs(d) < 0.01 ? '#16a34a' : d > 0 ? '#f59e0b' : '#dc2626'; }
function diffLabel(d) { return Math.abs(d) < 0.01 ? 'Matched' : d > 0 ? 'Books Higher' : 'Portal Higher'; }

// ─── Styles ───────────────────────────────────────────────────────────────────
const TH = { background:'#1e3a5f', color:'#fff', padding:'10px 14px', fontSize:'11px', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid #164272', textAlign:'left', whiteSpace:'nowrap' };
const THR = { ...TH, textAlign:'right' };
const TD  = { padding:'10px 14px', fontSize:'13px', color:'#1e293b', borderBottom:'1px solid #f1f5f9' };
const TDR = { ...TD, textAlign:'right', fontWeight:600 };
const TOTROW = { background:'#eef2f9', fontWeight:700 };

// ─── Sub-components ───────────────────────────────────────────────────────────
function Tab({ label, active, onClick, icon: Icon }) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'10px 18px', borderRadius:'8px 8px 0 0', border:'none', background: active ? '#fff' : 'transparent', color: active ? '#1e3a5f' : '#64748b', fontWeight: active ? 700 : 500, fontSize:'14px', cursor:'pointer', borderBottom: active ? '2px solid #1e3a5f' : '2px solid transparent' }}>
      {Icon && <Icon size={15} />}{label}
    </button>
  );
}

function SectionCard({ title, subtitle, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 1px 6px rgba(0,0,0,.08)', marginBottom:'20px', overflow:'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', cursor:'pointer', borderBottom: open ? '1px solid #e2e8f0' : 'none', background:'#f8fafc' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {Icon && <Icon size={18} color="#1e3a5f" />}
          <div>
            <div style={{ fontWeight:700, fontSize:'15px', color:'#1e293b' }}>{title}</div>
            {subtitle && <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>{subtitle}</div>}
          </div>
        </div>
        {open ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function StatCard({ label, value, color = '#1e3a5f' }) {
  return (
    <div style={{ background:'#fff', borderRadius:'10px', padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,.07)', minWidth:'160px', flex:'1' }}>
      <div style={{ fontSize:'11px', fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.5px' }}>{label}</div>
      <div style={{ fontSize:'20px', fontWeight:800, color, marginTop:'6px' }}>₹{fmt(value)}</div>
    </div>
  );
}

// ─── Table 4 ──────────────────────────────────────────────────────────────────
function Table4({ data }) {
  const rows = [
    { label:'4A – B2B Supplies (Registered)', d:data.b2b },
    { label:'4B – Zero-Rated (Exports / SEZ)', d:data.exports },
    { label:'4C – B2C Inter-State (> ₹1L)', d:data.b2cLarge },
    { label:'4E – B2C Others', d:data.b2cSmall },
  ];
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>
          <th style={TH}>Nature of Supply</th><th style={THR}>Taxable Value (₹)</th><th style={THR}>IGST</th><th style={THR}>CGST</th><th style={THR}>SGST</th><th style={THR}>CESS</th>
        </tr></thead>
        <tbody>
          {rows.map(({ label, d }) => (
            <tr key={label}><td style={TD}>{label}</td><td style={TDR}>{fmt(d.taxableValue)}</td><td style={TDR}>{fmt(d.igst)}</td><td style={TDR}>{fmt(d.cgst)}</td><td style={TDR}>{fmt(d.sgst)}</td><td style={TDR}>{fmt(d.cess)}</td></tr>
          ))}
          <tr style={TOTROW}>
            <td style={{ ...TD, fontWeight:700 }}>TOTAL</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.taxableValue)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.igst)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.cgst)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.sgst)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.cess)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Table5({ data }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr><th style={TH}>Category</th><th style={THR}>Taxable Value (₹)</th></tr></thead>
        <tbody>
          <tr><td style={TD}>5A – Nil Rated / Exempted</td><td style={TDR}>{fmt(data.nilExempt.taxableValue)}</td></tr>
          <tr><td style={TD}>5B – Non-GST Supplies</td><td style={TDR}>{fmt(data.nonGST.taxableValue)}</td></tr>
          <tr style={TOTROW}><td style={{ ...TD, fontWeight:700 }}>TOTAL</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.taxableValue)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Table6({ data }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr><th style={TH}>ITC Category</th><th style={THR}>IGST</th><th style={THR}>CGST</th><th style={THR}>SGST</th></tr></thead>
        <tbody>
          <tr><td style={TD}>6B – Regular ITC</td><td style={TDR}>{fmt(data.regular.igst)}</td><td style={TDR}>{fmt(data.regular.cgst)}</td><td style={TDR}>{fmt(data.regular.sgst)}</td></tr>
          <tr><td style={TD}>6C – RCM ITC</td><td style={TDR}>{fmt(data.rcm.igst)}</td><td style={TDR}>{fmt(data.rcm.cgst)}</td><td style={TDR}>{fmt(data.rcm.sgst)}</td></tr>
          <tr style={TOTROW}><td style={{ ...TD, fontWeight:700 }}>TOTAL</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.igst)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.cgst)}</td><td style={{ ...TDR, fontWeight:700 }}>{fmt(data.total.sgst)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Table9({ table9, table10, table11 }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr><th style={TH}>Description</th><th style={THR}>IGST</th><th style={THR}>CGST</th><th style={THR}>SGST</th><th style={THR}>CESS</th></tr></thead>
        <tbody>
          <tr><td style={TD}>Output Tax Liability</td><td style={TDR}>{fmt(table9.outputTax.igst)}</td><td style={TDR}>{fmt(table9.outputTax.cgst)}</td><td style={TDR}>{fmt(table9.outputTax.sgst)}</td><td style={TDR}>{fmt(table9.outputTax.cess)}</td></tr>
          <tr><td style={{ ...TD, color:'#16a34a' }}>(+) Debit Notes</td><td style={{ ...TDR, color:'#16a34a' }}>{fmt(table10.igst)}</td><td style={{ ...TDR, color:'#16a34a' }}>{fmt(table10.cgst)}</td><td style={{ ...TDR, color:'#16a34a' }}>{fmt(table10.sgst)}</td><td style={{ ...TDR, color:'#16a34a' }}>{fmt(table10.cess)}</td></tr>
          <tr><td style={{ ...TD, color:'#dc2626' }}>(-) Credit Notes</td><td style={{ ...TDR, color:'#dc2626' }}>{fmt(table11.igst)}</td><td style={{ ...TDR, color:'#dc2626' }}>{fmt(table11.cgst)}</td><td style={{ ...TDR, color:'#dc2626' }}>{fmt(table11.sgst)}</td><td style={{ ...TDR, color:'#dc2626' }}>{fmt(table11.cess)}</td></tr>
          <tr style={{ ...TOTROW, background:'#1e3a5f' }}>
            <td style={{ ...TD, color:'#fff', fontWeight:700 }}>NET TAX PAYABLE</td><td style={{ ...TDR, color:'#fff', fontWeight:700 }}>{fmt(table9.netTax.igst)}</td><td style={{ ...TDR, color:'#fff', fontWeight:700 }}>{fmt(table9.netTax.cgst)}</td><td style={{ ...TDR, color:'#fff', fontWeight:700 }}>{fmt(table9.netTax.sgst)}</td><td style={{ ...TDR, color:'#fff', fontWeight:700 }}>{fmt(table9.netTax.cess)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function HsnTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={{ padding:'20px', color:'#64748b', textAlign:'center' }}>No HSN data.</div>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>
          <th style={TH}>HSN</th><th style={TH}>Description</th><th style={TH}>UOM</th><th style={THR}>Qty</th><th style={THR}>Taxable (₹)</th><th style={THR}>IGST</th><th style={THR}>CGST</th><th style={THR}>SGST</th><th style={THR}>GST%</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i%2===0?'#fff':'#f8fafc' }}>
              <td style={{ ...TD, fontWeight:600 }}>{r.hsn}</td><td style={{ ...TD, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description}</td><td style={TD}>{r.uom}</td><td style={TDR}>{fmt(r.qty)}</td><td style={TDR}>{fmt(r.taxableValue)}</td><td style={TDR}>{fmt(r.igst)}</td><td style={TDR}>{fmt(r.cgst)}</td><td style={TDR}>{fmt(r.sgst)}</td><td style={{ ...TDR, color:'#1e3a5f' }}>{r.gstRate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Import Tab ───────────────────────────────────────────────────────────────
function ImportTab({ fy, onImportDone }) {
  const [formType, setFormType] = useState('GSTR1');
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const fileRef = useRef();

  async function loadImports() {
    setLoadingList(true);
    try {
      const res = await api.get('/gst-reports/gstr9-imports', { params: { fy } });
      setImports(res.data.data);
    } catch { toast.error('Failed to load import list'); }
    finally { setLoadingList(false); }
  }

  React.useEffect(() => { loadImports(); }, [fy]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('formType', formType);
    setUploading(true);
    try {
      const res = await api.post('/gst-reports/gstr9-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`${formType} imported — ${res.data.data.month}/${res.data.data.financialYear}`);
      if (res.data.data.parseErrors?.length) toast(res.data.data.parseErrors.join('; '), { icon: '⚠️' });
      await loadImports();
      onImportDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this import?')) return;
    try {
      await api.delete(`/gst-reports/gstr9-imports/${id}`);
      toast.success('Removed');
      loadImports();
    } catch { toast.error('Delete failed'); }
  }

  const gstr1Imports  = (imports || []).filter(d => d.formType === 'GSTR1');
  const gstr3bImports = (imports || []).filter(d => d.formType === 'GSTR3B');

  return (
    <div style={{ padding:'24px' }}>
      {/* Upload box */}
      <div style={{ background:'#f0f7ff', border:'2px dashed #93c5fd', borderRadius:'12px', padding:'28px 24px', marginBottom:'28px', textAlign:'center' }}>
        <Upload size={32} color="#3b82f6" style={{ marginBottom:'12px' }} />
        <div style={{ fontSize:'16px', fontWeight:700, color:'#1e3a5f', marginBottom:'6px' }}>Import Portal File (JSON or Excel)</div>
        <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'18px' }}>
          Download your GSTR-1 or GSTR-3B JSON from <b>GST Portal → Returns Dashboard → Download</b>. Import one file per month.
        </div>
        <div style={{ display:'flex', gap:'12px', justifyContent:'center', alignItems:'center', flexWrap:'wrap' }}>
          <select value={formType} onChange={e => setFormType(e.target.value)}
            style={{ padding:'9px 16px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', fontWeight:600, background:'#fff', color:'#1e293b' }}>
            <option value="GSTR1">GSTR-1 (Outward Supplies)</option>
            <option value="GSTR3B">GSTR-3B (Summary Return)</option>
          </select>
          <label style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 20px', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:700, fontSize:'14px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? .7 : 1 }}>
            <Upload size={15} />{uploading ? 'Uploading...' : 'Choose File & Upload'}
            <input ref={fileRef} type="file" accept=".json,.xlsx,.xls" onChange={handleUpload} disabled={uploading} style={{ display:'none' }} />
          </label>
        </div>
      </div>

      {/* Imported records */}
      {loadingList ? <div style={{ textAlign:'center', color:'#64748b', padding:'20px' }}>Loading...</div> : (
        <>
          <MonthGrid title="GSTR-1 Imports" rows={gstr1Imports} onDelete={handleDelete} />
          <MonthGrid title="GSTR-3B Imports" rows={gstr3bImports} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}

function MonthGrid({ title, rows, onDelete }) {
  const importedByMonth = Object.fromEntries(rows.map(r => [r.month, r]));
  return (
    <div style={{ marginBottom:'24px' }}>
      <div style={{ fontWeight:700, fontSize:'15px', color:'#1e293b', marginBottom:'12px' }}>{title}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:'10px' }}>
        {MONTHS_ORDER.map(m => {
          const rec = importedByMonth[m];
          return (
            <div key={m} style={{ borderRadius:'10px', padding:'12px', background: rec ? '#f0fdf4' : '#f8fafc', border: `1px solid ${rec ? '#86efac' : '#e2e8f0'}`, textAlign:'center' }}>
              <div style={{ fontSize:'13px', fontWeight:700, color: rec ? '#15803d' : '#94a3b8' }}>{MONTH_LABEL[m]}</div>
              {rec ? (
                <>
                  <CheckCircle size={18} color="#16a34a" style={{ margin:'6px 0' }} />
                  <div style={{ fontSize:'10px', color:'#64748b', wordBreak:'break-all' }}>{rec.fileName?.substring(0,18)}...</div>
                  <button onClick={() => onDelete(rec._id)} style={{ marginTop:'6px', border:'none', background:'none', cursor:'pointer', color:'#dc2626' }}><Trash2 size={13} /></button>
                </>
              ) : (
                <Clock size={18} color="#cbd5e1" style={{ margin:'6px 0' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Portal vs Books Tab ──────────────────────────────────────────────────────
function ReconcileTab({ fy }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/gst-reports/gstr9-reconcile', { params: { fy } });
      setData(res.data.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Reconciliation failed');
    } finally { setLoading(false); }
  }

  React.useEffect(() => { load(); }, [fy]);

  if (loading) return <div style={{ textAlign:'center', padding:'40px', color:'#64748b' }}>Generating reconciliation...</div>;
  if (!data)   return <div style={{ textAlign:'center', padding:'40px', color:'#64748b' }}>No data. Import portal files first.</div>;

  const matched  = data.rows.filter(r => Math.abs(r.diff) < 0.01).length;
  const total    = data.rows.length;
  const hasAlert = data.rows.some(r => Math.abs(r.diff) >= 1);

  return (
    <div style={{ padding:'24px' }}>
      {/* Summary banner */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'24px' }}>
        <div style={{ flex:1, background: hasAlert ? '#fef2f2' : '#f0fdf4', borderRadius:'10px', padding:'16px 20px', border:`1px solid ${hasAlert ? '#fca5a5' : '#86efac'}` }}>
          <div style={{ fontSize:'13px', fontWeight:600, color: hasAlert ? '#dc2626' : '#15803d' }}>
            {hasAlert ? '⚠ Discrepancies Found' : '✓ All Matched'}
          </div>
          <div style={{ fontSize:'12px', color:'#64748b', marginTop:'4px' }}>
            {matched}/{total} rows matched &nbsp;·&nbsp; GSTR-1: {data.importedMonths.gstr1} months &nbsp;·&nbsp; GSTR-3B: {data.importedMonths.gstr3b} months imported
          </div>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'0 18px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontWeight:600, fontSize:'13px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Reconciliation table */}
      <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 1px 6px rgba(0,0,0,.08)', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:'15px', color:'#1e293b', display:'flex', alignItems:'center', gap:'8px' }}>
          <ArrowLeftRight size={18} color="#1e3a5f" /> Portal vs Books Comparison
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Parameter</th>
                <th style={THR}>Portal Filed (₹)</th>
                <th style={THR}>ERP Books (₹)</th>
                <th style={THR}>Difference (₹)</th>
                <th style={TH}>Status</th>
                <th style={TH}>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const abs = Math.abs(row.diff);
                const clr = diffColor(row.diff);
                return (
                  <tr key={i} style={{ background: abs < 0.01 ? '#f0fdf4' : abs < 100 ? '#fffbeb' : '#fef2f2' }}>
                    <td style={{ ...TD, fontWeight:600 }}>{row.label}</td>
                    <td style={TDR}>{fmt(row.portal)}</td>
                    <td style={TDR}>{fmt(row.books)}</td>
                    <td style={{ ...TDR, color: clr, fontWeight:700 }}>{row.diff > 0 ? '+' : ''}{fmt(row.diff)}</td>
                    <td style={{ ...TD }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 8px', borderRadius:'20px', fontSize:'11px', fontWeight:700, background: abs < 0.01 ? '#dcfce7' : abs < 100 ? '#fef9c3' : '#fee2e2', color: clr }}>
                        {abs < 0.01 ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                        {diffLabel(row.diff)}
                      </span>
                    </td>
                    <td style={{ ...TD, fontSize:'11px', color:'#94a3b8' }}>{row.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {data.importedMonths.gstr1 === 0 && data.importedMonths.gstr3b === 0 && (
        <div style={{ marginTop:'20px', background:'#fffbeb', border:'1px solid #fbbf24', borderRadius:'10px', padding:'14px 18px', fontSize:'13px', color:'#92400e' }}>
          <b>No portal data imported yet.</b> Go to the <b>Import Portal Data</b> tab and upload your GSTR-1 and GSTR-3B JSON files from the GST portal.
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Gstr9ReportPage() {
  const [activeTab, setActiveTab] = useState('books');   // books | import | reconcile
  const [fy, setFy] = useState(`${CUR_YEAR - 1}-${CUR_YEAR}`);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState(null);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await api.get('/gst-reports/gstr9-summary', { params: { fy } });
      setData(res.data.data);
      toast.success('GSTR-9 generated');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to generate GSTR-9');
    } finally { setLoading(false); }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await api.get('/gst-reports/gstr9-download', { params: { fy }, responseType:'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `GSTR9_${fy}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDownloading(false); }
  }

  const totalOutwardTax = useMemo(() => { if (!data) return 0; const t = data.table9.outputTax; return (t.igst||0)+(t.cgst||0)+(t.sgst||0)+(t.cess||0); }, [data]);
  const totalITC        = useMemo(() => { if (!data) return 0; const t = data.table6.total;    return (t.igst||0)+(t.cgst||0)+(t.sgst||0); }, [data]);
  const netTaxPayable   = useMemo(() => { if (!data) return 0; const t = data.table9.netTax;   return (t.igst||0)+(t.cgst||0)+(t.sgst||0)+(t.cess||0); }, [data]);

  return (
    <div style={{ minHeight:'100vh', background:'#f0f4f8', padding:'24px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e3a5f,#2d5986)', borderRadius:'14px', padding:'24px 28px', marginBottom:'20px', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
            <ShieldCheck size={32} />
            <div>
              <h1 style={{ margin:0, fontSize:'22px', fontWeight:800 }}>GSTR-9 Annual Return</h1>
              <p style={{ margin:'4px 0 0', fontSize:'13px', opacity:.8 }}>Consolidated Annual GST — FY {fy} &nbsp;·&nbsp; Books + Portal Reconciliation</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
            <select value={fy} onChange={e => { setFy(e.target.value); setData(null); }}
              style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.15)', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
              {FYS.map(f => <option key={f} value={f} style={{ color:'#1e293b', background:'#fff' }}>{f}</option>)}
            </select>
            <button onClick={fetchReport} disabled={loading}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'9px 18px', borderRadius:'8px', border:'none', background:'#fff', color:'#1e3a5f', fontWeight:700, fontSize:'13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Generating...' : 'Generate Books'}
            </button>
            {data && (
              <button onClick={handleDownload} disabled={downloading}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'9px 18px', borderRadius:'8px', border:'1px solid rgba(255,255,255,.4)', background:'transparent', color:'#fff', fontWeight:700, fontSize:'13px', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? .7 : 1 }}>
                <Download size={15} />{downloading ? 'Downloading...' : 'Download Excel'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'2px', background:'#e2e8f0', borderRadius:'10px 10px 0 0', padding:'4px 4px 0', marginBottom:0 }}>
        <Tab label="ERP Books (GSTR-9)"    active={activeTab==='books'}     onClick={() => setActiveTab('books')}     icon={FileText} />
        <Tab label="Import Portal Data"    active={activeTab==='import'}    onClick={() => setActiveTab('import')}    icon={Upload} />
        <Tab label="Portal vs Books"       active={activeTab==='reconcile'} onClick={() => setActiveTab('reconcile')} icon={ArrowLeftRight} />
      </div>
      <div style={{ background:'#fff', borderRadius:'0 0 12px 12px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', overflow:'hidden' }}>

        {/* ── TAB: ERP Books ─────────────────────────────────────────────── */}
        {activeTab === 'books' && (
          <div style={{ padding:'0' }}>
            {!data ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#64748b' }}>
                <FileText size={48} color="#cbd5e1" style={{ marginBottom:'16px' }} /><br />
                <b style={{ fontSize:'16px' }}>Click "Generate Books" to compute GSTR-9 from ERP data</b><br />
                <span style={{ fontSize:'13px' }}>Aggregates all Sales Invoices, Purchase Invoices and Credit/Debit Notes for FY {fy}</span>
              </div>
            ) : (
              <div style={{ padding:'24px' }}>
                {/* Meta */}
                <div style={{ background:'#f8fafc', borderRadius:'10px', padding:'12px 18px', marginBottom:'20px', display:'flex', gap:'20px', flexWrap:'wrap', fontSize:'13px', color:'#475569' }}>
                  <span><b>GSTIN:</b> {data.meta.gstin||'—'}</span>
                  <span><b>Entity:</b> {data.meta.legalName||'—'}</span>
                  <span><b>Sales:</b> {data.meta.totalSalesInvoices}</span>
                  <span><b>Purchases:</b> {data.meta.totalPurchaseInvoices}</span>
                  <span><b>Credit Notes:</b> {data.meta.totalCreditNotes}</span>
                  <span><b>Debit Notes:</b> {data.meta.totalDebitNotes}</span>
                </div>
                {/* Stats */}
                <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', marginBottom:'24px' }}>
                  <StatCard label="Total Outward Taxable" value={data.table4.total.taxableValue} />
                  <StatCard label="Total Output Tax" value={totalOutwardTax} color="#0f766e" />
                  <StatCard label="Total ITC Availed" value={totalITC} color="#7c3aed" />
                  <StatCard label="Net Tax Payable" value={netTaxPayable} color="#dc2626" />
                </div>
                <SectionCard title="Table 4 — Outward Taxable Supplies" subtitle="Supplies on which tax is payable" icon={TrendingUp}><Table4 data={data.table4} /></SectionCard>
                <SectionCard title="Table 5 — Nil / Exempt / Non-GST" subtitle="Supplies on which tax is NOT payable" icon={FileText} defaultOpen={false}><Table5 data={data.table5} /></SectionCard>
                <SectionCard title="Table 6 — ITC Availed" subtitle="Input Tax Credit from purchases + RCM" icon={TrendingDown}><Table6 data={data.table6} /></SectionCard>
                <SectionCard title="Table 9 — Tax Payable & Net Liability" subtitle="After credit/debit note adjustments" icon={BarChart2}><Table9 table9={data.table9} table10={data.table10} table11={data.table11} /></SectionCard>
                <SectionCard title="Table 17 — HSN-wise Outward Supply" subtitle={`${data.table17.length} HSN codes`} icon={FileText} defaultOpen={false}><HsnTable rows={data.table17} /></SectionCard>
                <SectionCard title="Table 18 — HSN-wise Inward Supply" subtitle={`${data.table18.length} HSN codes`} icon={FileText} defaultOpen={false}><HsnTable rows={data.table18} /></SectionCard>
                <div style={{ textAlign:'center', fontSize:'12px', color:'#94a3b8', paddingBottom:'8px' }}>Generated at {new Date(data.meta.generatedAt).toLocaleString('en-IN')} · This is a working summary. File the official return on the GST Portal.</div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Import ────────────────────────────────────────────────── */}
        {activeTab === 'import' && <ImportTab fy={fy} onImportDone={() => {}} />}

        {/* ── TAB: Reconcile ─────────────────────────────────────────────── */}
        {activeTab === 'reconcile' && <ReconcileTab fy={fy} />}
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}