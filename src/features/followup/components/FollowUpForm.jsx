import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui';
import { Calendar, MessageSquare, Bell, ArrowLeft } from 'lucide-react';
import { getCustomer } from '@/services/customerApi';
import { createConversation, getConversationsByCustomer } from '@/services/conversationApi';
import { upsertReminder } from '@/services/reminderApi';
import { getFollowupByCustomer } from '@/services/followupApi'; // Still use this to load initial state? Or should we load from reminder? 
// User said "backend must be source of truth". Ideally we load the open reminder for this customer.
// But current system uses Followup model as well. User asked to use Reminder model. 
// Ideally I should get the OPEN REMINDER for this customer to pre-fill.
import { getReminders } from '@/services/reminderApi';
import styles from './FollowUpForm.module.scss';
import { useToast } from '@/components/ui/Toast';

export const FollowUpForm = () => {
    const { customerId } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [customer, setCustomer] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastSavedConversationId, setLastSavedConversationId] = useState(null);

    // Conversation form
    const conversationForm = useForm({
        defaultValues: {
            conversationDate: new Date().toISOString().split('T')[0],
            mode: 'call',
            discussionDetails: '',
            outcome: ''
        }
    });

    // Follow-up/Reminder form
    const reminderForm = useForm({
        defaultValues: {
            nextCallDate: '',
            nextCallTime: '',
            note: '',
            priority: 'medium',
            reminderEnabled: false,
            followUpType: 'CALL'
        }
    });

    // Load customer data on mount
    useEffect(() => {
        if (!customerId) {
            addToast('No customer ID provided!', 'error');
            navigate('/customers/list');
            return;
        }
        loadCustomerData();
    }, [customerId]);

    const loadCustomerData = async () => {
        setLoading(true);
        try {
            // Load customer
            const customerData = await getCustomer(customerId);
            setCustomer(customerData);

            // Load conversations
            const conversationsData = await getConversationsByCustomer(customerId, { limit: 50 });
            setConversations(conversationsData.results || []);

            // Load existing OPEN reminder to pre-fill
            // We use getReminders with status='Open' and customerId
            // Or better, a specific endpoint. For now, Query is fine.
            const reminderData = await getReminders({ customerId, status: 'Open', limit: 1 });
            if (reminderData.results && reminderData.results.length > 0) {
                const openReminder = reminderData.results[0];
                reminderForm.reset({
                    nextCallDate: openReminder.reminderDate ? openReminder.reminderDate.split('T')[0] : '',
                    nextCallTime: openReminder.reminderTime || '',
                    note: openReminder.taskNote || '',
                    priority: openReminder.priority || 'medium',
                    reminderEnabled: true, // It's open, so enabled
                    followUpType: openReminder.followUpType || 'CALL'
                });
            } else {
                // Check if there's a closed one or just empty?
                // Just empty defaults suitable.
            }

        } catch (error) {
            console.error('Error loading data:', error);
            addToast('Failed to load customer data', 'error');
            navigate('/customers/list');
        } finally {
            setLoading(false);
        }
    };

    const onSaveConversation = async (data) => {
        try {
            const conversationData = {
                customerId: customerId,
                conversationDate: new Date(data.conversationDate),
                mode: data.mode,
                discussionDetails: data.discussionDetails,
                outcome: data.outcome || ''
            };

            const response = await createConversation(conversationData);

            // Add to local state
            setConversations([response, ...conversations]);
            setLastSavedConversationId(response._id);

            // Reset form
            conversationForm.reset({
                conversationDate: new Date().toISOString().split('T')[0],
                mode: 'call',
                discussionDetails: '',
                outcome: ''
            });

            addToast('Conversation saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving conversation:', error);
            addToast('Failed to save conversation', 'error');
        }
    };

    const onUpdateReminder = async (data) => {
        // Validation handled by HTML5 or hook form required?
        if (data.reminderEnabled && !data.nextCallDate) {
            addToast('Next Call Date is required when reminder is enabled', 'error');
            return;
        }

        try {
            const reminderPayload = {
                conversationId: lastSavedConversationId, // Optional link
                nextCallDate: data.nextCallDate,
                nextCallTime: data.nextCallTime,
                followUpType: data.followUpType,
                note: data.note,
                priority: data.priority,
                enableReminder: data.reminderEnabled
            };

            const response = await upsertReminder(customerId, reminderPayload);

            if (data.reminderEnabled) {
                addToast('Reminder updated successfully!', 'success');
            } else {
                addToast('Reminder closed/disabled.', 'info');
            }

            // Optionally reload to confirm state?
            // loadCustomerData(); 

        } catch (error) {
            console.error('Error saving reminder:', error);
            addToast('Failed to save reminder', 'error');
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Loading customer data...</p>
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className={styles.container}>
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <p>Customer not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header with customer info */}
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/customers/list')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className={styles.title}>Follow-up & Conversation Tracker</h1>
                        <p className={styles.subtitle}>
                            Customer: <strong>{customer.customerName || customer.name || 'Not Provided'}</strong>
                            {customer.company && ` - ${customer.company}`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className={styles.twoColumnLayout}>
                {/* Left: Conversation Entry */}
                <div className={styles.conversationSection}>
                    <div className={styles.formSection}>
                        <div className={styles.sectionIconHeader}>
                            <MessageSquare size={22} className={styles.sectionIcon} />
                            <h3 className={styles.formSectionTitle}>New Conversation Entry</h3>
                        </div>

                        <form onSubmit={conversationForm.handleSubmit(onSaveConversation)}>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>Conversation Date *</label>
                                    <input
                                        type="date"
                                        {...conversationForm.register('conversationDate', { required: true })}
                                        className={styles.formInput}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Mode *</label>
                                    <select
                                        {...conversationForm.register('mode', { required: true })}
                                        className={styles.formSelect}
                                    >
                                        <option value="call">📞 Call</option>
                                        <option value="whatsapp">💬 WhatsApp</option>
                                        <option value="visit">🏢 Visit</option>
                                        <option value="email">📧 Email</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Discussion Details *</label>
                                <textarea
                                    {...conversationForm.register('discussionDetails', { required: true })}
                                    rows={6}
                                    placeholder="Enter detailed discussion notes..."
                                    className={styles.formTextarea}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Outcome / Remarks</label>
                                <textarea
                                    {...conversationForm.register('outcome')}
                                    rows={3}
                                    placeholder="Enter outcome or remarks..."
                                    className={styles.formTextarea}
                                />
                            </div>

                            <Button
                                type="submit"
                                isLoading={conversationForm.formState.isSubmitting}
                                className={styles.saveButton}
                            >
                                Save Conversation
                            </Button>
                        </form>
                    </div>

                    {/* Conversation History */}
                    <div className={styles.formSection} style={{ marginTop: '24px' }}>
                        <h3 className={styles.formSectionTitle}>Conversation History ({conversations.length})</h3>
                        {conversations.length === 0 ? (
                            <p style={{ color: '#6b7280', padding: '20px', textAlign: 'center' }}>
                                No conversations yet. Add your first conversation above.
                            </p>
                        ) : (
                            <div className={styles.conversationList}>
                                {conversations.map((conv) => (
                                    <div key={conv._id} className={styles.conversationCard}>
                                        <div className={styles.conversationHeader}>
                                            <span className={styles.conversationDate}>
                                                {new Date(conv.conversationDate).toLocaleDateString()}
                                            </span>
                                            <span className={styles.conversationMode}>
                                                {conv.mode === 'call' && '📞 Call'}
                                                {conv.mode === 'whatsapp' && '💬 WhatsApp'}
                                                {conv.mode === 'visit' && '🏢 Visit'}
                                                {conv.mode === 'email' && '📧 Email'}
                                            </span>
                                        </div>
                                        <div className={styles.conversationDetails}>
                                            <strong>Discussion:</strong>
                                            <p>{conv.discussionDetails}</p>
                                        </div>
                                        {conv.outcome && (
                                            <div className={styles.conversationOutcome}>
                                                <strong>Outcome:</strong>
                                                <p>{conv.outcome}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Follow-up Reminder */}
                <div className={styles.followupSection}>
                    <div className={styles.formSection}>
                        <div className={styles.sectionIconHeader}>
                            <div className={styles.iconGroup}>
                                <Calendar size={22} className={styles.sectionIcon} />
                                <Bell size={18} className={styles.sectionIconSecondary} />
                            </div>
                            <h3 className={styles.formSectionTitle}>Follow-up & Reminder (Next Call)</h3>
                        </div>

                        <form onSubmit={reminderForm.handleSubmit(onUpdateReminder)}>
                            <div className={styles.formGroup}>
                                <label>Next Call Date *</label>
                                <input
                                    type="date"
                                    {...reminderForm.register('nextCallDate', { required: false })}
                                    className={styles.formInput}
                                />
                                {/* removed HTML required because it depends on checkbox logic, handled in submit */}
                            </div>

                            <div className={styles.formGroup}>
                                <label>Next Call Time</label>
                                <input
                                    type="time"
                                    {...reminderForm.register('nextCallTime')}
                                    className={styles.formInput}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>What to Talk Next</label>
                                <textarea
                                    {...reminderForm.register('note')}
                                    rows={6}
                                    placeholder="Enter notes for next conversation..."
                                    className={styles.formTextarea}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Priority</label>
                                <select
                                    {...reminderForm.register('priority')}
                                    className={styles.formSelect}
                                >
                                    <option value="low">🟢 Low</option>
                                    <option value="medium">🟡 Medium</option>
                                    <option value="high">🔴 High</option>
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Follow-up Type *</label>
                                <select
                                    {...reminderForm.register('followUpType', { required: true })}
                                    className={styles.formSelect}
                                >
                                    <option value="CALL">📞 CALL</option>
                                    <option value="WHATSAPP">💬 WHATSAPP</option>
                                </select>
                            </div>

                            <div className={styles.reminderToggle}>
                                <label className={styles.toggleLabel}>
                                    <input
                                        type="checkbox"
                                        {...reminderForm.register('reminderEnabled')}
                                        className={styles.checkbox}
                                    />
                                    <Bell size={18} style={{ marginRight: '8px' }} />
                                    <span>Enable Reminder</span>
                                </label>
                            </div>

                            <Button
                                type="submit"
                                variant="secondary"
                                isLoading={reminderForm.formState.isSubmitting}
                                className={styles.updateButton}
                            >
                                Update Reminder
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
