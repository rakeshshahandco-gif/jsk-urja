import React, { useEffect, useState } from 'react';
import { getInvoiceBarcodeSettings, updateInvoiceBarcodeSettings } from '@/services/salesApi';
import toast from 'react-hot-toast';

const defaults = {
  enableQr: true,
  enableBarcode: true,
  qrSize: 96,
  barcodeHeight: 40,
  barcodeType: 'code128',
  publicLinkEnabled: false,
  paymentLink: '',
  websiteUrl: '',
  includeDispatchBarcode: false,
};

export default function InvoiceBarcodeSettingsCard() {
  const [settings, setSettings] = useState(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getInvoiceBarcodeSettings()
      .then((s) => setSettings({ ...defaults, ...s }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateInvoiceBarcodeSettings(settings);
      toast.success('Invoice QR/Barcode settings saved');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setSettings((p) => ({ ...p, [key]: val }));

  return (
    <div style={{ marginTop: 28, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Invoice QR & Barcode</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>Controls print, PDF, WhatsApp PDF, and mobile scanning.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label><input type="checkbox" checked={settings.enableQr} onChange={(e) => set('enableQr', e.target.checked)} /> Enable QR Code</label>
        <label><input type="checkbox" checked={settings.enableBarcode} onChange={(e) => set('enableBarcode', e.target.checked)} /> Enable Barcode</label>
        <label><input type="checkbox" checked={settings.publicLinkEnabled} onChange={(e) => set('publicLinkEnabled', e.target.checked)} /> Public invoice link (secure token)</label>
        <label><input type="checkbox" checked={settings.includeDispatchBarcode} onChange={(e) => set('includeDispatchBarcode', e.target.checked)} /> Barcode = Dispatch ref (if set)</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>QR size (px)</span>
          <input type="number" min={64} max={200} value={settings.qrSize} onChange={(e) => set('qrSize', Number(e.target.value))} style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Barcode height</span>
          <input type="number" min={20} max={80} value={settings.barcodeHeight} onChange={(e) => set('barcodeHeight', Number(e.target.value))} style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Barcode type</span>
          <select value={settings.barcodeType} onChange={(e) => set('barcodeType', e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4 }}>
            <option value="code128">Code128</option>
            <option value="qrcode">QR (as barcode)</option>
          </select>
        </div>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Payment link (optional)</span>
          <input value={settings.paymentLink} onChange={(e) => set('paymentLink', e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4 }} placeholder="UPI / payment URL" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Website URL (optional)</span>
          <input value={settings.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </div>
      </div>
      <button type="button" onClick={save} disabled={saving} style={{ marginTop: 16, padding: '10px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving...' : 'Save QR/Barcode Settings'}
      </button>
    </div>
  );
}
