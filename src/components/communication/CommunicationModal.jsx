import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, Send, X, Users, User, Loader2, ExternalLink } from 'lucide-react';
import api from '@/services/api';

export default function CommunicationModal({ isOpen, onClose, onSend, data, type }) {
    const [sendMode, setSendMode] = useState('Number'); // 'Number' or 'Group'
    const [recipientName, setRecipientName] = useState(data.recipientName || '');
    const [email, setEmail] = useState(data.email || '');
    const [phone, setPhone] = useState(data.phone || '');
    const [groupName, setGroupName] = useState('');
    const [subject, setSubject] = useState(data.subject || `${type} from JSK URJA`);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState('');

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
    }, [data, type]);

    if (!isOpen) return null;

    const handleSend = async (channel) => {
        setSending(true);
        setStatus('Preparing PDF...');
        try {
            const channelToBackend = (channel === 'Both') ? 'Email' : channel;
            
            // Only call backend for Email (WhatsApp is handled by frontend to reuse browser session)
            if (channelToBackend === 'Email') {
                await onSend({ 
                    channel: channelToBackend, 
                    recipientName, 
                    email, 
                    phone, 
                    sendMode, 
                    groupName, 
                    subject, 
                    message 
                });
            }
            setStatus('Sent successfully!');
        } catch (e) {
            console.error(e);
            setStatus('Failed to send.');
        } finally {
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', animation: 'slideIn 0.3s ease-out' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ padding: 8, background: '#ede9fe', borderRadius: 8, color: '#7c3aed' }}>
                            <Send size={20} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Send {type}</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><X size={24} /></button>
                </div>

                <div style={{ padding: 24 }}>
                    {/* Send Mode Toggle */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '20px' }}>
                        <div onClick={() => setSendMode('Number')} style={tabStyle(sendMode === 'Number')}>
                            <User size={16} /> Direct Number
                        </div>
                        <div onClick={() => setSendMode('Group')} style={tabStyle(sendMode === 'Group')}>
                            <Users size={16} /> WhatsApp Group
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Party Name</label>
                        <input value={recipientName} onChange={e => setRecipientName(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} placeholder="Customer/Supplier name" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: sendMode === 'Number' ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Email Address</label>
                            <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} placeholder="email@example.com" />
                        </div>
                        {sendMode === 'Number' && (
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>WhatsApp Number</label>
                                <input value={phone} onChange={e => setPhone(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} placeholder="+91..." />
                            </div>
                        )}
                    </div>

                    {sendMode === 'Group' && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>WhatsApp Group Name</label>
                            <input 
                                value={groupName} 
                                onChange={e => setGroupName(e.target.value)} 
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} 
                                placeholder="Type group name exactly..." 
                            />
                            <p style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                                Automation will search for this group name in WhatsApp Web.
                            </p>
                        </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Subject</label>
                        <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} placeholder="Email subject" />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Message Body</label>
                        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', resize: 'none' }} placeholder="Write your message here..." />
                    </div>

                    {sending && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#7c3aed', fontSize: 13, fontWeight: 600 }}>
                            <Loader2 className="animate-spin" size={16} />
                            {status}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <button 
                            disabled={sending}
                            onClick={() => handleSend('Email')}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                            <Mail size={20} /> 1. Send Email (Backend)
                        </button>
                    </div>
                </div>

                <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ height: '1px', background: '#f1f5f9', width: '100%', marginBottom: 4 }}></div>
                    
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Manual WhatsApp Flow (Recommended)
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <button 
                            onClick={async () => {
                                try {
                                    setStatus('Generating PDF...');
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
                                    setStatus('PDF Downloaded');
                                } catch (e) {
                                    console.error(e);
                                    setStatus('PDF Failed');
                                }
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                        >
                            <ExternalLink size={16} /> A. Download PDF
                        </button>

                        <button 
                            onClick={() => {
                                try {
                                    navigator.clipboard.writeText(message);
                                    setStatus('Message Copied!');
                                } catch (e) {
                                    setStatus('Copy Failed');
                                }
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                        >
                            <MessageSquare size={16} /> B. Copy Message
                        </button>
                    </div>

                    <button 
                        onClick={() => {
                            window.open('https://web.whatsapp.com/', '_blank');
                        }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,211,102,0.25)', fontSize: 16 }}
                    >
                        <MessageSquare size={24} /> Step 2: Open Logged-in WhatsApp
                    </button>

                    <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                        Note: Search contact manual & paste the message. This uses your existing browser login.
                    </p>
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
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
