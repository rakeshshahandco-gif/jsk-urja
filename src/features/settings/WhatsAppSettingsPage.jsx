import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, Smartphone, Search, Paperclip, MessageSquare, ShieldCheck, Send, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { getWhatsAppSettings, updateWhatsAppSettings, checkWhatsAppSession, connectWhatsApp, disconnectWhatsApp } from '@/services/whatsappApi';
import toast from 'react-hot-toast';

export default function WhatsAppSettingsPage() {
    const [settings, setSettings] = useState({
        enabled: true,
        defaultCountryCode: '91',
        soTemplate: '',
        poTemplate: '',
        searchDelay: 2000,
        attachDelay: 3000,
        sendDelay: 2000
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sessionStatus, setSessionStatus] = useState({ connected: false, checking: true });
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const loadSessionStatus = useCallback(async () => {
        try {
            const status = await checkWhatsAppSession();
            setSessionStatus({ connected: status.connected, checking: false });
        } catch {
            setSessionStatus({ connected: false, checking: false });
        }
    }, []);

    useEffect(() => {
        getWhatsAppSettings()
            .then(data => setSettings(prev => data || prev))
            .catch(() => toast.error('Failed to load WhatsApp settings'))
            .finally(() => setLoading(false));
        loadSessionStatus();
    }, [loadSessionStatus]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateWhatsAppSettings(settings);
            toast.success('Settings saved successfully');
        } catch {
            toast.error('Failed to save settings');
        } finally { setSaving(false); }
    };

    const handleConnect = async () => {
        setConnecting(true);
        toast.loading('Opening WhatsApp Web — please scan the QR code in the Chrome window that opens...', { id: 'wa-connect', duration: 95000 });
        try {
            const res = await connectWhatsApp();
            toast.dismiss('wa-connect');
            toast.success(res.message || 'WhatsApp connected!');
            loadSessionStatus();
        } catch (e) {
            toast.dismiss('wa-connect');
            toast.error(e.response?.data?.message || 'Failed to connect WhatsApp');
        } finally { setConnecting(false); }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('This will clear the WhatsApp session. You will need to scan QR again. Continue?')) return;
        setDisconnecting(true);
        try {
            await disconnectWhatsApp();
            toast.success('WhatsApp session cleared');
            loadSessionStatus();
        } catch {
            toast.error('Failed to disconnect');
        } finally { setDisconnecting(false); }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading Settings...</div>;

    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: '10px',
        border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
        transition: 'border-color 0.2s', marginBottom: '4px', boxSizing: 'border-box'
    };
    const sectionStyle = {
        background: '#fff', borderRadius: '16px', padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        border: '1px solid #f1f5f9', marginBottom: '24px'
    };

    const isConnected = sessionStatus.connected;

    return (
        <div style={{ padding: '32px 40px', maxWidth: '900px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>WhatsApp Automation</h1>
                    <p style={{ color: '#64748b', fontSize: '15px', marginTop: '4px' }}>Configure browser-based WhatsApp automation for SO and PO sending.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px',
                        background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '12px',
                        fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(124,58,237,0.3)'
                    }}
                >
                    {saving ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                </button>
            </div>

            {/* ── WhatsApp Session Status ── */}
            <div style={{ ...sectionStyle, border: isConnected ? '1.5px solid #86efac' : '1.5px solid #fca5a5', background: isConnected ? '#f0fdf4' : '#fff5f5' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ padding: '10px', background: isConnected ? '#dcfce7' : '#fee2e2', borderRadius: '12px', color: isConnected ? '#16a34a' : '#dc2626' }}>
                            {isConnected ? <Wifi size={24} /> : <WifiOff size={24} />}
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '18px', color: isConnected ? '#16a34a' : '#dc2626' }}>
                                {sessionStatus.checking ? 'Checking...' : isConnected ? '✓ WhatsApp Connected' : '✗ WhatsApp Not Connected'}
                            </div>
                            <div style={{ fontSize: '13px', color: '#64748b', marginTop: 2 }}>
                                {isConnected
                                    ? 'Session is active. You can send SO/PO via WhatsApp directly.'
                                    : 'Click "Connect WhatsApp" to set up. A Chrome window will open — scan the QR code with your phone.'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={loadSessionStatus}
                            style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>
                        {!isConnected ? (
                            <button
                                onClick={handleConnect}
                                disabled={connecting}
                                style={{
                                    padding: '10px 20px', background: '#25d366', color: '#fff', border: 'none',
                                    borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    boxShadow: '0 4px 12px rgba(37,211,102,0.35)', opacity: connecting ? 0.7 : 1
                                }}
                            >
                                <MessageSquare size={18} />
                                {connecting ? 'Opening Chrome — scan QR...' : 'Connect WhatsApp'}
                            </button>
                        ) : (
                            <button
                                onClick={handleDisconnect}
                                disabled={disconnecting}
                                style={{ padding: '10px 20px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                            >
                                {disconnecting ? 'Clearing...' : 'Disconnect'}
                            </button>
                        )}
                    </div>
                </div>

                {!isConnected && (
                    <div style={{ marginTop: 16, padding: '14px 16px', background: '#fff7ed', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                        <div style={{ fontSize: 13, color: '#9a3412', fontWeight: 600, marginBottom: 6 }}>📱 How to Connect (One-Time Setup):</div>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: 13, color: '#7c3412', lineHeight: 1.7 }}>
                            <li>Click <strong>"Connect WhatsApp"</strong> above</li>
                            <li>A Chrome window will open with WhatsApp Web</li>
                            <li>On your phone, open WhatsApp → Menu → Linked Devices → Link a device</li>
                            <li>Scan the QR code shown in the Chrome window</li>
                            <li>Once connected, close that Chrome window — the session is saved!</li>
                            <li>From now on, sending via WhatsApp will work automatically 🎉</li>
                        </ol>
                    </div>
                )}
            </div>

            {/* ── General Config ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ padding: '8px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '8px' }}><ShieldCheck size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>General Configuration</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Automation Enabled</label>
                        <select value={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.value === 'true' })} style={inputStyle}>
                            <option value="true">Yes, Enable Automation</option>
                            <option value="false">No, Disable for now</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Default Country Code</label>
                        <input value={settings.defaultCountryCode} onChange={e => setSettings({ ...settings, defaultCountryCode: e.target.value })} style={inputStyle} placeholder="e.g., 91" />
                    </div>
                </div>
            </div>

            {/* ── Message Templates ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2px' }}>
                    <div style={{ padding: '8px', background: '#f0fdf4', color: '#16a34a', borderRadius: '8px' }}><MessageSquare size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Message Templates</h2>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>Placeholders: {'{order_number}'}, {'{order_date}'}, {'{company_name}'}</p>
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Sales Order (SO) Template</label>
                    <textarea value={settings.soTemplate} onChange={e => setSettings({ ...settings, soTemplate: e.target.value })} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Purchase Order (PO) Template</label>
                    <textarea value={settings.poTemplate} onChange={e => setSettings({ ...settings, poTemplate: e.target.value })} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} />
                </div>
            </div>

            {/* ── Timing Delays ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ padding: '8px', background: '#fff7ed', color: '#ea580c', borderRadius: '8px' }}><Smartphone size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Automation Timing Delays</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                    {[
                        ['Search Delay (ms)', 'searchDelay', Search],
                        ['Attach Delay (ms)', 'attachDelay', Paperclip],
                        ['Send Delay (ms)', 'sendDelay', Send],
                    ].map(([label, key, Icon]) => (
                        <div key={key}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <Icon size={14} color="#64748b" />
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>{label}</label>
                            </div>
                            <input type="number" value={settings[key]} onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })} style={inputStyle} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
