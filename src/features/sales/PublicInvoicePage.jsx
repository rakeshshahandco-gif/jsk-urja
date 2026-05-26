import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const apiBase = import.meta.env.VITE_API_URL || '/api/v1';

export default function PublicInvoicePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    axios.get(`${apiBase}/public/invoices/${token}`)
      .then((res) => setData(res.data?.data))
      .catch(() => setError('Invoice not found or link expired.'));
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  const inv = data.invoice;
  const co = data.company || {};

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{co.companyName || 'Tax Invoice'}</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>Invoice {inv.displayInvoiceNumber || inv.invoiceNumber}</p>
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <p><b>Date:</b> {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '-'}</p>
        <p><b>Customer:</b> {inv.customerName}</p>
        {inv.customerGstin && <p><b>GSTIN:</b> {inv.customerGstin}</p>}
        <p><b>Amount:</b> ₹{(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        <p><b>Status:</b> {inv.paymentStatus}</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#1e3a5f', color: '#fff' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Item</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Qty</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(inv.items || []).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: 8 }}>{row.itemName}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{row.qty} {row.uom}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>₹{(row.totalAmount || 0).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 24 }}>This is a secure view link. No login required.</p>
    </div>
  );
}
