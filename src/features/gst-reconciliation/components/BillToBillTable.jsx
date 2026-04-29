import React, { useState, useEffect } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { 
  AlertCircle, CheckCircle, HelpCircle, 
  ArrowRight, Search, FileText, ExternalLink 
} from 'lucide-react';

const headerStyle = { background: '#f8fafc', padding: '10px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' };
const cellStyle = { padding: '10px 8px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' };
const numStyle = { ...cellStyle, textAlign: 'right', fontWeight: 600 };

const fmt = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

export default function BillToBillTable({ fy, month, source, preSelectedGstin }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(preSelectedGstin || '');
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/gst-reconciliation/bill-to-bill', {
        params: { financialYear: fy, month, source, supplierGstin: search }
      });
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [fy, month, source, search]);

  const filteredData = data.filter(row => statusFilter === 'All' || row.status === statusFilter);

  return (
    <div>
      {/* Table Filters */}
      <div style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Search by GSTIN or Supplier Name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} 
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
          <option value="All">All Statuses</option>
          <option value="Fully Matched">Fully Matched</option>
          <option value="Matched with Rounding">Matched with Rounding</option>
          <option value="Books Only">Books Only</option>
          <option value="2B Only">2B Only</option>
          <option value="Mismatch">Mismatch</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerStyle}>Status</th>
              <th style={headerStyle}>Supplier Details</th>
              <th style={{ ...headerStyle, background: '#f0f9ff' }}>Books Bill Details</th>
              <th style={{ ...headerStyle, background: '#fdf4ff' }}>2A/2B Bill Details</th>
              <th style={numStyle}>Taxable Diff</th>
              <th style={numStyle}>GST Diff</th>
              <th style={{ ...headerStyle, textAlign: 'center' }}>ITC</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => {
              const statusColor = getStatusColor(row.status);
              const statusBg = getStatusBg(row.status);

              return (
                <tr key={idx} style={{ transition: 'background 0.2s' }}>
                  <td style={cellStyle}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, color: statusColor, background: statusBg }}>
                      {row.status}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 700, fontSize: '11px' }}>{row.supplierName || (row.books?.supplierName || row.portal?.supplierName)}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{row.gstin}</div>
                  </td>
                  
                  {/* Books Column */}
                  <td style={{ ...cellStyle, background: '#f0f9ff66' }}>
                    {row.books ? (
                      <div>
                        <div style={{ fontWeight: 700 }}>{row.books.billNo}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{formatDate(row.books.billDate)} · ₹{fmt(row.books.totalGst)}</div>
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>Not in Books</span>}
                  </td>

                  {/* Portal Column */}
                  <td style={{ ...cellStyle, background: '#fdf4ff66' }}>
                    {row.portal ? (
                      <div>
                        <div style={{ fontWeight: 700 }}>{row.portal.billNo}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{formatDate(row.portal.billDate)} · ₹{fmt(row.portal.totalGst)}</div>
                      </div>
                    ) : <span style={{ color: '#cbd5e1' }}>Not in Portal</span>}
                  </td>

                  <td style={{ ...numStyle, color: Math.abs(row.difference.taxableValue) > 1 ? '#dc2626' : '#1e293b' }}>
                    ₹{fmt(row.difference.taxableValue)}
                  </td>
                  <td style={{ ...numStyle, color: Math.abs(row.difference.totalGst) > 1 ? '#dc2626' : '#1e293b' }}>
                    ₹{fmt(row.difference.totalGst)}
                  </td>

                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {row.portal?.itcAvailable === 'No' ? (
                        <AlertCircle size={16} color="#dc2626" title="Ineligible ITC" />
                      ) : (
                        <CheckCircle size={16} color="#059669" title="ITC Available" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getStatusColor(status) {
  switch (status) {
    case 'Fully Matched': return '#059669';
    case 'Matched with Rounding': return '#0891b2';
    case 'Books Only': return '#ea580c';
    case '2B Only': return '#7c3aed';
    case 'Mismatch': return '#dc2626';
    default: return '#64748b';
  }
}

function getStatusBg(status) {
  switch (status) {
    case 'Fully Matched': return '#ecfdf5';
    case 'Matched with Rounding': return '#ecfeff';
    case 'Books Only': return '#fff7ed';
    case '2B Only': return '#f5f3ff';
    case 'Mismatch': return '#fef2f2';
    default: return '#f1f5f9';
  }
}
