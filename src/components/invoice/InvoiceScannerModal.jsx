import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { lookupInvoiceByCode } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';

export default function InvoiceScannerModal({ open, onClose }) {
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const html5Ref = useRef(null);

  const resolveCode = async (code) => {
    const raw = String(code || '').trim();
    if (!raw) return;
    try {
      const data = await lookupInvoiceByCode(raw);
      const id = data?._id;
      if (!id) throw new Error('Not found');
      toast.success(`Invoice ${data.displayInvoiceNumber || data.invoiceNumber}`);
      onClose?.();
      navigate(PATHS.SALES.INVOICE_DETAIL(id));
    } catch {
      toast.error('Invoice not found for: ' + raw);
    }
  };

  useEffect(() => {
    if (!open) return undefined;

    const startCamera = async () => {
      try {
        setScanning(true);
        const scanner = new Html5Qrcode('invoice-qr-reader');
        html5Ref.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            scanner.stop().catch(() => {});
            html5Ref.current = null;
            setScanning(false);
            resolveCode(decoded);
          },
          () => {},
        );
        scannerRef.current = scanner;
      } catch {
        setScanning(false);
      }
    };

    startCamera();

    return () => {
      const s = html5Ref.current;
      if (s) {
        s.stop().catch(() => {});
        s.clear().catch(() => {});
        html5Ref.current = null;
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Scan Invoice QR / Barcode</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
          Use camera or USB scanner. Paste invoice number and press Enter.
        </p>
        <div id="invoice-qr-reader" style={{ width: '100%', minHeight: scanning ? 260 : 80, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }} />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && resolveCode(manualCode)}
            placeholder="Invoice number or scan result"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            autoFocus
          />
          <button type="button" onClick={() => resolveCode(manualCode)} style={{ padding: '10px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
