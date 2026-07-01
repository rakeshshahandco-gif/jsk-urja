import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings, Save, Smartphone, Search, Paperclip, MessageSquare,
    ShieldCheck, Send, Wifi, WifiOff, RefreshCw, QrCode, CheckCircle2,
    AlertCircle, Loader2, LogOut, Phone, ExternalLink, UserPlus, Share2
} from 'lucide-react';
import {
    getWhatsAppSettings,
    updateWhatsAppSettings,
    getWhatsAppStatus,
    connectWhatsApp,
    requestWhatsAppPairingCode,
    disconnectWhatsApp,
    sendWhatsAppMessage
} from '@/services/whatsappApi';
import { useSocket } from '@/contexts/SocketContext';
import toast from 'react-hot-toast';
import ConvertFromWhatsAppModal from '@/features/leads/components/ConvertFromWhatsAppModal';
import ProductCatalogPicker from '@/features/productCatalog/components/ProductCatalogPicker';

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, phone }) => {
    const map = {
        CONNECTED:    { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: CheckCircle2, label: `Connected${phone ? ` as +${phone}` : ''}` },
        WAITING_SCAN: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: QrCode,        label: 'Scan QR with your phone' },
        WAITING_PAIRING: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: Phone,       label: 'Enter pairing code on your phone' },
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
    const navigate = useNavigate();

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

    // Link method: QR (default, unchanged) or mobile-number pairing
    const [linkMode, setLinkMode] = useState('qr');
    const [pairingPhone, setPairingPhone] = useState('');
    const [pairingCode, setPairingCode] = useState(null);
    const [pairingConnecting, setPairingConnecting] = useState(false);

    const qrTimeoutRef = useRef(null);
    const pairingTimeoutRef = useRef(null);

    // ── WhatsApp quick-action modal state ───────────────────────────────────
    // (Uses yesterday's ConvertFromWhatsAppModal + ProductCatalogPicker)
    const [convertOpen, setConvertOpen] = useState(false);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [sharingCatalog, setSharingCatalog] = useState(false);

    const openWhatsAppWeb = () => {
        // "WhatsApp open in CRM" — actual WhatsApp Web in a new tab.
        window.open('https://web.whatsapp.com', '_blank', 'noopener');
    };

    const handleCatalogConfirm = async (picked) => {
        if (!picked || picked.length === 0) { setCatalogOpen(false); return; }
        // Ask once for the phone to send to.
        const phone = (window.prompt(
            'Phone number (with country code, digits only) to share catalog with:\n' +
            'e.g. 919920730373'
        ) || '').replace(/\D/g, '');
        if (!phone) { setCatalogOpen(false); return; }

        setSharingCatalog(true);
        try {
            // Build a single WhatsApp message containing each product's name + any catalog/datasheet PDF URLs.
            const lines = picked.map(p => {
                const bits = [`*${p.name}*${p.code ? ` (${p.code})` : ''}`];
                if (p.shortDescription) bits.push(p.shortDescription);
                if (p.catalogPdfUrl)   bits.push(`Catalog:   ${p.catalogPdfUrl}`);
                if (p.datasheetPdfUrl) bits.push(`Datasheet: ${p.datasheetPdfUrl}`);
                if (p.brochureUrl)     bits.push(`Brochure:  ${p.brochureUrl}`);
                return bits.join('\n');
            });
            const message = `Hello,\n\nSharing the following from our catalog:\n\n${lines.join('\n\n')}\n\nRegards.`;
            await sendWhatsAppMessage({ phone, message });
            toast.success(`Catalog sent to +${phone} (${picked.length} item${picked.length > 1 ? 's' : ''})`);
            setCatalogOpen(false);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Could not send catalog over WhatsApp');
        } finally {
            setSharingCatalog(false);
        }
    };

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
                setQrDataUrl(null);
                setPairingCode(null);
                setConnecting(false);
                setPairingConnecting(false);
                if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
                if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
                toast.success(`✅ WhatsApp connected as +${data.phone || ''}!`);
            }
            if (data.status === 'LOGGED_OUT' || data.status === 'ERROR') {
                setConnecting(false);
                setPairingConnecting(false);
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
            setPairingCode(null);
            setConnecting(false);
            setPairingConnecting(false);
        };

        const onPairingCode = ({ code, expiresIn }) => {
            setPairingCode(code);
            setPairingConnecting(false);
            setWaStatus(prev => ({ ...prev, status: 'WAITING_PAIRING', connected: false }));
            if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
            pairingTimeoutRef.current = setTimeout(() => {
                setPairingCode(null);
                setWaStatus(prev => ({ ...prev, status: 'DISCONNECTED', message: 'Pairing code expired. Request a new code.' }));
            }, (expiresIn || 120) * 1000);
        };

        const onPairingExpired = () => {
            setPairingCode(null);
            setPairingConnecting(false);
        };

        socket.on('whatsapp:status', onStatus);
        socket.on('whatsapp:qr', onQr);
        socket.on('whatsapp:ready', onReady);
        socket.on('whatsapp:pairing-code', onPairingCode);
        socket.on('whatsapp:pairing-code-expired', onPairingExpired);

        return () => {
            socket.emit('leave:whatsapp');
            socket.off('whatsapp:status', onStatus);
            socket.off('whatsapp:qr', onQr);
            socket.off('whatsapp:ready', onReady);
            socket.off('whatsapp:pairing-code', onPairingCode);
            socket.off('whatsapp:pairing-code-expired', onPairingExpired);
            if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current);
            if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
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
        setPairingCode(null);
        setWaStatus(prev => ({ ...prev, status: 'CONNECTING', message: 'Starting connection...' }));
        try {
            await connectWhatsApp();
            toast.success('Connection started — QR code will appear below', { duration: 5000 });
        } catch (e) {
            setConnecting(false);
            setWaStatus(prev => ({ ...prev, status: 'ERROR' }));
            toast.error(e.response?.data?.message || 'Failed to start WhatsApp connection');
        }
    };

    const handleRequestPairingCode = async () => {
        const trimmed = pairingPhone.trim();
        if (!trimmed) {
            toast.error('Enter your mobile number with country code (e.g. +919820000000)');
            return;
        }
        setPairingConnecting(true);
        setPairingCode(null);
        setQrDataUrl(null);
        setWaStatus(prev => ({ ...prev, status: 'CONNECTING', message: 'Requesting pairing code...' }));
        try {
            await requestWhatsAppPairingCode(trimmed);
            toast.success('Pairing code will appear below shortly', { duration: 5000 });
        } catch (e) {
            setPairingConnecting(false);
            setWaStatus(prev => ({ ...prev, status: 'ERROR' }));
            toast.error(e.response?.data?.message || 'Failed to request pairing code');
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('This will log out WhatsApp. You will need to link again (QR or pairing code). Continue?')) return;
        setDisconnecting(true);
        try {
            await disconnectWhatsApp();
            setWaStatus({ status: 'DISCONNECTED', connected: false, loggedIn: false, phone: null, message: '' });
            setQrDataUrl(null);
            setPairingCode(null);
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
    const isWaitingPairing = waStatus.status === 'WAITING_PAIRING';
    const isBusy      = ['CONNECTING', 'RECONNECTING'].includes(waStatus.status);

    const tabBtnStyle = (active) => ({
        padding: '10px 18px',
        borderRadius: 10,
        border: active ? '1.5px solid #25d366' : '1.5px solid #e2e8f0',
        background: active ? '#f0fdf4' : '#fff',
        color: active ? '#15803d' : '#475569',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'inherit',
    });

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

                        {isConnected && (
                            <button
                                onClick={() => navigate('/whatsapp/chat')}
                                title="Open in-CRM WhatsApp Messenger"
                                style={{
                                    padding: '10px 18px',
                                    background: '#25d366', color: '#fff', border: 'none',
                                    borderRadius: 10, cursor: 'pointer',
                                    fontWeight: 700, fontSize: 13,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    boxShadow: '0 4px 12px rgba(37,211,102,0.35)',
                                }}
                            >
                                <MessageSquare size={15} /> Open Chat
                            </button>
                        )}

                        {!isConnected && linkMode === 'qr' ? (
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
                        ) : !isConnected ? null : (
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

                {/* ── Link method tabs (when not connected) ── */}
                {!isConnected && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => { setLinkMode('qr'); setPairingCode(null); }}
                            style={tabBtnStyle(linkMode === 'qr')}
                        >
                            <QrCode size={16} /> Link with QR Code
                        </button>
                        <button
                            type="button"
                            onClick={() => { setLinkMode('phone'); setQrDataUrl(null); }}
                            style={tabBtnStyle(linkMode === 'phone')}
                        >
                            <Phone size={16} /> Link with Mobile Number
                        </button>
                    </div>
                )}

                {/* ── QR Code Display (unchanged) ── */}
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

                {/* ── Mobile Number / Pairing Code ── */}
                {!isConnected && linkMode === 'phone' && (
                    <div style={{
                        marginTop: 28,
                        padding: '24px 28px',
                        background: isWaitingPairing || pairingCode ? '#fffbeb' : '#f8fafc',
                        borderRadius: 14,
                        border: isWaitingPairing || pairingCode ? '2px dashed #fbbf24' : '1px solid #e2e8f0',
                    }}>
                        {!pairingCode ? (
                            <>
                                <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 8 }}>
                                    Link with Mobile Number
                                </div>
                                <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
                                    Enter your WhatsApp mobile number with country code. We will generate a pairing code for you to enter on your phone.
                                </p>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ flex: '1 1 220px' }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                                            Mobile Number (with country code)
                                        </label>
                                        <input
                                            type="tel"
                                            value={pairingPhone}
                                            onChange={e => setPairingPhone(e.target.value)}
                                            placeholder="+919820000000"
                                            disabled={pairingConnecting || isBusy}
                                            style={{
                                                width: '100%', padding: '12px 16px', borderRadius: 10,
                                                border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                                                boxSizing: 'border-box', fontFamily: 'inherit',
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRequestPairingCode}
                                        disabled={pairingConnecting || isBusy}
                                        style={{
                                            padding: '12px 20px', background: '#25d366', color: '#fff', border: 'none',
                                            borderRadius: 10, cursor: (pairingConnecting || isBusy) ? 'not-allowed' : 'pointer',
                                            fontWeight: 700, fontSize: 14,
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            opacity: (pairingConnecting || isBusy) ? 0.7 : 1,
                                        }}
                                    >
                                        {(pairingConnecting || isBusy) ? (
                                            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Requesting...</>
                                        ) : (
                                            <><Phone size={16} /> Get Pairing Code</>
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{
                                    background: '#fff',
                                    padding: '20px 28px',
                                    borderRadius: 14,
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                    flexShrink: 0,
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>
                                        YOUR PAIRING CODE
                                    </div>
                                    <div style={{
                                        fontSize: 36, fontWeight: 800, letterSpacing: '0.25em',
                                        color: '#128c7e', fontFamily: 'monospace',
                                    }}>
                                        {pairingCode}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 6 }}>
                                        Enter Code on Your Phone
                                    </div>
                                    <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
                                        This code expires in about 2 minutes. After you enter it, WhatsApp will stay connected and all CRM messaging will work automatically.
                                    </p>
                                    <ol style={{ paddingLeft: 18, margin: 0, color: '#475569', fontSize: 14, lineHeight: 2 }}>
                                        <li>Open <strong>WhatsApp</strong> on your mobile</li>
                                        <li>Go to <strong>Linked Devices</strong></li>
                                        <li>Tap <strong>"Link with phone number instead"</strong></li>
                                        <li>Enter the pairing code shown ← on the left</li>
                                    </ol>
                                    <button
                                        type="button"
                                        onClick={() => { setPairingCode(null); handleRequestPairingCode(); }}
                                        disabled={pairingConnecting || isBusy}
                                        style={{
                                            marginTop: 16, padding: '8px 14px', background: '#f1f5f9',
                                            border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
                                            fontSize: 13, fontWeight: 600, color: '#475569',
                                        }}
                                    >
                                        Request New Code
                                    </button>
                                </div>
                            </div>
                        )}
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

                {/* ── How to connect instructions (when disconnected, no QR, QR tab) ── */}
                {!isConnected && !qrDataUrl && !pairingCode && !isBusy && linkMode === 'qr' && (
                    <div style={{ marginTop: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                            📱 One-Time Setup with QR (takes ~10 seconds):
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
                            <li>Click <strong>"Connect WhatsApp"</strong> above</li>
                            <li>A QR code will appear in this panel (no Chrome window needed!)</li>
                            <li>Scan it with your phone from WhatsApp → Linked Devices</li>
                            <li>Done! Session is saved — won't need to re-scan on server restart</li>
                        </ol>
                    </div>
                )}
                {!isConnected && !pairingCode && !isBusy && linkMode === 'phone' && !pairingConnecting && (
                    <div style={{ marginTop: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                            📱 One-Time Setup with Pairing Code:
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
                            <li>Enter your mobile number with country code (e.g. <strong>+919820000000</strong>)</li>
                            <li>Click <strong>"Get Pairing Code"</strong></li>
                            <li>On your phone: WhatsApp → Linked Devices → Link with phone number instead</li>
                            <li>Enter the code shown here — session is saved after linking</li>
                        </ol>
                    </div>
                )}
            </div>

            {/* ── WhatsApp Quick Actions (matches yesterday's design) ── */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <div style={{ padding: 8, background: '#f0fdf4', color: '#16a34a', borderRadius: 8 }}><MessageSquare size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>WhatsApp Quick Actions</h2>
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>
                    Open WhatsApp directly from the CRM. Convert any conversation into a Lead, or share product catalog / datasheets — all without leaving this page.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    {/* 1. Open WhatsApp Web directly */}
                    <button
                        type="button"
                        onClick={openWhatsAppWeb}
                        title="Open WhatsApp Web in a new tab"
                        style={{
                            textAlign: 'left', padding: '16px 18px', borderRadius: 12,
                            background: '#f0fdf4', border: '1.5px solid #86efac',
                            cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', flexDirection: 'column', gap: 10,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px -8px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 10,
                                background: '#fff', border: '1px solid #86efac',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#16a34a',
                            }}>
                                <MessageSquare size={18} />
                            </div>
                            <ExternalLink size={16} color="#16a34a" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                                Open WhatsApp Web
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                                Chat with any customer directly on WhatsApp.
                            </div>
                        </div>
                    </button>

                    {/* 2. Convert WhatsApp chat → Lead (uses yesterday's modal) */}
                    <button
                        type="button"
                        onClick={() => setConvertOpen(true)}
                        title="Paste a WhatsApp chat and convert it into a Lead"
                        style={{
                            textAlign: 'left', padding: '16px 18px', borderRadius: 12,
                            background: '#f5f3ff', border: '1.5px solid #c4b5fd',
                            cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', flexDirection: 'column', gap: 10,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px -8px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 10,
                                background: '#fff', border: '1px solid #c4b5fd',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#7c3aed',
                            }}>
                                <UserPlus size={18} />
                            </div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                                Convert Chat → Lead
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                                Paste a WhatsApp message; saves as a Lead with source = whatsapp.
                            </div>
                        </div>
                    </button>

                    {/* 3. Send Catalog / Datasheet over WhatsApp (uses yesterday's picker) */}
                    <button
                        type="button"
                        onClick={() => setCatalogOpen(true)}
                        disabled={sharingCatalog}
                        title={waStatus.status === 'CONNECTED'
                            ? 'Pick products and send their catalog / datasheet links over WhatsApp'
                            : 'Will send via WhatsApp once the session above is connected'}
                        style={{
                            textAlign: 'left', padding: '16px 18px', borderRadius: 12,
                            background: '#fff7ed', border: '1.5px solid #fdba74',
                            cursor: sharingCatalog ? 'wait' : 'pointer', fontFamily: 'inherit',
                            display: 'flex', flexDirection: 'column', gap: 10,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            opacity: sharingCatalog ? 0.7 : 1,
                        }}
                        onMouseEnter={e => { if (!sharingCatalog) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px -8px rgba(0,0,0,0.15)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 10,
                                background: '#fff', border: '1px solid #fdba74',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#ea580c',
                            }}>
                                {sharingCatalog
                                    ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Share2 size={18} />}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                                Send Catalog / Datasheet
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                                Pick products and share their catalog &amp; datasheet links over WhatsApp.
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Modals (built yesterday) */}
            <ConvertFromWhatsAppModal
                open={convertOpen}
                onClose={() => setConvertOpen(false)}
                onCreated={(lead) => {
                    setConvertOpen(false);
                    toast.success('Lead created from WhatsApp chat');
                    if (lead?._id) navigate(`/crm/leads/${lead._id}`);
                }}
            />
            <ProductCatalogPicker
                open={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                onConfirm={handleCatalogConfirm}
            />

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
