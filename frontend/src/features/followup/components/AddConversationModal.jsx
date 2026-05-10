import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal, Button, Input, Select } from '@/components/ui';
import styles from './FollowUpForm.module.scss';

export const AddConversationModal = ({ isOpen, onClose, onSave, editingConversation }) => {
    const { register, handleSubmit, formState: { errors }, reset } = useForm({
        defaultValues: {
            conversationDate: new Date().toISOString().split('T')[0],
            mode: 'call',
        }
    });

    useEffect(() => {
        if (editingConversation) {
            reset({
                conversationDate: new Date(editingConversation.conversationDate).toISOString().split('T')[0],
                mode: editingConversation.mode,
                discussionDetails: editingConversation.discussionDetails,
                outcome: editingConversation.outcome,
            });
        } else {
            reset({
                conversationDate: new Date().toISOString().split('T')[0],
                mode: 'call',
                discussionDetails: '',
                outcome: '',
            });
        }
    }, [editingConversation, reset]);

    const onSubmit = (data) => {
        onSave(data);
        reset();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editingConversation ? "Edit Conversation" : "Add New Conversation"}>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.modalForm}>
                <div className={styles.modalGrid}>
                    <Input
                        label="Conversation Date"
                        type="date"
                        {...register('conversationDate', { required: 'Date is required' })}
                        error={errors.conversationDate}
                    />
                    <Select
                        label="Mode"
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
                        rows={4}
                        placeholder="Enter discussion details..."
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
                        rows={3}
                        placeholder="Enter outcome or remarks..."
                        {...register('outcome')}
                    />
                </div>

                <div className={styles.modalActions}>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit">
                        {editingConversation ? 'Update' : 'Save'} Conversation
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
