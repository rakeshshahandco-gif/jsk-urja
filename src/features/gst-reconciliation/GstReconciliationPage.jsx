import React, { useState, useEffect } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { 
  FileCheck, Download, Upload, Filter, 
  Search, ArrowRight, AlertCircle, CheckCircle,
  BarChart2, List, RefreshCw, MoreVertical
} from 'lucide-react';
import GstinWiseTable from './components/GstinWiseTable';
import BillToBillTable from './components/BillToBillTable';
import ImportGstrModal from './components/ImportGstrModal';

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

export default function GstReconciliationPage() {
  const [activeTab, setActiveTab] = useState('gstin'); // gstin | bill | rcm
  const [taxTolerance, setTaxTolerance] = useState(2);
  const [fy, setFy] = useState('2025-2026');
  const [month, setMonth] = useState('04');
  const [source, setSource] = useState('2B');
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [summary, setSummary] = useState(null);
  const [itcSummary, setItcSummary] = useState(null);
  const [rcmSummary, setRcmSummary] = useState(null);
  const [selectedGstin, setSelectedGstin] = useState(null);

  const fetchData = async (persist = false) => {
    setLoading(true);
    try {
      const params = { financialYear: fy, month, source, taxTolerance };
      if (persist) params.persist = 'true';
      
      const [sumRes, itcRes, rcmRes] = await Promise.all([
        api.get('/gst-reconciliation/gstin-summary', { params }),
        api.get('/gst-reconciliation/itc-summary', { params }),
        api.get('/gst-reconciliation/rcm-summary', { params }),
      ]);
      
      setSummary(sumRes.data.data);
      setItcSummary(itcRes.data.data);
      setRcmSummary(rcmRes.data.data);
      toast.success(persist ? 'Reconciliation saved' : 'Reconciliation data loaded');
    } catch (e) {
      toast.error('Load failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fy, month, source]);

  const handleDrillDown = (gstin) => {
    setSelectedGstin(gstin);
    setActiveTab('bill');
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
              <FileCheck size={26} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>GSTR-2A / 2B Reconciliation</h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>Match Purchase Register with Portal Data · ITC Verification · Compliance Audit</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <button onClick={() => setShowImport(true)} style={btnSecondary}>
             <Upload size={18} /> Import Portal JSON/Excel
           </button>
           <button onClick={() => fetchData(true)} disabled={loading} style={btnPrimary}>
             {loading ? <RefreshCw size={18} className="spin" /> : <RefreshCw size={18} />} Run Reconciliation
           </button>
        </div>
      </div>

      {/* ITC Summary Cards */}
      {itcSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
           <SummaryCard label="ITC as per Books" value={itcSummary.itcAsPerBooks} color="#2563eb" />
           <SummaryCard label="ITC as per 2B" value={itcSummary.itcAsPerPortal} color="#4f46e5" />
           <SummaryCard label="Eligible (Matched)" value={itcSummary.eligibleItc} color="#059669" icon={<CheckCircle size={16} color="#059669" />} />
           <SummaryCard label="Mismatch / Difference" value={itcSummary.itcAsPerBooks - itcSummary.eligibleItc} color="#dc2626" icon={<AlertCircle size={16} color="#dc2626" />} />
        </div>
      )}

      {/* Filters & Tabs */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={tabStyle(activeTab === 'gstin')} onClick={() => { setActiveTab('gstin'); setSelectedGstin(null); }}>
              <BarChart2 size={18} /> GSTIN-wise Summary
            </div>
            <div style={tabStyle(activeTab === 'bill')} onClick={() => setActiveTab('bill')}>
              <List size={18} /> Bill-to-bill Detail
            </div>
            <div style={tabStyle(activeTab === 'rcm')} onClick={() => setActiveTab('rcm')}>
              <AlertCircle size={18} /> RCM
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <select value={fy} onChange={e => setFy(e.target.value)} style={selectStyle}>
              {FYS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
               <button onClick={() => setSource('2A')} style={toggleBtn(source === '2A')}>GSTR-2A</button>
               <button onClick={() => setSource('2B')} style={toggleBtn(source === '2B')}>GSTR-2B</button>
            </div>
            <label style={{ fontSize: 12, color: '#475569' }}>
              GST tol ₹
              <input type="number" min={0} step={1} value={taxTolerance} onChange={(e) => setTaxTolerance(Number(e.target.value))} style={{ width: 48, marginLeft: 6, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
          </div>
        </div>

        {/* Tables */}
        <div style={{ padding: '0' }}>
          {activeTab === 'gstin' && <GstinWiseTable data={summary} onDrillDown={handleDrillDown} />}
          {activeTab === 'bill' && (
            <BillToBillTable fy={fy} month={month} source={source} preSelectedGstin={selectedGstin} taxTolerance={taxTolerance} />
          )}
          {activeTab === 'rcm' && rcmSummary && (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <SummaryCard label="RCM GST (Books)" value={rcmSummary.booksRcmGst} color="#2563eb" />
              <SummaryCard label="RCM GST (Portal)" value={rcmSummary.portalRcmGst} color="#4f46e5" />
              <SummaryCard label="Matched RCM" value={rcmSummary.matchedRcmGst} color="#059669" />
              <SummaryCard label="Books only RCM" value={rcmSummary.booksOnlyRcmGst} color="#d97706" />
              <SummaryCard label="Portal only RCM" value={rcmSummary.portalOnlyRcmGst} color="#dc2626" />
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportGstrModal 
          isOpen={showImport} 
          onClose={() => setShowImport(false)} 
          onSuccess={fetchData}
          fy={fy}
          month={month}
          source={source}
        />
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        {icon}
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: color }}>
        ₹{(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}

const btnPrimary = { background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(79,70,229,0.2)' };
const btnSecondary = { background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const selectStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#1e293b', outline: 'none' };
const tabStyle = (active) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700, color: active ? '#4f46e5' : '#64748b', background: active ? '#f5f3ff' : 'transparent', transition: 'all 0.2s' });
const toggleBtn = (active) => ({ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, background: active ? '#fff' : 'transparent', color: active ? '#4f46e5' : '#64748b', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' });
