import React, { useState, useEffect } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { 
  FileText, Download, ShieldCheck, Eye, RefreshCw, 
  ChevronDown, ChevronUp, Edit3, Save, AlertCircle, CheckCircle
} from 'lucide-react';

const MONTHS = [
  { label: 'April', value: '04' }, { label: 'May', value: '05' },
  { label: 'June', value: '06' }, { label: 'July', value: '07' },
  { label: 'August', value: '08' }, { label: 'September', value: '09' },
  { label: 'October', value: '10' }, { label: 'November', value: '11' },
  { label: 'December', value: '12' }, { label: 'January', value: '01' },
  { label: 'February', value: '02' }, { label: 'March', value: '03' },
];

const CUR_YEAR = new Date().getFullYear();
const FYS = [`${CUR_YEAR - 1}-${CUR_YEAR}`, `${CUR_YEAR}-${CUR_YEAR + 1}`];

function fmt(n) {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid #f1f5f9' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>{subtitle}</p>}
    </div>
  );
}

const tableHeaderStyle = { background: '#f8fafc', padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' };
const cellStyle = { padding: '12px', fontSize: '13px', color: '#1e293b', borderBottom: '1px solid #f1f5f9' };
const numCellStyle = { ...cellStyle, textAlign: 'right', fontWeight: 600 };

export default function Gstr3bReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.roleName === 'admin' || user?.roleName === 'superadmin';

  const [fy, setFy] = useState('2025-2026');
  const [month, setMonth] = useState('04');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [recon, setRecon] = useState(null);
  const [showAdj, setShowAdj] = useState(false);
  const [adjustment, setAdjustment] = useState(null);

  async function fetchReport() {
    setLoading(true);
    try {
      const yr = Number(month) >= 4 ? fy.split('-')[0] : fy.split('-')[1];
      const lastDay = new Date(yr, Number(month), 0).getDate();
      const startDate = `${yr}-${month}-01`;
      const endDate = `${yr}-${month}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await api.get('/gst-reports/gstr3b-summary', { params: { startDate, endDate } });
      setReportData(data.data);
      setRecon(data.reconciliation);
      
      // Fetch adjustments
      const adjRes = await api.get('/gst-reports/gstr3b-adjustment', { params: { financialYear: fy, month } });
      setAdjustment(adjRes.data.data || {});
      
      toast.success('GSTR-3B generated');
    } catch (e) {
      toast.error('Failed to generate: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...adjustment, financialYear: fy, month };
      await api.post('/gst-reports/gstr3b-adjustment', payload);
      toast.success('Adjustments saved');
      setShowAdj(false);
      fetchReport();
    } catch (e) {
      toast.error('Save failed: ' + (e?.response?.data?.message || e.message));
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
              <FileText size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>GSTR-3B Compliance Dashboard</h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Self-Assessment of Summary Return (Table 3.1 to 6.1) · ITC Reconciliation · Manual Overrides</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           {isAdmin && reportData && (
             <button onClick={() => setShowAdj(true)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <Edit3 size={16} /> Manual Adjustments
             </button>
           )}
           <button onClick={fetchReport} disabled={loading} style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
             {loading ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={18} />} Generate GSTR-3B
           </button>
        </div>
      </div>

      {/* Selectors */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Financial Year</label>
          <select value={fy} onChange={e => setFy(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
            {FYS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Tax Period</label>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {reportData ? (
        <>
          {/* Table 3.1 */}
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', marginBottom: '32px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <SectionTitle title="3.1 Details of Outward Supplies and Inward Supplies liable to Reverse Charge" subtitle="Includes net adjustments for Credit/Debit Notes" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Nature of Supplies</th>
                  <th style={numCellStyle}>Total Taxable Value</th>
                  <th style={numCellStyle}>Integrated Tax</th>
                  <th style={numCellStyle}>Central Tax</th>
                  <th style={numCellStyle}>State/UT Tax</th>
                  <th style={numCellStyle}>Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={cellStyle}>(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardTaxable.taxableValue)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardTaxable.igst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardTaxable.cgst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardTaxable.sgst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardTaxable.cess)}</td>
                </tr>
                <tr>
                  <td style={cellStyle}>(b) Outward taxable supplies (zero rated)</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardZeroRated.taxableValue)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardZeroRated.igst)}</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardZeroRated.cess)}</td>
                </tr>
                <tr>
                  <td style={cellStyle}>(c) Other outward supplies (Nil rated, exempted)</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.outwardNilExempt.taxableValue)}</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                </tr>
                <tr>
                  <td style={cellStyle}>(d) Inward supplies (liable to reverse charge)</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.inwardReverseCharge.taxableValue)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.inwardReverseCharge.igst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.inwardReverseCharge.cgst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.inwardReverseCharge.sgst)}</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.inwardReverseCharge.cess)}</td>
                </tr>
                <tr>
                  <td style={cellStyle}>(e) Non-GST outward supplies</td>
                  <td style={numCellStyle}>₹{fmt(reportData.table31.nonGstOutward.taxableValue)}</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                  <td style={numCellStyle}>—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Table 4 */}
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', marginBottom: '32px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <SectionTitle title="4. Eligible ITC" subtitle="Input Tax Credit from purchases and manual adjustments" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Details</th>
                  <th style={numCellStyle}>Integrated Tax</th>
                  <th style={numCellStyle}>Central Tax</th>
                  <th style={numCellStyle}>State/UT Tax</th>
                  <th style={numCellStyle}>Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#f8fafc' }}><td colSpan="5" style={{ ...cellStyle, fontWeight: 800 }}>(A) ITC Available (whether in full or part)</td></tr>
                {[
                  { label: '1. Import of goods', data: reportData.table4.itcAvailable.importGoods },
                  { label: '2. Import of services', data: reportData.table4.itcAvailable.importServices },
                  { label: '3. Inward supplies liable to reverse charge', data: reportData.table4.itcAvailable.inwardRcm },
                  { label: '4. Inward supplies from ISD', data: reportData.table4.itcAvailable.inwardIsd },
                  { label: '5. All other ITC', data: reportData.table4.itcAvailable.allOtherItc },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ ...cellStyle, paddingLeft: '24px' }}>{row.label}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.igst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.cgst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.sgst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.cess)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc' }}><td colSpan="5" style={{ ...cellStyle, fontWeight: 800 }}>(B) ITC Reversed</td></tr>
                {[
                  { label: '1. As per rules 42 & 43 of CGST Rules', data: reportData.table4.itcReversed.rule38_42_43 },
                  { label: '2. Others', data: reportData.table4.itcReversed.others },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ ...cellStyle, paddingLeft: '24px' }}>{row.label}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.igst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.cgst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.sgst)}</td>
                    <td style={numCellStyle}>₹{fmt(row.data.cess)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f0fdfa' }}>
                  <td style={{ ...cellStyle, fontWeight: 900, color: '#0d9488' }}>(C) Net ITC Available (A - B)</td>
                  <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(
                    (reportData.table4.itcAvailable.importGoods.igst + reportData.table4.itcAvailable.importServices.igst + reportData.table4.itcAvailable.inwardRcm.igst + reportData.table4.itcAvailable.inwardIsd.igst + reportData.table4.itcAvailable.allOtherItc.igst) -
                    (reportData.table4.itcReversed.rule38_42_43.igst + reportData.table4.itcReversed.others.igst)
                  )}</td>
                  <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(
                    (reportData.table4.itcAvailable.inwardRcm.cgst + reportData.table4.itcAvailable.inwardIsd.cgst + reportData.table4.itcAvailable.allOtherItc.cgst) -
                    (reportData.table4.itcReversed.rule38_42_43.cgst + reportData.table4.itcReversed.others.cgst)
                  )}</td>
                  <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(
                    (reportData.table4.itcAvailable.inwardRcm.sgst + reportData.table4.itcAvailable.inwardIsd.sgst + reportData.table4.itcAvailable.allOtherItc.sgst) -
                    (reportData.table4.itcReversed.rule38_42_43.sgst + reportData.table4.itcReversed.others.sgst)
                  )}</td>
                  <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(
                    (reportData.table4.itcAvailable.importGoods.cess + reportData.table4.itcAvailable.importServices.cess + reportData.table4.itcAvailable.inwardRcm.cess + reportData.table4.itcAvailable.inwardIsd.cess + reportData.table4.itcAvailable.allOtherItc.cess) -
                    (reportData.table4.itcReversed.rule38_42_43.cess + reportData.table4.itcReversed.others.cess)
                  )}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reconciliation */}
          {recon && (
            <div style={{ background: '#fff7ed', borderRadius: '16px', padding: '24px', marginBottom: '32px', border: '1px solid #ffedd5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <AlertCircle size={20} color="#ea580c" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#9a3412', margin: 0 }}>GSTR-1 vs GSTR-3B Reconciliation</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                 {['taxableValue', 'igst', 'cgst', 'sgst'].map(key => (
                   <div key={key} style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                     <div style={{ fontSize: '10px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase' }}>{key === 'taxableValue' ? 'Taxable Value' : key.toUpperCase()}</div>
                     <div style={{ fontSize: '16px', fontWeight: 900, color: '#c2410c', marginTop: '4px' }}>₹{fmt(recon.difference[key])}</div>
                     <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{recon.difference[key] === 0 ? '✅ Matched' : '⚠ Mismatch'}</div>
                   </div>
                 ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '100px 0', textAlign: 'center', background: '#fff', borderRadius: '20px', border: '2px dashed #e2e8f0' }}>
           <Eye size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
           <p style={{ color: '#64748b', fontWeight: 600 }}>Select a period and click "Generate GSTR-3B" to view the summary.</p>
        </div>
      )}

      {/* Manual Adjustment Sidebar/Modal */}
      {showAdj && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '450px', height: '100vh', background: '#fff', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', zIndex: 1000, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
             <h2 style={{ fontSize: '20px', fontWeight: 900 }}>Manual Adjustments</h2>
             <button onClick={() => setShowAdj(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
           </div>

           <form onSubmit={handleSaveAdjustment}>
              <div style={{ marginBottom: '24px' }}>
                <SectionTitle title="Table 4 - ITC Adjustments" />
                {['importGoods', 'importServices', 'inwardIsd', 'allOtherItc'].map(field => (
                  <div key={field} style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>{field.replace(/([A-Z])/g, ' $1').trim()}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                       <input type="number" placeholder="IGST" value={adjustment.table4?.[field]?.integratedTax || ''} onChange={e => setAdjustment({...adjustment, table4: {...adjustment.table4, [field]: {...adjustment.table4?.[field], integratedTax: Number(e.target.value)}}})} style={inputStyle} />
                       <input type="number" placeholder="CGST" value={adjustment.table4?.[field]?.centralTax || ''} onChange={e => setAdjustment({...adjustment, table4: {...adjustment.table4, [field]: {...adjustment.table4?.[field], centralTax: Number(e.target.value)}}})} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '24px' }}>
                 <SectionTitle title="Table 5.1 - Interest & Late Fee" />
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input type="number" placeholder="Interest (Total)" value={adjustment.table51?.interest?.integratedTax || ''} onChange={e => setAdjustment({...adjustment, table51: {...adjustment.table51, interest: {integratedTax: Number(e.target.value)}}})} style={inputStyle} />
                    <input type="number" placeholder="Late Fee (Total)" value={adjustment.table51?.lateFee?.integratedTax || ''} onChange={e => setAdjustment({...adjustment, table51: {...adjustment.table51, lateFee: {integratedTax: Number(e.target.value)}}})} style={inputStyle} />
                 </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                 <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Reason for Change (Audit Log)</label>
                 <textarea required value={adjustment.reason || ''} onChange={e => setAdjustment({...adjustment, reason: e.target.value})} style={{ ...inputStyle, height: '80px', resize: 'none' }} placeholder="Explain why these manual values are being entered..." />
              </div>

              <button type="submit" style={{ width: '100%', padding: '14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                 <Save size={20} /> Save & Update Report
              </button>
           </form>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
