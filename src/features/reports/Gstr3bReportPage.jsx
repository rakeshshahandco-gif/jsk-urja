import React, { useState, useEffect } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/contexts/CompanyContext';
import { rcmApi } from '@/services/rcmApi';
import { 
  FileText, Download, ShieldCheck, Eye, RefreshCw, 
  ChevronDown, ChevronUp, Edit3, Save, AlertCircle, 
  CheckCircle, Calculator, Database, ArrowRight,
  TrendingDown, TrendingUp
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
  const { user, hasPermission } = useAuth();
  const { selectedCompany } = useCompany();
  const isAdmin = user?.roleName === 'admin' || user?.roleName === 'superadmin'
    || ['admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());

  const [activeTab, setActiveTab] = useState('summary'); // summary, payable, reconciliation, rcm
  const [fy, setFy] = useState('2025-2026');
  const [month, setMonth] = useState('04');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [recon, setRecon] = useState(null);
  const [showAdj, setShowAdj] = useState(false);
  const [adjustment, setAdjustment] = useState({
      table4: {}, table5: {}, table51: {}, openingBalance: { creditLedger: {}, cashLedger: {} }
  });
  const [rcmRecon, setRcmRecon] = useState(null);
  const [rcmBusy, setRcmBusy] = useState(false);
  const [rcmConfirm, setRcmConfirm] = useState(false);

  const returnPeriod = (() => {
    const yr = Number(month) >= 4 ? fy.split('-')[0] : fy.split('-')[1];
    return `${yr}-${month}`;
  })();

  const canViewRcm = isAdmin || hasPermission?.('gst.rcm.view_reconciliation');

  async function fetchRcmRecon() {
    if (!selectedCompany?._id) return;
    setRcmBusy(true);
    try {
      const data = await rcmApi.getGstr3bReconciliation({
        companyId: selectedCompany._id,
        returnPeriod,
        financialYear: fy,
      });
      setRcmRecon(data);
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || 'RCM reconciliation failed');
    } finally {
      setRcmBusy(false);
    }
  }

  async function runRcmWorkflow(step) {
    setRcmBusy(true);
    try {
      const base = { companyId: selectedCompany?._id, returnPeriod, financialYear: fy };
      if (step === 'prepare') await rcmApi.prepareReturnMapping({ ...base, remarks: 'Prepared from GSTR-3B page' });
      if (step === 'review') await rcmApi.reviewReturnMapping(base);
      if (step === 'approve') await rcmApi.approveReturnMapping(base);
      if (step === 'include') {
        if (!rcmConfirm) {
          toast.error('Confirm checkbox required');
          return;
        }
        await rcmApi.includeInGstr3b({
          ...base,
          confirmInclude: true,
          checkboxAccepted: true,
          manualAdjustmentOption: 'REPLACE_WITH_APPROVED',
        });
        toast.success('Included in draft GSTR-3B (not filed)');
        fetchReport();
      }
      if (step === 'lock') {
        await rcmApi.lockGstr3bPeriod({ ...base, confirmLock: true, remarks: 'Lock from UI' });
        toast.success('Period locked');
      }
      await fetchRcmRecon();
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setRcmBusy(false);
    }
  }

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
      
      const adjRes = await api.get('/gst-reports/gstr3b-adjustment', { params: { financialYear: fy, month } });
      if (adjRes.data.data) {
        setAdjustment({
          ...adjustment,
          ...adjRes.data.data,
          openingBalance: {
            creditLedger: adjRes.data.data.openingBalance?.creditLedger || {},
            cashLedger: adjRes.data.data.openingBalance?.cashLedger || {}
          }
        });
      }
      
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
    <div style={{ padding: '28px 32px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
              <FileText size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>GSTR-3B Compliance Dashboard</h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Self-Assessment Return · ITC Utilization · Net Tax Payable</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           {isAdmin && reportData && (
             <button onClick={() => setShowAdj(true)} style={btnSecondary}>
               <Edit3 size={16} /> Manual Adjustments & Balances
             </button>
           )}
           <button onClick={fetchReport} disabled={loading} style={btnPrimary}>
             {loading ? <RefreshCw size={18} className="spin" /> : <ShieldCheck size={18} />} Generate GSTR-3B
           </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
        <button onClick={() => setActiveTab('summary')} style={tabStyle(activeTab === 'summary')}><FileText size={16} /> Summary Return</button>
        <button onClick={() => setActiveTab('payable')} style={tabStyle(activeTab === 'payable')}><Calculator size={16} /> GST Payable Summary</button>
        <button onClick={() => setActiveTab('reconciliation')} style={tabStyle(activeTab === 'reconciliation')}><Database size={16} /> GSTR-1 vs 3B Recon</button>
        {canViewRcm ? (
          <button
            onClick={() => { setActiveTab('rcm'); fetchRcmRecon(); }}
            style={tabStyle(activeTab === 'rcm')}
          >
            <ShieldCheck size={16} /> RCM Reconciliation
          </button>
        ) : null}
      </div>

      {/* Selectors */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid #e2e8f0', display: 'flex', gap: '20px' }}>
        <div>
          <label style={labelStyle}>Financial Year</label>
          <select value={fy} onChange={e => setFy(e.target.value)} style={selectStyle}>
            {FYS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tax Period</label>
          <select value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {reportData ? (
        <>
          {activeTab === 'summary' && (
            <>
              {/* Table 3.1 */}
              <div style={cardStyle}>
                <SectionTitle title="3.1 Outward supplies and Inward supplies liable to reverse charge" subtitle="Consolidated summary for the tax period" />
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Nature of Supplies</th>
                      <th style={numCellStyle}>Taxable Value</th>
                      <th style={numCellStyle}>IGST</th>
                      <th style={numCellStyle}>CGST</th>
                      <th style={numCellStyle}>SGST</th>
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
              <div style={cardStyle}>
                <SectionTitle title="4. Eligible ITC" subtitle="ITC Available and Reversed for the period" />
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Details</th>
                      <th style={numCellStyle}>IGST</th>
                      <th style={numCellStyle}>CGST</th>
                      <th style={numCellStyle}>SGST</th>
                      <th style={numCellStyle}>Cess</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: '#f8fafc' }}><td colSpan="5" style={{ ...cellStyle, fontWeight: 800 }}>(A) ITC Available</td></tr>
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
                      { label: '1. As per rules 42 & 43', data: reportData.table4.itcReversed.rule38_42_43 },
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
                      <td style={{ ...cellStyle, fontWeight: 900, color: '#0d9488' }}>(C) Net ITC Available</td>
                      <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(reportData.payableSummary.availableItc.igst)}</td>
                      <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(reportData.payableSummary.availableItc.cgst)}</td>
                      <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(reportData.payableSummary.availableItc.sgst)}</td>
                      <td style={{ ...numCellStyle, color: '#0d9488' }}>₹{fmt(reportData.payableSummary.availableItc.cess)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'payable' && (
            <>
               <div style={cardStyle}>
                 <SectionTitle title="GST Payable Summary" subtitle="Net cash liability after utilizing opening balances and ITC" />
                 
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <PayableMiniCard title="Total Output Liability" value={Object.values(reportData.payableSummary.liability).reduce((a,b)=>a+b,0)} color="#2563eb" />
                    <PayableMiniCard title="Total ITC Utilized" value={
                        Object.values(reportData.payableSummary.utilization.igst).reduce((a,b)=>a+b,0) +
                        Object.values(reportData.payableSummary.utilization.cgst).reduce((a,b)=>a+b,0) +
                        Object.values(reportData.payableSummary.utilization.sgst).reduce((a,b)=>a+b,0) +
                        reportData.payableSummary.utilization.cess.cess
                    } color="#059669" />
                    <PayableMiniCard title="Opening Cash Utilized" value={
                        (reportData.payableSummary.openingCash.integratedTax || 0) + 
                        (reportData.payableSummary.openingCash.centralTax || 0) + 
                        (reportData.payableSummary.openingCash.stateUtTax || 0)
                    } color="#7c3aed" />
                    <PayableMiniCard title="Net Cash Payable" value={Object.values(reportData.payableSummary.netCashPayable).reduce((a,b)=>a+b,0)} color="#dc2626" />
                 </div>

                 <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>6.1 Payment of Tax (Utilization Details)</h4>
                 <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                       <thead>
                          <tr>
                             <th style={tableHeaderStyle}>Description</th>
                             <th style={numCellStyle}>Tax Liability</th>
                             <th style={{ ...numCellStyle, background: '#f5f3ff' }}>Paid by IGST ITC</th>
                             <th style={{ ...numCellStyle, background: '#f5f3ff' }}>Paid by CGST ITC</th>
                             <th style={{ ...numCellStyle, background: '#f5f3ff' }}>Paid by SGST ITC</th>
                             <th style={{ ...numCellStyle, background: '#fef2f2', color: '#dc2626' }}>Net Cash Payable</th>
                          </tr>
                       </thead>
                       <tbody>
                          <tr>
                             <td style={cellStyle}>Integrated Tax (IGST)</td>
                             <td style={numCellStyle}>₹{fmt(reportData.payableSummary.liability.igst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.igst.igst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.cgst.igst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.sgst.igst)}</td>
                             <td style={{ ...numCellStyle, background: '#fef2f2', color: '#dc2626' }}>₹{fmt(reportData.payableSummary.netCashPayable.igst)}</td>
                          </tr>
                          <tr>
                             <td style={cellStyle}>Central Tax (CGST)</td>
                             <td style={numCellStyle}>₹{fmt(reportData.payableSummary.liability.cgst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.igst.cgst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.cgst.cgst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>—</td>
                             <td style={{ ...numCellStyle, background: '#fef2f2', color: '#dc2626' }}>₹{fmt(reportData.payableSummary.netCashPayable.cgst)}</td>
                          </tr>
                          <tr>
                             <td style={cellStyle}>State/UT Tax (SGST)</td>
                             <td style={numCellStyle}>₹{fmt(reportData.payableSummary.liability.sgst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.igst.sgst)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>—</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>₹{fmt(reportData.payableSummary.utilization.sgst.sgst)}</td>
                             <td style={{ ...numCellStyle, background: '#fef2f2', color: '#dc2626' }}>₹{fmt(reportData.payableSummary.netCashPayable.sgst)}</td>
                          </tr>
                          <tr>
                             <td style={cellStyle}>Cess</td>
                             <td style={numCellStyle}>₹{fmt(reportData.payableSummary.liability.cess)}</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>—</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>—</td>
                             <td style={{ ...numCellStyle, background: '#f5f3ff' }}>—</td>
                             <td style={{ ...numCellStyle, background: '#fef2f2', color: '#dc2626' }}>₹{fmt(reportData.payableSummary.netCashPayable.cess)}</td>
                          </tr>
                       </tbody>
                    </table>
                 </div>

                 <div style={{ marginTop: '24px', padding: '20px', background: '#f8fafc', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                        <h5 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '8px' }}>Closing Credit Balance</h5>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <BalanceHead label="IGST" value={reportData.payableSummary.closingCredit.igst} />
                            <BalanceHead label="CGST" value={reportData.payableSummary.closingCredit.cgst} />
                            <BalanceHead label="SGST" value={reportData.payableSummary.closingCredit.sgst} />
                        </div>
                    </div>
                    <div>
                        <h5 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '8px' }}>Closing Cash Balance</h5>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <BalanceHead label="IGST" value={reportData.payableSummary.closingCash.integratedTax} />
                            <BalanceHead label="CGST" value={reportData.payableSummary.closingCash.centralTax} />
                            <BalanceHead label="SGST" value={reportData.payableSummary.closingCash.stateUtTax} />
                        </div>
                    </div>
                 </div>
               </div>
            </>
          )}

          {activeTab === 'reconciliation' && recon && (
            <div style={cardStyle}>
              <SectionTitle title="GSTR-1 vs GSTR-3B Reconciliation" subtitle="Verification of outward liability reporting consistency" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                 {['taxableValue', 'igst', 'cgst', 'sgst'].map(key => (
                   <div key={key} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                     <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>{key === 'taxableValue' ? 'Taxable Value' : key.toUpperCase()}</div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>GSTR-1:</span>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>₹{fmt(recon.gstr1[key])}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>GSTR-3B:</span>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>₹{fmt(recon.gstr3b[key])}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Difference:</span>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: recon.difference[key] === 0 ? '#059669' : '#dc2626' }}>₹{fmt(recon.difference[key])}</span>
                     </div>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeTab === 'rcm' && (
            <div style={cardStyle}>
              <SectionTitle
                title="Phase 2D — RCM GSTR-3B Reconciliation"
                subtitle={`Period ${returnPeriod} · PREVIEW ONLY until approved inclusion`}
              />
              <div style={{ marginBottom: 12, padding: 12, background: '#fff7ed', borderRadius: 8, color: '#9a3412', fontWeight: 650 }}>
                {rcmRecon?.banner || 'PREVIEW ONLY — NOT YET INCLUDED IN GSTR-3B'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <button type="button" disabled={rcmBusy} onClick={fetchRcmRecon} style={btnSecondary}>Refresh</button>
                <button type="button" disabled={rcmBusy} onClick={() => runRcmWorkflow('prepare')} style={btnSecondary}>Prepare</button>
                <button type="button" disabled={rcmBusy} onClick={() => runRcmWorkflow('review')} style={btnSecondary}>Review</button>
                <button type="button" disabled={rcmBusy} onClick={() => runRcmWorkflow('approve')} style={btnSecondary}>Approve</button>
                <button type="button" disabled={rcmBusy || !rcmConfirm} onClick={() => runRcmWorkflow('include')} style={btnPrimary}>
                  Include in Draft GSTR-3B
                </button>
                <button type="button" disabled={rcmBusy} onClick={() => runRcmWorkflow('lock')} style={btnSecondary}>Lock Period</button>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, fontSize: 12 }}>
                <input type="checkbox" checked={rcmConfirm} onChange={(e) => setRcmConfirm(e.target.checked)} />
                I confirm draft inclusion only (does not file the return; no new accounting JV).
              </label>
              {rcmRecon ? (
                <>
                  <div style={{ fontSize: 12, marginBottom: 12 }}>
                    <strong>Workflow:</strong> {rcmRecon.workflow?.workflowStatus || 'DRAFT'}
                    {rcmRecon.workflow?.version ? ` · v${rcmRecon.workflow.version}` : ''}
                    {rcmRecon.periodLocked ? ' · LOCKED' : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>A. RCM Liability Proposed (3.1(d))</div>
                      <div>Taxable ₹{fmt(rcmRecon.preview?.liabilityProposed?.taxableValue)}</div>
                      <div>CGST ₹{fmt(rcmRecon.preview?.liabilityProposed?.cgst)} · SGST ₹{fmt(rcmRecon.preview?.liabilityProposed?.sgst)} · IGST ₹{fmt(rcmRecon.preview?.liabilityProposed?.igst)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>B. RCM ITC Proposed (4(A)(3))</div>
                      <div>CGST ₹{fmt(rcmRecon.preview?.itcProposed?.cgst)} · SGST ₹{fmt(rcmRecon.preview?.itcProposed?.sgst)} · IGST ₹{fmt(rcmRecon.preview?.itcProposed?.igst)}</div>
                    </div>
                  </div>
                  {reportData?.rcmPhase2 ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: '#0f766e' }}>
                      Live GSTR-3B overlay: {reportData.rcmPhase2.banner}
                    </div>
                  ) : null}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {['Source', 'Supplier', 'Liab JV', 'Paid', 'ITC Rel.', 'Liab Status', 'ITC Status', 'Exception'].map((h) => (
                            <th key={h} style={tableHeaderStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(rcmRecon.rows || []).slice(0, 50).map((r) => (
                          <tr key={String(r.liabilityId)}>
                            <td style={cellStyle}>{r.sourceVoucherNumber || '—'}</td>
                            <td style={cellStyle}>{r.supplier || '—'}</td>
                            <td style={cellStyle}>{r.liabilityPostingVoucher || '—'}</td>
                            <td style={numCellStyle}>₹{fmt(r.amountPaid)}</td>
                            <td style={numCellStyle}>₹{fmt(r.itcReleasedInBooks)}</td>
                            <td style={cellStyle}>{r.liabilityReturnStatus}</td>
                            <td style={cellStyle}>{r.itcReturnStatus}</td>
                            <td style={{ ...cellStyle, color: r.exception ? '#b91c1c' : '#059669' }}>{r.exception || 'OK'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p style={{ color: '#64748b' }}>{rcmBusy ? 'Loading…' : 'Click Refresh to load RCM reconciliation for this period.'}</p>
              )}
            </div>
          )}
        </>
      ) : activeTab === 'rcm' ? (
        <div style={cardStyle}>
          <SectionTitle title="Phase 2D — RCM GSTR-3B Reconciliation" subtitle={`Period ${returnPeriod}`} />
          <button type="button" disabled={rcmBusy} onClick={fetchRcmRecon} style={btnPrimary}>Load RCM Reconciliation</button>
          {rcmRecon ? (
            <div style={{ marginTop: 16, fontSize: 12 }}>
              Rows: {(rcmRecon.rows || []).length} · Workflow: {rcmRecon.workflow?.workflowStatus || 'DRAFT'}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ padding: '100px 0', textAlign: 'center', background: '#fff', borderRadius: '20px', border: '2px dashed #e2e8f0' }}>
           <Eye size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
           <p style={{ color: '#64748b', fontWeight: 600 }}>Select a period and click "Generate GSTR-3B" to view the summary.</p>
        </div>
      )}

      {/* Manual Adjustment Sidebar */}
      {showAdj && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '500px', height: '100vh', background: '#fff', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', zIndex: 1000, overflowY: 'auto', padding: '32px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
             <h2 style={{ fontSize: '20px', fontWeight: 900 }}>Manual Adjustments & Ledgers</h2>
             <button onClick={() => setShowAdj(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
           </div>

           <form onSubmit={handleSaveAdjustment}>
              {/* Opening Credit Ledger */}
              <div style={{ marginBottom: '28px' }}>
                 <SectionTitle title="Electronic Credit Ledger Opening Balance" subtitle="Available ITC balance at start of month" />
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <InputGroup label="IGST Credit" value={adjustment.openingBalance?.creditLedger?.integratedTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, creditLedger: {...adjustment.openingBalance.creditLedger, integratedTax: v}}})} />
                    <InputGroup label="CGST Credit" value={adjustment.openingBalance?.creditLedger?.centralTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, creditLedger: {...adjustment.openingBalance.creditLedger, centralTax: v}}})} />
                    <InputGroup label="SGST Credit" value={adjustment.openingBalance?.creditLedger?.stateUtTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, creditLedger: {...adjustment.openingBalance.creditLedger, stateUtTax: v}}})} />
                    <InputGroup label="Cess Credit" value={adjustment.openingBalance?.creditLedger?.cess} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, creditLedger: {...adjustment.openingBalance.creditLedger, cess: v}}})} />
                 </div>
              </div>

              {/* Opening Cash Ledger */}
              <div style={{ marginBottom: '28px' }}>
                 <SectionTitle title="Electronic Cash Ledger Opening Balance" subtitle="Cash balance available in portal" />
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <InputGroup label="IGST Cash" value={adjustment.openingBalance?.cashLedger?.integratedTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, cashLedger: {...adjustment.openingBalance.cashLedger, integratedTax: v}}})} />
                    <InputGroup label="CGST Cash" value={adjustment.openingBalance?.cashLedger?.centralTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, cashLedger: {...adjustment.openingBalance.cashLedger, centralTax: v}}})} />
                    <InputGroup label="SGST Cash" value={adjustment.openingBalance?.cashLedger?.stateUtTax} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, cashLedger: {...adjustment.openingBalance.cashLedger, stateUtTax: v}}})} />
                    <InputGroup label="Cess Cash" value={adjustment.openingBalance?.cashLedger?.cess} onChange={v => setAdjustment({...adjustment, openingBalance: {...adjustment.openingBalance, cashLedger: {...adjustment.openingBalance.cashLedger, cess: v}}})} />
                 </div>
              </div>

              {/* Table 4 Adjustments */}
              <div style={{ marginBottom: '28px' }}>
                <SectionTitle title="Table 4 - ITC Adjustments" />
                {['importGoods', 'allOtherItc'].map(field => (
                  <div key={field} style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>{field === 'importGoods' ? 'Import of Goods' : 'Other ITC'}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                       <input type="number" placeholder="IGST" value={adjustment.table4?.[field]?.integratedTax || ''} onChange={e => setAdjustment({...adjustment, table4: {...adjustment.table4, [field]: {...adjustment.table4?.[field], integratedTax: Number(e.target.value)}}})} style={inputStyle} />
                       <input type="number" placeholder="CGST" value={adjustment.table4?.[field]?.centralTax || ''} onChange={e => setAdjustment({...adjustment, table4: {...adjustment.table4, [field]: {...adjustment.table4?.[field], centralTax: Number(e.target.value)}}})} style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '28px' }}>
                 <label style={labelStyle}>Reason for Change (Audit Log)</label>
                 <textarea required value={adjustment.reason || ''} onChange={e => setAdjustment({...adjustment, reason: e.target.value})} style={{ ...inputStyle, height: '80px', resize: 'none' }} placeholder="Explain why these balances/adjustments are being entered..." />
              </div>

              <button type="submit" style={btnPrimaryFull}>
                 <Save size={20} /> Save & Update Calculations
              </button>
           </form>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function PayableMiniCard({ title, value, color }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>{title}</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: color }}>₹{fmt(value)}</div>
        </div>
    );
}

function BalanceHead({ label, value }) {
    return (
        <div style={{ minWidth: '80px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: value > 0 ? '#059669' : '#1e293b' }}>₹{fmt(value)}</div>
        </div>
    );
}

function InputGroup({ label, value, onChange }) {
    return (
        <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>{label}</label>
            <input 
                type="number" 
                value={value || ''} 
                onChange={e => onChange(Number(e.target.value))} 
                style={inputStyle} 
                placeholder="0.00"
            />
        </div>
    );
}

const cardStyle = { background: '#fff', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const btnPrimary = { background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnPrimaryFull = { ...btnPrimary, width: '100%', padding: '14px', justifyContent: 'center' };
const btnSecondary = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const selectStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' };
const tabStyle = (active) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 700, color: active ? '#2563eb' : '#64748b', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' });
