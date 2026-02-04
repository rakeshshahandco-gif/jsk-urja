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
