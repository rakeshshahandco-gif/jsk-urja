import React, { useState } from 'react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { X, Upload, FileJson, AlertTriangle } from 'lucide-react';

export default function ImportGstrModal({ isOpen, onClose, onSuccess, fy, month, source }) {
  const [mode, setMode] = useState('file');
  const [jsonInput, setJsonInput] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setLoading(true);
    try {
      if (mode === 'file') {
        if (!file) return toast.error('Select CSV or Excel file');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('financialYear', fy);
        fd.append('month', month);
        fd.append('source', source);
        const { data } = await api.post('/gst-reconciliation/import-file', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const r = data.data;
        toast.success(`Imported ${r.created} new, ${r.updated} updated`);
      } else {
        if (!jsonInput.trim()) return toast.error('Paste JSON data');
        let records = [];
        try {
          records = JSON.parse(jsonInput);
          if (!Array.isArray(records)) records = [records];
        } catch {
          return toast.error('Invalid JSON format');
        }
        const { data } = await api.post('/gst-reconciliation/import', {
          financialYear: fy,
          month,
          source,
          records,
        });
        toast.success(`Imported: ${data.data.created} new, ${data.data.updated} updated`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      toast.error('Import failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileJson size={20} color="#4f46e5" />
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Import GSTR-{source} Data</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={infoBox}>
            <AlertTriangle size={18} color="#92400e" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>Instructions</div>
              <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                Paste the GSTR-{source} records for <b>{month}/{fy}</b> as a JSON array. 
                Fields required: <code>supplierGstin, invoiceNumber, invoiceDate, taxableValue, totalTax</code>.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button type="button" onClick={() => setMode('file')} style={mode === 'file' ? tabActive : tabIdle}>File (CSV/Excel)</button>
            <button type="button" onClick={() => setMode('json')} style={mode === 'json' ? tabActive : tabIdle}>JSON</button>
          </div>

          {mode === 'file' ? (
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569' }}>
              Portal export file
              <input type="file" accept=".csv,.xlsx,.xls,.json,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'block', marginTop: 8 }} />
            </label>
          ) : (
            <>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>JSON Payload</label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='[{"supplierGstin": "27...", "invoiceNumber": "INV-01", "invoiceDate": "2025-04-01", "taxableValue": 1000, "totalTax": 180}]'
                style={textareaStyle}
              />
            </>
          )}

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
             <button onClick={onClose} style={btnCancel}>Cancel</button>
             <button onClick={handleImport} disabled={loading} style={btnConfirm}>
               {loading ? 'Processing...' : `Import into ${source}`}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContent = { background: '#fff', borderRadius: '16px', width: '600px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const infoBox = { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', marginBottom: '20px' };
const textareaStyle = { width: '100%', height: '250px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace', outline: 'none', resize: 'none' };
const btnConfirm = { flex: 1, padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' };
const btnCancel = { padding: '12px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' };
const tabActive = { padding: '8px 14px', borderRadius: 8, border: '2px solid #4f46e5', background: '#f5f3ff', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const tabIdle = { padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
