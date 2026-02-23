import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { WhatsAppButton } from '@/components/ui';
import { CustomerSearchSection } from './CustomerSearchSection';
import { CustomerInfoDisplay } from './CustomerInfoDisplay';
import { ConversationEntryForm } from './ConversationEntryForm';
import { FollowUpUpdateSection } from './FollowUpUpdateSection';
import { ConversationHistoryList } from './ConversationHistoryList';
import { getCustomers } from '@/services/customerApi';
import { createConversation, getConversationsByCustomer } from '@/services/conversationApi';
import { createFollowup, updateFollowup, getFollowupByCustomer } from '@/services/followupApi';
import styles from './TalkWithCustomerForm.module.scss';

export const TalkWithCustomerForm = ({ selectedCustomer: preSelectedCustomer, closeModal }) => {
    const [selectedCustomer, setSelectedCustomer] = useState(preSelectedCustomer || null);
    const [conversations, setConversations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [existingFollowup, setExistingFollowup] = useState(null);

    const conversationForm = useForm({
        defaultValues: {
            conversationDate: new Date().toISOString().split('T')[0],
            mode: 'call',
        }
    });

    const followUpForm = useForm({
        defaultValues: {
            priority: 'medium',
            reminderEnabled: false,
        }
    });

    // Load customers on mount
    useEffect(() => {
        loadCustomers();
    }, []);

    // Auto-load customer data if pre-selected
    useEffect(() => {
        if (preSelectedCustomer) {
            handleCustomerSelect(preSelectedCustomer);
        }
    }, [preSelectedCustomer]);

    const loadCustomers = async () => {
        setLoadingCustomers(true);
        try {
            const data = await getCustomers({ limit: 100 });
            setCustomers(data.results || []);
        } catch (error) {
            console.error('Error loading customers:', error);
            alert('Failed to load customers');
        } finally {
            setLoadingCustomers(false);
        }
    };

    const handleCustomerSelect = async (customer) => {
        setSelectedCustomer(customer);
        setLoadingConversations(true);

        try {
            // Load conversations for this customer
            const conversationsData = await getConversationsByCustomer(customer._id, { limit: 20 });
            setConversations(conversationsData.results || []);

            // Load follow-up data if exists
            try {
                const followupData = await getFollowupByCustomer(customer._id);
                if (followupData) {
                    setExistingFollowup(followupData);
                    followUpForm.reset({
                        nextCallDate: followupData.nextCallDate?.split('T')[0],
                        nextCallTime: followupData.nextCallTime || '',
                        whatToTalkNext: followupData.whatToTalkNext || '',
                        priority: followupData.priority || 'medium',
                        reminderEnabled: followupData.reminderEnabled || false,
                    });
                } else {
                    setExistingFollowup(null);
                    followUpForm.reset({
                        nextCallDate: '',
                        nextCallTime: '',
                        whatToTalkNext: '',
                        priority: 'medium',
                        reminderEnabled: false,
                    });
                }
            } catch (error) {
                // No follow-up exists yet
                setExistingFollowup(null);
                followUpForm.reset({
                    nextCallDate: '',
                    nextCallTime: '',
                    whatToTalkNext: '',
                    priority: 'medium',
                    reminderEnabled: false,
                });
            }
        } catch (error) {
            console.error('Error loading customer data:', error);
            alert('Failed to load customer data');
        } finally {
            setLoadingConversations(false);
        }
    };

    const onSaveConversation = async (data) => {
        if (!selectedCustomer) {
            alert('Please select a customer first');
            return;
        }

        console.log('🚀 SAVE CONVERSATION CLICKED');
        console.log('Form data:', data);
        console.log('Customer ID:', selectedCustomer._id);

        try {
            const conversationData = {
                customerId: selectedCustomer._id,
                conversationDate: data.conversationDate || new Date().toISOString().split('T')[0],
                mode: data.mode,
                discussionDetails: data.discussionDetails,
                outcome: data.outcome || '',
                interestedProducts: Array.isArray(data.interestedProducts)
                    ? data.interestedProducts.filter(p => p && p !== 'on')
                    : (data.interestedProducts && data.interestedProducts !== 'on' ? [data.interestedProducts] : []),
                productNotes: data.productNotes || '',
                callDuration: data.callDuration ? Number(data.callDuration) : null,
            };

            console.log('📤 Sending to API:', conversationData);
            const response = await createConversation(conversationData);
            console.log('✅ API Response:', response);

            // Add to local state
            setConversations([response, ...conversations]);

            // Reset conversation form
            conversationForm.reset({
                conversationDate: new Date().toISOString().split('T')[0],
                mode: 'call',
                discussionDetails: '',
                outcome: '',
                interestedProducts: [],
                productNotes: '',
                callDuration: '',
            });

            alert('Conversation saved successfully!');
        } catch (error) {
            console.error('❌ Error saving conversation:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            alert(`Failed to save conversation: ${errorMsg}`);
        }
    };

    const onUpdateFollowUp = async (data) => {
        if (!selectedCustomer) {
            alert('Please select a customer first');
            return;
        }

        console.log('🚀 UPDATE FOLLOW-UP CLICKED');
        console.log('Form data:', data);
        console.log('Customer ID:', selectedCustomer._id);
        console.log('Existing follow-up:', existingFollowup);

        try {
            const followupData = {
                customerId: selectedCustomer._id,
                nextCallDate: new Date(data.nextCallDate),
                nextCallTime: data.nextCallTime || '',
                whatToTalkNext: data.whatToTalkNext || '',
                priority: data.priority,
                reminderEnabled: data.reminderEnabled,
            };

            console.log('📤 Sending to API:', followupData);

            if (existingFollowup) {
                // Update existing follow-up
                console.log('⚙️ Updating existing follow-up ID:', existingFollowup._id);
                const response = await updateFollowup(existingFollowup._id, followupData);
                console.log('✅ Update Response:', response);
                setExistingFollowup(response);
                alert('Follow-up updated successfully!');
            } else {
                // Create new follow-up
                console.log('⚙️ Creating new follow-up');
                const response = await createFollowup(followupData);
                console.log('✅ Create Response:', response);
                setExistingFollowup(response);
                alert('Follow-up created successfully!');
            }
        } catch (error) {
            console.error('❌ Error updating follow-up:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            alert(`Failed to update follow-up: ${errorMsg}`);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Talk With Customer</h1>
                <p className={styles.subtitle}>Log conversations and manage follow-ups with existing customers</p>
            </div>

            <div className={styles.content}>
                {/* Customer Search */}
                <CustomerSearchSection
                    customers={customers}
                    onSelect={handleCustomerSelect}
                    selectedCustomer={selectedCustomer}
                    loading={loadingCustomers}
                />

                {selectedCustomer && (
                    <>
                        {/* Customer Info Display */}
                        <CustomerInfoDisplay customer={selectedCustomer} />

                        {/* WhatsApp Send Button */}
                        <div className={styles.whatsappSection}>
                            <WhatsAppButton
                                phoneNumber={selectedCustomer.contactPersons?.find(c => c.isPrimary)?.mobile || ''}
                                customerName={selectedCustomer.customerName || selectedCustomer.name}
                                companyName={selectedCustomer.company}
                                product={conversationForm.watch('mode') || ''}
                                conversationSummary={conversationForm.watch('discussionDetails') || ''}
                                nextFollowUpDate={followUpForm.watch('nextCallDate') || ''}
                                size="lg"
                            />
                            <p className={styles.whatsappHint}>
                                💡 Send conversation details and follow-up reminder via WhatsApp
                            </p>
                        </div>

                        {/* Two Column Layout */}
                        <div className={styles.twoColumnLayout}>
                            {/* Left: Conversation Entry */}
                            <ConversationEntryForm
                                form={conversationForm}
                                onSave={conversationForm.handleSubmit(onSaveConversation)}
                            />

                            {/* Right: Follow-up Update */}
                            <FollowUpUpdateSection
                                form={followUpForm}
                                onUpdate={followUpForm.handleSubmit(onUpdateFollowUp)}
                                isExisting={!!existingFollowup}
                            />
                        </div>

                        {/* Conversation History */}
                        {loadingConversations ? (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                Loading conversations...
                            </div>
                        ) : (
                            <ConversationHistoryList conversations={conversations} />
                        )}
                    </>
                )}

                {!selectedCustomer && (
                    <div className={styles.emptyState}>
                        <p>👆 Search and select a customer to start logging conversations</p>
                    </div>
                )}
            </div>
        </div>
    );
};

