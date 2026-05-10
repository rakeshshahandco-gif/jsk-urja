import React from 'react';
import { ArrowRight, CheckCircle, AlertCircle, Eye } from 'lucide-react';

const headerStyle = { background: '#f8fafc', padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' };
const cellStyle = { padding: '14px 12px', fontSize: '13px', color: '#1e293b', borderBottom: '1px solid #f1f5f9' };
const numStyle = { ...cellStyle, textAlign: 'right', fontWeight: 600 };

const fmt = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GstinWiseTable({ data, onDrillDown }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
        No reconciliation data found for this period. Try importing portal data.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerStyle}>Supplier Details</th>
            <th style={{ ...headerStyle, textAlign: 'center' }}>Books Cnt</th>
            <th style={{ ...headerStyle, textAlign: 'center' }}>2A/2B Cnt</th>
            <th style={numStyle}>Books GST</th>
            <th style={numStyle}>2A/2B GST</th>
            <th style={numStyle}>Difference</th>
            <th style={{ ...headerStyle, textAlign: 'center' }}>Status</th>
            <th style={{ ...headerStyle, textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const hasDiff = Math.abs(row.difference.totalGst) > 2;
            const statusColor = row.status === 'Matched' ? '#059669' : (row.status === 'Difference' ? '#dc2626' : '#ea580c');
            const statusBg = row.status === 'Matched' ? '#ecfdf5' : (row.status === 'Difference' ? '#fef2f2' : '#fff7ed');

            return (
              <tr key={idx} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={cellStyle}>
                  <div style={{ fontWeight: 700 }}>{row.supplierName || 'Unknown Supplier'}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{row.gstin}</div>
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.books.count}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{row.portal.count}</td>
                <td style={numStyle}>₹{fmt(row.books.totalGst)}</td>
                <td style={numStyle}>₹{fmt(row.portal.totalGst)}</td>
                <td style={{ ...numStyle, color: hasDiff ? '#dc2626' : '#1e293b' }}>₹{fmt(row.difference.totalGst)}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, color: statusColor, background: statusBg }}>
                    {row.status === 'Matched' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                    {row.status}
                  </div>
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <button 
                    onClick={() => onDrillDown(row.gstin)}
                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#475569' }}
                  >
                    <Eye size={14} /> View Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
