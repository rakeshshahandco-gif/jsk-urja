import React, { useState, useEffect, useRef } from 'react';
import { Mail, MessageSquare, Send, X, Users, User, Loader2, ExternalLink, Wifi, WifiOff, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { checkWhatsAppSession, connectWhatsApp } from '@/services/whatsappApi';
import { useSocket } from '@/contexts/SocketContext';

export default function CommunicationModal({ isOpen, onClose, onSend, data, type }) {
    const { socket } = useSocket();
    const [sendMode, setSendMode] = useState('Number'); // 'Number' or 'Group'
    const [recipientName, setRecipientName] = useState(data.recipientName || '');
    const [email, setEmail] = useState(data.email || '');
    const [phone, setPhone] = useState(data.phone || '');
    const [groupName, setGroupName] = useState('');
    const [subject, setSubject] = useState(data.subject || `${type} from JSK URJA`);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState('');
    const [sessionStatus, setSessionStatus] = useState({ connected: false, checking: true });
    const [connecting, setConnecting] = useState(false);
    const [channel, setChannel] = useState('');
    
    // Step-wise Status Logs
    const [progressLogs, setProgressLogs] = useState([]);
    const logsEndRef = useRef(null);

    const generateDetailedMsg = () => {
        let msg = `*${type.toUpperCase()} - ${data.number}*\n`;
        msg += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
        msg += `Party: ${data.recipientName}\n`;
        if (data.total) msg += `Total Amount: ₹${data.total.toLocaleString('en-IN')}\n`;
        
        if (data.items && data.items.length > 0) {
            msg += `\n*Item Summary:*\n`;
            data.items.forEach((it, i) => {
                msg += `${i+1}. ${it.itemName || it.description} (${it.qty} ${it.uom})\n`;
            });
        }
        
        msg += `\nKindly review and confirm.\n\nRegards,\nJSK URJA`;
        return msg;
    };

    const [message, setMessage] = useState('');

    useEffect(() => {
        if (data.recipientName) setRecipientName(data.recipientName);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.number) {
             setMessage(generateDetailedMsg());
        }
        
        if (isOpen) {
            checkWhatsAppSession()
                .then(st => setSessionStatus({ connected: st.connected, checking: false }))
                .catch(() => setSessionStatus({ connected: false, checking: false }));

            // Smart Lookup for missing phone/email
            const lookupContact = async () => {
                if ((!phone || !email) && (data.customerId || data.supplierId)) {
                    try {
                        let contactData = null;
                        if (data.customerId) {
                            const res = await api.get(`/customers/${data.customerId}`);
                            const cust = res.data.data;
                            if (cust) {
                                // Find primary contact or first contact
                                const primary = cust.contactPersons?.find(c => c.isPrimary) || cust.contactPersons?.[0];
                                contactData = {
                                    phone: primary?.whatsApp || primary?.mobile || primary?.mobile2 || '',
                                    email: primary?.email || cust.companyEmail || ''
                                };
                            }
                        } else if (data.supplierId) {
                            const res = await api.get(`/suppliers/${data.supplierId}`);
                            const sup = res.data.data;
                            if (sup) {
                                contactData = {
                                    phone: sup.whatsApp || sup.phone || '',
                                    email: sup.email || ''
                                };
                            }
                        }

                        if (contactData) {
                            if (!phone && contactData.phone) setPhone(contactData.phone);
                            if (!email && contactData.email) setEmail(contactData.email);
                        }
                    } catch (err) {
                        console.error('Contact Lookup Failed:', err);
                    }
                }
            };
            lookupContact();
        }
    }, [data, type, isOpen]);

    // Socket Listener for WhatsApp Status
    useEffect(() => {
        if (socket && isOpen) {
            const handleWhatsAppStatus = (update) => {
                console.log('[Socket] WhatsApp Status Update:', update);
                setProgressLogs(prev => [...prev, {
                    text: update.status,
                    code: update.code,
                    time: new Date().toLocaleTimeString()
                }]);

                if (update.code === 'SUCCESS') {
                    setSending(false);
                    setStatus('Successfully Prepared!');
                    toast.success('WhatsApp Draft Ready! Switching window...');
                } else if (update.code === 'ERROR') {
                    setSending(false);
                    setStatus('Failed to prepare draft.');
                    toast.error(update.status || 'Failed to prepare WhatsApp');
                }
            };

            socket.on('whatsapp:status', handleWhatsAppStatus);
            return () => socket.off('whatsapp:status', handleWhatsAppStatus);
        }
    }, [socket, isOpen]);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [progressLogs]);

    const handleConnect = async () => {
        setConnecting(true);
        toast.loading('Opening Private WhatsApp Window...', { id: 'wa-conn' });
        try {
            await connectWhatsApp();
            toast.success('Window Opened! Please scan QR code if not logged in.', { id: 'wa-conn' });
            setTimeout(() => {
                checkWhatsAppSession().then(st => setSessionStatus({ connected: st.connected, checking: false }));
            }, 5000);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to open browser', { id: 'wa-conn' });
        } finally {
            setConnecting(false);
        }
    };

    if (!isOpen) return null;

    const handleSend = async (chan) => {
        // Validation
        if (chan === 'WhatsApp') {
            if (sendMode === 'Number' && (!phone || phone.replace(/\D/g, '').length < 10)) {
                return toast.error('Please enter a valid 10-digit WhatsApp number.');
            }
            if (sendMode === 'Group' && !groupName) {
                return toast.error('Please enter the WhatsApp Group Name.');
            }
        } else if (chan === 'Email' && !email) {
            return toast.error('Please enter a valid email address.');
        }

        setChannel(chan);
        setSending(true);
        setProgressLogs([{ text: `Starting ${chan} process...`, code: 'START', time: new Date().toLocaleTimeString() }]);
        setStatus(chan === 'WhatsApp' ? 'Processing...' : 'Sending Email...');
        
        try {
            await onSend({ 
                channel: chan, 
                recipientName, 
                email, 
                phone, 
                sendMode, 
                groupName, 
                subject, 
                message 
            });
            
            if (chan === 'Email') {
                setStatus('Email sent successfully!');
                toast.success('Email Sent!');
                setSending(false);
                setTimeout(onClose, 2000);
            }
        } catch (e) {
            console.error(e);
            setStatus('Error occurred.');
            toast.error(e.response?.data?.message || 'Failed to process request.');
            setSending(false);
        }
    };

    const tabStyle = (active) => ({
        flex: 1,
        padding: '10px',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: active ? '#fff' : 'transparent',
        color: active ? '#7c3aed' : '#64748b',
        borderRadius: '8px',
        boxShadow: active ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
    });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, background: '#f5f3ff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                            <Send size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Send {type}</h2>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{data.number}</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={sending} style={{ background: '#f8fafc', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 8, borderRadius: 10, transition: 'all 0.2s' }}><X size={20} /></button>
                </div>

                <div style={{ padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
                    {sending && channel === 'WhatsApp' && (
                        <div style={{ marginBottom: 20, background: '#0f172a', borderRadius: 12, padding: 16, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span>SYSTEM AUTOMATION LOG</span>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: socket?.connected ? '#22c55e' : '#ef4444' }}></div>
                                </div>
                                <Loader2 className="animate-spin" size={14} />
                            </div>
                            <div style={{ height: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {!socket?.connected && (
                                    <div style={{ color: '#ef4444', marginBottom: 4 }}>⚠ Waiting for socket reconnect...</div>
                                )}
                                {progressLogs.map((log, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                                        <span style={{ color: '#475569' }}>[{log.time}]</span>
                                        <span style={{ color: log.code === 'SUCCESS' ? '#22c55e' : log.code === 'ERROR' ? '#ef4444' : log.code === 'SYNC' ? '#7c3aed' : '#e2e8f0' }}>
                                            {log.code === 'SUCCESS' ? '✓' : log.code === 'ERROR' ? '✗' : '→'} {log.text}
                                        </span>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '20px' }}>
                        <div onClick={() => !sending && setSendMode('Number')} style={tabStyle(sendMode === 'Number')}>
                            <User size={16} /> Direct Number
                        </div>
                        <div onClick={() => !sending && setSendMode('Group')} style={tabStyle(sendMode === 'Group')}>
                            <Users size={16} /> WhatsApp Group
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>Recipient Name</label>
                            <input disabled={sending} value={recipientName} onChange={e => setRecipientName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: sending ? '#f8fafc' : '#fff' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>WhatsApp No.</label>
                            <input disabled={sending || sendMode === 'Group'} value={phone} onChange={e => setPhone(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: (sending || sendMode === 'Group') ? '#f8fafc' : '#fff' }} placeholder="+91..." />
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>Email Address</label>
                        <input disabled={sending} value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: sending ? '#f8fafc' : '#fff' }} placeholder="customer@example.com" />
                    </div>

                    {sendMode === 'Group' && (
                        <div style={{ marginBottom: 16, animation: 'fadeIn 0.2s' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>WhatsApp Group Name</label>
                            <div style={{ position: 'relative' }}>
                                <Users size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    disabled={sending}
                                    value={groupName} 
                                    onChange={e => setGroupName(e.target.value)} 
                                    style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: 10, border: '1px solid #7c3aed', background: '#f5f3ff', fontSize: 14, outline: 'none', fontWeight: 600 }} 
                                    placeholder="Type EXACT group name..." 
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>Subject</label>
                        <input disabled={sending} value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: sending ? '#f8fafc' : '#fff' }} />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>Message Body</label>
                        <textarea disabled={sending} value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', resize: 'none', background: sending ? '#f8fafc' : '#fff', lineHeight: 1.5 }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!sessionStatus.connected && !sessionStatus.checking ? (
                             <div style={{ padding: 16, background: '#fff7ed', borderRadius: 16, border: '1px solid #fed7aa', marginBottom: 8 }}>
                                <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 4, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertCircle size={16} /> WhatsApp Session Required
                                </div>
                                <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#c2410c' }}>
                                    Your private CRM WhatsApp session is disconnected.
                                </p>
                                <button 
                                    onClick={handleConnect}
                                    disabled={connecting}
                                    style={{ width: '100%', padding: '12px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                >
                                    {connecting ? <Loader2 className="animate-spin" size={18} /> : <Wifi size={18} />}
                                    {connecting ? 'Starting Browser...' : 'Connect WhatsApp Session'}
                                </button>
                             </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <button 
                                    disabled={sending}
                                    onClick={() => handleSend('WhatsApp')}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(37,211,102,0.4)', fontSize: 16, transition: 'all 0.2s' }}
                                >
                                    {sending && channel === 'WhatsApp' ? <Loader2 className="animate-spin" size={20} /> : <MessageSquare size={24} />}
                                    {sending && channel === 'WhatsApp' ? 'Automating WhatsApp...' : 'Send via WhatsApp (Auto)'}
                                </button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '0 4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                                        <CheckCircle2 size={12} /> SESSION ACTIVE
                                    </div>
                                    <button onClick={handleConnect} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Force Re-link</button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12, marginTop: 12 }}>
                            <button 
                                disabled={sending}
                                onClick={() => handleSend('Email')}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                            >
                                <Mail size={18} /> Email
                            </button>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button 
                                    disabled={sending}
                                    title="Download PDF Fallback"
                                    onClick={async () => {
                                        try {
                                            const response = await api.get('/communication/download-pdf', {
                                                params: { type, id: data.id || data._id },
                                                responseType: 'blob'
                                            });
                                            const url = window.URL.createObjectURL(new Blob([response.data]));
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.setAttribute('download', `${type === 'Sales Order' ? 'SO' : 'PO'}-${data.number}.pdf`);
                                            document.body.appendChild(link);
                                            link.click();
                                            link.remove();
                                            toast.success('PDF Downloaded!');
                                        } catch (e) { toast.error('Download failed'); }
                                    }}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                                >
                                    <ExternalLink size={18} /> PDF
                                </button>
                                <button 
                                    disabled={sending}
                                    title="Copy Message Text"
                                    onClick={() => {
                                        navigator.clipboard.writeText(message);
                                        toast.success('Copied!');
                                    }}
                                    style={{ padding: '14px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <Users size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(30px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
