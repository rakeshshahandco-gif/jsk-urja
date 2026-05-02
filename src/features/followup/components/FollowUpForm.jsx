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
            outcome: '',
            interestedProducts: [],
            productNotes: '',
            followUpStatus: 'Follow-up Required',
            notConvertedDetails: {
                reason: '',
                matter: '',
                offeredRate: '',
                expectedRate: '',
                competitorRate: '',
                competitorName: '',
                requiredSpec: '',
                offeredSpec: '',
                issueDetails: '',
                expectedRequirementDate: '',
                nextFollowUpDate: '',
                assignedTo: '',
                remarks: ''
            }
        }
    });

    const watchStatus = conversationForm.watch('followUpStatus');
    const watchReason = conversationForm.watch('notConvertedDetails.reason');

    const [selectedProducts, setSelectedProducts] = useState([
        'PHASE CUT DIMMABLE DRIVER AND DIMMER',
        'ANALOG DRIVER & DIMMER',
        'DALI DRIVER & DIMMER',
        'SMART DRIVER – BLE',
        'SMART DRIVER – ZIGBEE'
    ]);
    const [newProduct, setNewProduct] = useState('');
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    const handleAddProduct = () => {
        if (newProduct.trim() && !selectedProducts.includes(newProduct.trim())) {
            const updated = [...selectedProducts, newProduct.trim()];
            setSelectedProducts(updated);
            setNewProduct('');
            // Sync with form
            const currentSelected = conversationForm.getValues('interestedProducts') || [];
            if (Array.isArray(currentSelected)) {
                conversationForm.setValue('interestedProducts', [...currentSelected, newProduct.trim()]);
            }
        }
    };

    const handleRemoveProduct = (product) => {
        const updated = selectedProducts.filter(p => p !== product);
        setSelectedProducts(updated);
        // Sync with form
        const currentSelected = conversationForm.getValues('interestedProducts') || [];
        if (Array.isArray(currentSelected)) {
            conversationForm.setValue('interestedProducts', currentSelected.filter(p => p !== product));
        }
    };

    const onDragStart = (index) => {
        setDraggedItemIndex(index);
    };

    const onDragOver = (e) => {
        e.preventDefault();
    };

    const onDrop = (index) => {
        const updated = [...selectedProducts];
        const draggedItem = updated[draggedItemIndex];
        updated.splice(draggedItemIndex, 1);
        updated.splice(index, 0, draggedItem);
        setSelectedProducts(updated);
        setDraggedItemIndex(null);
    };

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
                conversationDate: data.conversationDate || new Date().toISOString().split('T')[0],
                mode: data.mode,
                discussionDetails: data.discussionDetails,
                outcome: data.outcome || '',
                interestedProducts: Array.isArray(data.interestedProducts)
                    ? data.interestedProducts.filter(p => p && p !== 'on')
                    : (data.interestedProducts && data.interestedProducts !== 'on' ? [data.interestedProducts] : []),
                productNotes: data.productNotes || '',
                callDuration: data.callDuration ? Number(data.callDuration) : null,
                followUpStatus: data.followUpStatus,
                notConvertedDetails: data.notConvertedDetails
            };

            // Validation for mandatory reason
            const negativeStatuses = ['Not Converted', 'Lost', 'Hold', 'Project Postponed', 'Customer Not Responding'];
            if (negativeStatuses.includes(data.followUpStatus)) {
                if (!data.notConvertedDetails?.reason || !data.notConvertedDetails?.matter) {
                    addToast('Reason and Detailed Matter are mandatory for this status', 'error');
                    return;
                }
            }

            const response = await createConversation(conversationData);

            // Add to local state
            setConversations([response, ...conversations]);
            setLastSavedConversationId(response._id);

            // Reset form
            conversationForm.reset({
                conversationDate: new Date().toISOString().split('T')[0],
                mode: 'call',
                discussionDetails: '',
                outcome: '',
                interestedProducts: [],
                productNotes: '',
                callDuration: ''
            });

            addToast('Conversation saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving conversation:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
            addToast(`Failed to save conversation: ${errorMsg}`, 'error');
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
                <div className={styles.loadingContainer}>
                    <p>Loading customer data...</p>
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className={styles.container}>
                <div className={styles.errorContainer}>
                    <p>Customer not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header with customer info */}
            <div className={styles.header}>
                <button
                    onClick={() => window.confirm('Discard changes?') && navigate('/customers/list')}
                    aria-label="Back to customer list"
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

                            <div className={styles.formGroup}>
                                <label>Lead Status Update *</label>
                                <select
                                    {...conversationForm.register('followUpStatus', { required: true })}
                                    className={styles.formSelect}
                                >
                                    <option value="Interested">Interested</option>
                                    <option value="Follow-up Required">Follow-up Required</option>
                                    <option value="Quotation Required">Quotation Required</option>
                                    <option value="Sample Required">Sample Required</option>
                                    <option value="Sample Sent">Sample Sent</option>
                                    <option value="Sample Under Testing">Sample Under Testing</option>
                                    <option value="Negotiation">Negotiation</option>
                                    <option value="Converted to Order">Converted to Order</option>
                                    <option value="Not Converted">Not Converted</option>
                                    <option value="Lost">Lost</option>
                                    <option value="Hold">Hold</option>
                                    <option value="Project Postponed">Project Postponed</option>
                                    <option value="Customer Not Responding">Customer Not Responding</option>
                                </select>
                            </div>

                            {['Not Converted', 'Lost', 'Hold', 'Project Postponed', 'Customer Not Responding'].includes(watchStatus) && (
                                <div className={styles.reasonSection}>
                                    <div className={styles.formGrid}>
                                        <div className={styles.formGroup}>
                                            <label>Fixed Reason *</label>
                                            <select 
                                                {...conversationForm.register('notConvertedDetails.reason', { required: true })}
                                                className={styles.formSelect}
                                            >
                                                <option value="">Select Reason</option>
                                                <option value="Rate is high">Rate is high</option>
                                                <option value="Product not suitable">Product not suitable</option>
                                                <option value="No need now / Project postponed">No need now / Project postponed</option>
                                                <option value="Competitor selected">Competitor selected</option>
                                                <option value="Service Issue">Service Issue</option>
                                                <option value="Payment Terms">Payment Terms</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Assigned To</label>
                                            <input 
                                                type="text"
                                                {...conversationForm.register('notConvertedDetails.assignedTo')}
                                                placeholder="Person name"
                                                className={styles.formInput}
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Detailed Matter / Explanation *</label>
                                        <textarea
                                            {...conversationForm.register('notConvertedDetails.matter', { required: true })}
                                            rows={3}
                                            placeholder="Explain why lead was lost/on hold..."
                                            className={styles.formTextarea}
                                        />
                                    </div>

                                    {/* Reason Specific Fields */}
                                    {watchReason === 'Rate is high' && (
                                        <div className={styles.reasonSpecificFields}>
                                            <div className={styles.formGrid}>
                                                <div className={styles.formGroup}>
                                                    <label>Our Offered Rate</label>
                                                    <input type="number" {...conversationForm.register('notConvertedDetails.offeredRate')} className={styles.formInput} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Customer Expected Rate</label>
                                                    <input type="number" {...conversationForm.register('notConvertedDetails.expectedRate')} className={styles.formInput} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Competitor Rate</label>
                                                    <input type="number" {...conversationForm.register('notConvertedDetails.competitorRate')} className={styles.formInput} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {watchReason === 'Product not suitable' && (
                                        <div className={styles.reasonSpecificFields}>
                                            <div className={styles.formGrid}>
                                                <div className={styles.formGroup}>
                                                    <label>Required Specification</label>
                                                    <input type="text" {...conversationForm.register('notConvertedDetails.requiredSpec')} className={styles.formInput} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Offered Specification</label>
                                                    <input type="text" {...conversationForm.register('notConvertedDetails.offeredSpec')} className={styles.formInput} />
                                                </div>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label>Issue Details</label>
                                                <textarea {...conversationForm.register('notConvertedDetails.issueDetails')} className={styles.formTextarea} rows={2} />
                                            </div>
                                        </div>
                                    )}

                                    {watchReason === 'No need now / Project postponed' && (
                                        <div className={styles.reasonSpecificFields}>
                                            <div className={styles.formGrid}>
                                                <div className={styles.formGroup}>
                                                    <label>Expected Requirement Date</label>
                                                    <input type="date" {...conversationForm.register('notConvertedDetails.expectedRequirementDate')} className={styles.formInput} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Next Follow-up Date</label>
                                                    <input type="date" {...conversationForm.register('notConvertedDetails.nextFollowUpDate')} className={styles.formInput} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {watchReason === 'Competitor selected' && (
                                        <div className={styles.reasonSpecificFields}>
                                            <div className={styles.formGrid}>
                                                <div className={styles.formGroup}>
                                                    <label>Competitor Name</label>
                                                    <input type="text" {...conversationForm.register('notConvertedDetails.competitorName')} className={styles.formInput} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Competitor Rate</label>
                                                    <input type="number" {...conversationForm.register('notConvertedDetails.competitorRate')} className={styles.formInput} />
                                                </div>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label>Customer Reason</label>
                                                <textarea {...conversationForm.register('notConvertedDetails.customerReason')} className={styles.formTextarea} rows={2} />
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.formGroup}>
                                        <label>Remarks</label>
                                        <textarea
                                            {...conversationForm.register('notConvertedDetails.remarks')}
                                            rows={2}
                                            className={styles.formTextarea}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className={styles.formSection} style={{ border: 'none', padding: 0, marginTop: '1.5rem', background: 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <label style={{ margin: 0, fontWeight: 600, color: '#374151' }}>Interested Products</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            value={newProduct}
                                            onChange={(e) => setNewProduct(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}
                                            placeholder="Add product..."
                                            className={styles.formInput}
                                            style={{ width: '200px', height: '32px', fontSize: '12px' }}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={handleAddProduct}
                                            className={styles.addBtn}
                                            style={{ padding: '0 12px', height: '32px', fontSize: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                <div style={{ 
                                    display: 'flex', 
                                    flexWrap: 'wrap', 
                                    gap: '10px', 
                                    marginBottom: '20px',
                                    padding: '12px',
                                    background: '#f9fafb',
                                    borderRadius: '12px',
                                    border: '1px dashed #d1d5db',
                                    minHeight: '60px'
                                }}>
                                    {selectedProducts.map((product, index) => (
                                        <div
                                            key={product}
                                            draggable
                                            onDragStart={() => onDragStart(index)}
                                            onDragOver={onDragOver}
                                            onDrop={() => onDrop(index)}
                                            onDragEnd={() => setDraggedItemIndex(null)}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '10px', 
                                                padding: '8px 14px',
                                                background: draggedItemIndex === index ? '#eff6ff' : '#ffffff',
                                                border: draggedItemIndex === index ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                                                borderRadius: '24px',
                                                cursor: 'grab',
                                                userSelect: 'none',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                opacity: draggedItemIndex === index ? 0.5 : 1
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = draggedItemIndex === index ? '#3b82f6' : '#e5e7eb'}
                                        >
                                            <input
                                                type="checkbox"
                                                value={product}
                                                defaultChecked={true}
                                                {...conversationForm.register('interestedProducts')}
                                                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>{product}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveProduct(product)}
                                                style={{ 
                                                    border: 'none', 
                                                    background: '#fee2e2', 
                                                    color: '#ef4444', 
                                                    cursor: 'pointer', 
                                                    fontSize: '12px', 
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: 0
                                                }}
                                                title="Remove"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                    {selectedProducts.length === 0 && (
                                        <div style={{ color: '#9ca3af', fontSize: '12px', fontStyle: 'italic', padding: '10px' }}>
                                            No products added yet. Use the field above to add.
                                        </div>
                                    )}
                                </div>
                            </div>

                                <div className={styles.formGroup}>
                                    <label>Product Requirement Notes</label>
                                    <textarea
                                        {...conversationForm.register('productNotes')}
                                        rows={3}
                                        placeholder="Specific product requirements..."
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
                    <div className={styles.formSection} style={{ marginTop: '1.5rem' }}>
                        <h3 className={styles.formSectionTitle}>Conversation History ({conversations.length})</h3>
                        {conversations.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>No conversations yet. Add your first conversation above.</p>
                            </div>
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
                                        {conv.interestedProducts && conv.interestedProducts.length > 0 && (
                                            <div className={styles.conversationProducts} style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                                                <strong>Products:</strong> {conv.interestedProducts.join(', ')}
                                            </div>
                                        )}
                                        {conv.productNotes && (
                                            <div className={styles.conversationNotes} style={{ marginTop: '4px', fontSize: '0.9rem', color: '#4b5563' }}>
                                                <strong>Product Notes:</strong> {conv.productNotes}
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
                                    />
                                    <Bell size={18} />
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
