import React, { useState, useEffect } from 'react';
import { leadApi } from '@/services/leadApi';

/**
 * Manual paste of a WhatsApp chat. NO automated scraping/integration.
 * Sales user copies the chat text out of WhatsApp themselves and pastes it here.
 * Saved as a Lead with source='whatsapp'.
 *
 * Optional initial values let the in-CRM WhatsApp Messenger pre-fill the form
 * directly from an active chat. All props remain backward-compatible (default '').
 */
export default function ConvertFromWhatsAppModal({
    open, onClose, onCreated,
    initialMessageText = '',
    initialCustomerName = '',
    initialCustomerMobile = '',
}) {
    const [messageText, setMessageText] = useState(initialMessageText);
    const [customerName, setCustomerName] = useState(initialCustomerName);
    const [customerMobile, setCustomerMobile] = useState(initialCustomerMobile);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setMessageText(initialMessageText);
            setCustomerName(initialCustomerName);
            setCustomerMobile(initialCustomerMobile);
            setError('');
        }
    }, [open, initialMessageText, initialCustomerName, initialCustomerMobile]);

    if (!open) return null;

    const reset = () => {
        setMessageText('');
        setCustomerName('');
        setCustomerMobile('');
        setError('');
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!messageText.trim()) {
            setError('Paste at least one line of the WhatsApp chat.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const lead = await leadApi.fromWhatsApp({
                messageText: messageText.trim(),
                customerName: customerName.trim() || undefined,
                customerMobile: customerMobile.trim() || undefined,
                receivedAt: new Date().toISOString(),
            });
            reset();
            onCreated?.(lead);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Could not convert to lead');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={panel} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Convert WhatsApp chat to Lead</strong>
                    <button onClick={onClose}>Close</button>
                </div>
                <form onSubmit={submit} style={{ padding: 16, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Manually paste the WhatsApp message text below. The conversation will be saved as a new Lead with source = whatsapp.
                    </div>
                    <Row label="Customer Name">
                        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={input} />
                    </Row>
                    <Row label="Customer Mobile">
                        <input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} style={input} placeholder="e.g. +91 9xxxxxxxxx" />
                    </Row>
                    <Row label="WhatsApp Message Text *">
                        <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows={6}
                            placeholder="Paste the WhatsApp chat text exactly as received..."
                            style={input}
                            required
                        />
                    </Row>

                    {error && <div style={{ color: '#dc2626' }}>{error}</div>}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button
                            type="submit"
                            disabled={saving}
                            style={{ background: '#16a34a', color: 'white', padding: '8px 14px', border: 'none', borderRadius: 6 }}
                        >
                            {saving ? 'Converting...' : 'Convert to Lead'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

const input = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panel = {
    background: 'white', borderRadius: 8, width: 560, maxWidth: '92vw',
    boxShadow: '0 10px 40px rgba(15,23,42,0.25)',
};
