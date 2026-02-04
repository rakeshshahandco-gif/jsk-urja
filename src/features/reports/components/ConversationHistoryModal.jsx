import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getConversationHistory } from '@/services/customerApi';
import { Loader2, Phone, MessageSquare, Briefcase, Mail, CalendarClock, CheckCircle2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const ConversationHistoryModal = ({ customerId, customerName, closeModal, modalId }) => {
    // Note: ModalProvider passes 'closeModal' and 'modalId'.
    // If used outside provider, ensure these props are passed.

    const { addToast } = useToast();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!customerId) return;
            setLoading(true);
            try {
                // Fetch using new specific endpoint
                const data = await getConversationHistory(customerId);
                setConversations(data || []);
            } catch (error) {
                console.error("Failed to load history", error);
                addToast("Failed to load conversation history. check console.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [customerId, addToast]);

    const getIcon = (mode) => {
        switch (mode?.toLowerCase()) {
            case 'call': return <Phone size={16} className="text-blue-500" />;
            case 'whatsapp': return <MessageSquare size={16} className="text-green-500" />;
            case 'visit': return <Briefcase size={16} className="text-orange-500" />;
            case 'email': return <Mail size={16} className="text-gray-500" />;
            case 'rescheduled': return <CalendarClock size={16} className="text-yellow-600" />;
            case 'task closed': return <CheckCircle2 size={16} className="text-gray-500" />;
            case 'scheduled task': return <Calendar size={16} className="text-blue-400" />;
            default: return <MessageSquare size={16} className="text-gray-400" />;
        }
    };

    const getModeStyle = (mode) => {
        switch (mode?.toLowerCase()) {
            case 'rescheduled': return { backgroundColor: '#fefce8', color: '#854d0e', border: '1px solid #fde047' };
            case 'task closed': return { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
            case 'scheduled task': return { backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' };
            default: return { backgroundColor: '#fff', border: '1px solid #e5e7eb' };
        }
    };

    return (
        <div style={{ width: '600px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                    History: {customerName}
                </h2>
                <button
                    onClick={() => closeModal(modalId)}
                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
                >
                    &times;
                </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                        <Loader2 className="animate-spin text-blue-500" />
                    </div>
                ) : conversations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                        No conversation history found.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {conversations.map((conv) => (
                            <div key={conv._id} style={{
                                borderRadius: '8px',
                                padding: '12px',
                                ...getModeStyle(conv.mode)
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', fontSize: '14px' }}>
                                        {getIcon(conv.mode)}
                                        <span>{format(new Date(conv.conversationDate), 'dd MMM yyyy')}</span>
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        backgroundColor: '#f3f4f6',
                                        color: '#374151'
                                    }}>
                                        {conv.mode}
                                    </span>
                                </div>
                                <div style={{ fontSize: '14px', color: '#374151', marginBottom: '6px' }}>
                                    {conv.discussionDetails}
                                </div>
                                {conv.outcome && (
                                    <div style={{ fontSize: '13px', color: '#6b7280', fontStyle: 'italic', borderTop: '1px dashed #e5e7eb', paddingTop: '6px' }}>
                                        Outcome: {conv.outcome}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
