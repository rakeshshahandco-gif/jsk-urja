import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, Send, X, Users, User, Loader2 } from 'lucide-react';

export default function CommunicationModal({ isOpen, onClose, onSend, data, type }) {
    const [sendMode, setSendMode] = useState('Number'); // 'Number' or 'Group'
    const [recipientName, setRecipientName] = useState(data.recipientName || '');
    const [email, setEmail] = useState(data.email || '');
    const [phone, setPhone] = useState(data.phone || '');
    const [groupName, setGroupName] = useState('');
    const [subject, setSubject] = useState(data.subject || `${type} from JSK URJA`);
    const [message, setMessage] = useState(data.message || `Dear ${data.recipientName},\n\nPlease find attached the ${type} ${data.number}.\n\nRegards,\nJSK URJA`);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (data.recipientName) setRecipientName(data.recipientName);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.number) {
             const defaultMsg = `Dear Sir/Madam,

Please find attached our ${type} ${data.number} dated ${new Date().toLocaleDateString('en-IN')}.
Kindly review and confirm.

Regards,
JSK URJA`;
             setMessage(defaultMsg);
        }
    }, [data, type]);

    if (!isOpen) return null;

    const handleSend = async (channel) => {
        setSending(true);
        setStatus('Preparing PDF...');
        try {
            await onSend({ 
                channel, 
                recipientName, 
                email, 
                phone, 
                sendMode, 
                groupName, 
                subject, 
                message 
            });
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
                            <input value={groupName} onChange={e => setGroupName(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} placeholder="Type group name exactly..." />
                            <p style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                                Tip: Leave empty to select group manually in the WhatsApp window.
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <button 
                            disabled={sending}
                            onClick={() => handleSend('Email')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                        >
                            <Mail size={18} /> Send Email
                        </button>
                        <button 
                            disabled={sending}
                            onClick={() => handleSend('WhatsApp')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,211,102,0.3)' }}
                        >
                            <MessageSquare size={18} /> Send WhatsApp
                        </button>
                    </div>
                </div>

                <div style={{ padding: '0 24px 24px' }}>
                    <button 
                        disabled={sending}
                        onClick={() => handleSend('Both')}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}
                    >
                        Send on Both
                    </button>
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
