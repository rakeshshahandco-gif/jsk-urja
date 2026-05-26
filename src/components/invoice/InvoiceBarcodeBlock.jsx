import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { getInvoiceBarcodeData } from '@/services/salesApi';

export default function InvoiceBarcodeBlock({ invoiceId, variant = 'screen', payload: payloadProp }) {
  const [payload, setPayload] = useState(payloadProp || null);
  const [loading, setLoading] = useState(!payloadProp && !!invoiceId);

  useEffect(() => {
    if (payloadProp) {
      setPayload(payloadProp);
      return;
    }
    if (!invoiceId) return;
    let cancelled = false;
    setLoading(true);
    getInvoiceBarcodeData(invoiceId)
      .then((data) => { if (!cancelled) setPayload(data); })
      .catch(() => { if (!cancelled) setPayload(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [invoiceId, payloadProp]);

  if (loading || !payload) return null;
  const { settings, qrText, barcodeValue } = payload;
  if (!settings?.enableQr && !settings?.enableBarcode) return null;

  const qrSize = variant === 'print' ? Math.min(settings.qrSize || 96, 100) : (settings.qrSize || 96);
  const bcHeight = variant === 'print' ? Math.min(settings.barcodeHeight || 40, 48) : (settings.barcodeHeight || 40);

  const wrapStyle = variant === 'print'
    ? { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 16, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #ccc' }
    : { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', padding: '12px 0' };

  return (
    <div className="invoice-barcode-block" style={wrapStyle}>
      {settings.enableBarcode && barcodeValue && (
        <div style={{ textAlign: 'center' }}>
          <Barcode
            value={barcodeValue}
            format="CODE128"
            width={variant === 'print' ? 1.2 : 1.5}
            height={bcHeight}
            displayValue
            fontSize={10}
            margin={2}
          />
        </div>
      )}
      {settings.enableQr && qrText && (
        <div style={{ textAlign: 'center' }}>
          <QRCodeSVG value={qrText} size={qrSize} level="M" includeMargin />
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Scan for invoice details</div>
        </div>
      )}
    </div>
  );
}
