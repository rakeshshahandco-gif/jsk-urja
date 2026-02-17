import React from 'react';
import { Input, Select, Button } from '@/components/ui';
import { MessageSquare, Calendar, Phone, Clock } from 'lucide-react';
import styles from './TalkWithCustomerForm.module.scss';

export const ConversationEntryForm = ({ form, onSave }) => {
    const { register, formState: { errors, isSubmitting } } = form;

    return (
        <div className={styles.formSection}>
            <div className={styles.sectionIconHeader}>
                <MessageSquare size={22} className={styles.sectionIcon} />
                <h3 className={styles.formSectionTitle}>New Conversation Entry</h3>
            </div>

            <div className={styles.formGrid}>
                <Input
                    label="Conversation Date"
                    type="date"
                    startIcon={<Calendar size={18} />}
                    {...register('conversationDate', { required: 'Date is required' })}
                    error={errors.conversationDate}
                />

                <Select
                    label="Communication Mode"
                    startIcon={<Phone size={18} />}
                    options={[
                        { value: 'call', label: '📞 Call' },
                        { value: 'whatsapp', label: '💬 WhatsApp' },
                        { value: 'visit', label: '🏢 Visit' },
                        { value: 'email', label: '📧 Email' },
                    ]}
                    {...register('mode', { required: 'Mode is required' })}
                    error={errors.mode}
                />
            </div>

            <div className={styles.textareaGroup}>
                <label className={styles.label}>Discussion Details *</label>
                <textarea
                    className={styles.textarea}
                    rows={8}
                    placeholder="Enter detailed discussion notes..."
                    {...register('discussionDetails', { required: 'Discussion details are required' })}
                />
                {errors.discussionDetails && (
                    <span className={styles.error}>{errors.discussionDetails.message}</span>
                )}
            </div>

            <div className={styles.textareaGroup}>
                <label className={styles.label}>Outcome / Remarks</label>
                <textarea
                    className={styles.textarea}
                    rows={4}
                    placeholder="Enter outcome or remarks..."
                    {...register('outcome')}
                />
            </div>

            <div className={styles.formSection} style={{ border: 'none', padding: 0, marginTop: '20px' }}>
                <label className={styles.label} style={{ marginBottom: '10px', display: 'block', fontWeight: 600 }}>Interested Products</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                    {[
                        'PHASE CUT DIMMABLE DRIVER AND DIMMER',
                        'ANALOG DRIVER & DIMMER',
                        'DALI DRIVER & DIMMER',
                        'SMART DRIVER – BLE',
                        'SMART DRIVER – ZIGBEE'
                    ].map((product) => (
                        <label key={product} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                value={product}
                                {...register('interestedProducts')}
                                style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '0.85rem' }}>{product}</span>
                        </label>
                    ))}
                </div>

                <div className={styles.textareaGroup}>
                    <label className={styles.label}>Product Requirement Notes</label>
                    <textarea
                        className={styles.textarea}
                        rows={3}
                        placeholder="Specific product requirements..."
                        {...register('productNotes')}
                    />
                </div>
            </div>

            <Input
                label="Call Duration (minutes)"
                type="number"
                placeholder="Optional"
                startIcon={<Clock size={18} />}
                {...register('callDuration')}
            />

            <Button
                type="button"
                onClick={onSave}
                isLoading={isSubmitting}
                className={styles.saveButton}
            >
                Save Conversation
            </Button>
        </div>
    );
};
