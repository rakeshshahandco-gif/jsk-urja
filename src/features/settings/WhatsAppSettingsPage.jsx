import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Settings, Save, Smartphone, Search, Paperclip, MessageSquare,
    ShieldCheck, Send, Wifi, WifiOff, RefreshCw, QrCode, CheckCircle2,
    AlertCircle, Loader2, LogOut, Phone
} from 'lucide-react';
import {
    getWhatsAppSettings,
    updateWhatsAppSettings,
    getWhatsAppStatus,
    connectWhatsApp,
    disconnectWhatsApp
} from '@/services/whatsappApi';
import { useSocket } from '@/contexts/SocketContext';
import toast from 'react-hot-toast';

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, phone }) => {
    const map = {
        CONNECTED:    { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: CheckCircle2, label: `Connected${phone ? ` as +${phone}` : ''}` },
        WAITING_SCAN: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: QrCode,        label: 'Scan QR with your phone' },
        CONNECTING:   { color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd', icon: Loader2,       label: 'Connecting...' },
        RECONNECTING: { color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd', icon: Loader2,       label: 'Reconnecting...' },
        LOGGED_OUT:   { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: WifiOff,       label: 'Logged out — scan QR to reconnect' },
        ERROR:        { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: AlertCircle,   label: 'Connection error' },
        DISCONNECTED: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: WifiOff,       label: 'Not connected' },
    };
    const cfg = map[status] || map.DISCONNECTED;
    const Icon = cfg.icon;
    const spin = ['CONNECTING', 'RECONNECTING'].includes(status);

    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            color: cfg.color, fontWeight: 700, fontSize: 13,
        }}>
            <Icon size={15} style={spin ? { animation: 'spin 1s linear infinite' } : {}} />
            {cfg.label}
        </div>
    );
};

export default function WhatsAppSettingsPage() {
    const { socket, connected: socketConnected } = useSocket();

    const [settings, setSettings] = useState({
        enabled: true,
        defaultCountryCode: '91',
        soTemplate: '',
        poTemplate: '',
        searchDelay: 2000,
        attachDelay: 3000,
        sendDelay: 2000,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // WhatsApp connection state
    const [waStatus, setWaStatus] = useState({
        status: 'DISCONNECTED',
        connected: false,
        loggedIn: false,
        phone: null,
        message: '',
    });
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const qrTimeoutRef = useRef(null);

    // ── Load initial data ───────────────────────────────────────────────────
    useEffect(() => {
        Promise.all([
            getWhatsAppSettings().catch(() => null),
            getWhatsAppStatus().catch(() => null),
        ]).then(([settingsData, statusData]) => {
            if (settingsData) setSettings(prev => ({ ...prev, ...settingsData }));
            if (statusData)  setWaStatus(prev => ({ ...prev, ...statusData }));
        }).finally(() => setLoading(false));
    }, []);

    // ── Socket.io: join whatsapp room + listen for events ───────────────────
    useEffect(() => {
        if (!socket || !socketConnected) return;

        socket.emit('join:whatsapp');

        const onStatus = (data) => {
            console.log('[WhatsApp] Status update:', data);
            setWaStatus(data);
            if (data.status === 'CONNECTED') {
                setQrDataUrl(null);  // hide QR once connected
                setConnecting(false);
                if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
                toast.success(`✅ WhatsApp connected as +${data.phone || ''}!`);
            }
            if (data.status === 'LOGGED_OUT' || data.status === 'ERROR') {
                setConnecting(false);
            }
        };

        const onQr = ({ qr }) => {
            console.log('[WhatsApp] QR received');
            setQrDataUrl(qr);
            setWaStatus(prev => ({ ...prev, status: 'WAITING_SCAN', connected: false }));
            setConnecting(false);

            // Auto-expire QR after 60 seconds
            if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
            qrTimeoutRef.current = setTimeout(() => {
                setQrDataUrl(null);
                setWaStatus(prev => ({ ...prev, status: 'DISCONNECTED', message: 'QR expired. Click Connect again.' }));
            }, 60000);
        };

        const onReady = (data) => {
            setWaStatus(data);
            setQrDataUrl(null);
            setConnecting(false);
        };

        socket.on('whatsapp:status', onStatus);
        socket.on('whatsapp:qr', onQr);
        socket.on('whatsapp:ready', onReady);

        return () => {
            socket.emit('leave:whatsapp');
            socket.off('whatsapp:status', onStatus);
            socket.off('whatsapp:qr', onQr);
            socket.off('whatsapp:ready', onReady);
            if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
        };
    }, [socket, socketConnected]);

    // ── Handlers ────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            await updateWhatsAppSettings(settings);
            toast.success('Settings saved!');
        } catch {
            toast.error('Failed to save settings');
        } finally { setSaving(false); }
    };

    const handleConnect = async () => {
        setConnecting(true);
        setQrDataUrl(null);
        setWaStatus(prev => ({ ...prev, status: 'CONNECTING', message: 'Starting connection...' }));
        try {
            await connectWhatsApp();
            // Response is immediate (non-blocking). QR arrives via socket event.
            toast.success('Connection started — QR code will appear below', { duration: 5000 });
        } catch (e) {
            setConnecting(false);
            setWaStatus(prev => ({ ...prev, status: 'ERROR' }));
            toast.error(e.response?.data?.message || 'Failed to start WhatsApp connection');
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('This will log out WhatsApp. You will need to scan the QR again. Continue?')) return;
        setDisconnecting(true);
        try {
            await disconnectWhatsApp();
            setWaStatus({ status: 'DISCONNECTED', connected: false, loggedIn: false, phone: null, message: '' });
            setQrDataUrl(null);
            toast.success('WhatsApp disconnected');
        } catch {
            toast.error('Failed to disconnect');
        } finally { setDisconnecting(false); }
    };

    const handleRefresh = async () => {
        try {
            const status = await getWhatsAppStatus();
            setWaStatus(status);
        } catch {
            toast.error('Failed to refresh status');
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: '#64748b' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> Loading settings...
        </div>
    );

    const isConnected = waStatus.status === 'CONNECTED';
    const isWaiting   = waStatus.status === 'WAITING_SCAN';
    const isBusy      = ['CONNECTING', 'RECONNECTING'].includes(waStatus.status);

    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: 10,
        border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
        transition: 'border-color 0.2s', marginBottom: 4, boxSizing: 'border-box',
        fontFamily: 'inherit',
    };
    const sectionStyle = {
        background: '#fff', borderRadius: 16, padding: 24,
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        border: '1px solid #f1f5f9', marginBottom: 24,
    };

    return (
        <div style={{ padding: '32px 40px', maxWidth: 920, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>
                        WhatsApp Integration
                    </h1>
                    <p style={{ color: '#64748b', fontSize: 15, marginTop: 4, margin: '4px 0 0' }}>
                        Log in to WhatsApp Web directly from the CRM. Messages and documents auto-send via Baileys.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px',
                        background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12,
                        fontWeight: 700, cursor: 'pointer', fontSize: 14,
                        boxShadow: '0 10px 15px -3px rgba(124,58,237,0.3)',
                        opacity: saving ? 0.7 : 1,
                    }}
                >
                    {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save size={16} /> Save Changes</>}
                </button>
            </div>

            {/* ── WhatsApp Connection Panel ── */}
            <div style={{
                ...sectionStyle,
                border: isConnected ? '1.5px solid #86efac' : isWaiting ? '1.5px solid #fcd34d' : '1.5px solid #e2e8f0',
                background: isConnected ? '#f0fdf4' : isWaiting ? '#fffbeb' : '#fff',
            }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: isConnected ? '#dcfce7' : '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isConnected ? '#16a34a' : '#64748b',
                        }}>
                            {isConnected ? <Wifi size={22} /> : <WifiOff size={22} />}
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', marginBottom: 2 }}>
                                WhatsApp Connection
                            </div>
                            <StatusBadge status={waStatus.status} phone={waStatus.phone} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Socket indicator */}
                        <div style={{
                            fontSize: 11, padding: '4px 10px', borderRadius: 999,
                            background: socketConnected ? '#f0fdf4' : '#fef2f2',
                            color: socketConnected ? '#16a34a' : '#dc2626',
                            border: `1px solid ${socketConnected ? '#86efac' : '#fca5a5'}`,
                            fontWeight: 600,
                        }}>
                            {socketConnected ? '● Live' : '○ Offline'}
                        </div>

                        <button
                            onClick={handleRefresh}
                            title="Refresh status"
                            style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569' }}
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>

                        {!isConnected ? (
                            <button
                                onClick={handleConnect}
                                disabled={connecting || isBusy}
                                style={{
                                    padding: '10px 20px', background: '#25d366', color: '#fff', border: 'none',
                                    borderRadius: 10, cursor: (connecting || isBusy) ? 'not-allowed' : 'pointer',
                                    fontWeight: 700, fontSize: 14,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    boxShadow: '0 4px 12px rgba(37,211,102,0.35)',
                                    opacity: (connecting || isBusy) ? 0.7 : 1,
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                {(connecting || isBusy) ? (
                                    <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connecting...</>
                                ) : (
                                    <><QrCode size={16} /> Connect WhatsApp</>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleDisconnect}
                                disabled={disconnecting}
                                style={{
                                    padding: '10px 20px', background: '#fef2f2', color: '#dc2626',
                                    border: '1.5px solid #fca5a5', borderRadius: 10, cursor: 'pointer',
                                    fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
                                }}
                            >
                                {disconnecting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={16} />}
                                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── QR Code Display ── */}
                {qrDataUrl && (
                    <div style={{
                        marginTop: 28,
                        display: 'flex',
                        gap: 32,
                        alignItems: 'center',
                        padding: '24px 28px',
                        background: '#fffbeb',
                        borderRadius: 14,
                        border: '2px dashed #fbbf24',
                    }}>
                        {/* QR Box */}
                        <div style={{
                            background: '#fff',
                            padding: 16,
                            borderRadius: 14,
                            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                            flexShrink: 0,
                        }}>
                            <img
                                src={qrDataUrl}
                                alt="WhatsApp QR Code"
                                style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }}
                            />
                        </div>
                        {/* Instructions */}
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 6 }}>
                                Scan to Link WhatsApp
                            </div>
                            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
                                This QR code will expire in 60 seconds. Once you scan it, WhatsApp will stay connected and all SO/PO sending will work automatically.
                            </p>
                            <ol style={{ paddingLeft: 18, margin: 0, color: '#475569', fontSize: 14, lineHeight: 2 }}>
                                <li>Open <strong>WhatsApp</strong> on your phone</li>
                                <li>Tap <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
                                <li>Tap <strong>"Link a Device"</strong></li>
                                <li>Point your camera at the QR code ← on the left</li>
                            </ol>
                        </div>
                    </div>
                )}

                {/* ── Connected Info ── */}
                {isConnected && waStatus.phone && (
                    <div style={{
                        marginTop: 20, padding: '14px 18px', borderRadius: 10,
                        background: '#dcfce7', border: '1px solid #86efac',
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%', background: '#16a34a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Phone size={18} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>
                                Linked to +{waStatus.phone}
                            </div>
                            <div style={{ fontSize: 12, color: '#166534' }}>
                                Session is active. WhatsApp messages and documents will auto-send from this number.
                            </div>
                        </div>
                    </div>
                )}

                {/* ── How to connect instructions (when disconnected, no QR) ── */}
                {!isConnected && !qrDataUrl && !isBusy && (
                    <div style={{ marginTop: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                            📱 One-Time Setup (takes ~10 seconds):
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
                            <li>Click <strong>"Connect WhatsApp"</strong> above</li>
                            <li>A QR code will appear in this panel (no Chrome window needed!)</li>
                            <li>Scan it with your phone from WhatsApp → Linked Devices</li>
                            <li>Done! Session is saved — won't need to re-scan on server restart</li>
                        </ol>
                    </div>
                )}
            </div>

            {/* ── General Config ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ padding: 8, background: '#f5f3ff', color: '#7c3aed', borderRadius: 8 }}><ShieldCheck size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>General Configuration</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Automation Enabled</label>
                        <select
                            value={settings.enabled}
                            onChange={e => setSettings({ ...settings, enabled: e.target.value === 'true' })}
                            style={inputStyle}
                        >
                            <option value="true">Yes, Enable Automation</option>
                            <option value="false">No, Disable for now</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Default Country Code</label>
                        <input
                            value={settings.defaultCountryCode}
                            onChange={e => setSettings({ ...settings, defaultCountryCode: e.target.value })}
                            style={inputStyle}
                            placeholder="e.g., 91"
                        />
                    </div>
                </div>
            </div>

            {/* ── Message Templates ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <div style={{ padding: 8, background: '#f0fdf4', color: '#16a34a', borderRadius: 8 }}><MessageSquare size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Message Templates</h2>
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
                    Placeholders: {'{order_number}'}, {'{order_date}'}, {'{company_name}'}
                </p>
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Sales Order (SO) Template</label>
                    <textarea
                        value={settings.soTemplate}
                        onChange={e => setSettings({ ...settings, soTemplate: e.target.value })}
                        style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Purchase Order (PO) Template</label>
                    <textarea
                        value={settings.poTemplate}
                        onChange={e => setSettings({ ...settings, poTemplate: e.target.value })}
                        style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                    />
                </div>
            </div>

            {/* ── Timing Delays ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ padding: 8, background: '#fff7ed', color: '#ea580c', borderRadius: 8 }}><Smartphone size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Automation Timing Delays</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                    {[
                        ['Search Delay (ms)', 'searchDelay', Search],
                        ['Attach Delay (ms)', 'attachDelay', Paperclip],
                        ['Send Delay (ms)', 'sendDelay', Send],
                    ].map(([label, key, Icon]) => (
                        <div key={key}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Icon size={14} color="#64748b" />
                                <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{label}</label>
                            </div>
                            <input
                                type="number"
                                value={settings[key]}
                                onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })}
                                style={inputStyle}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Spinner keyframe */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
