import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui';
import { X, AlertTriangle } from 'lucide-react';
import styles from '../CustomerMasterReport.module.scss'; // Reuse styles or inline

export const CloseReminderModal = ({ reminder, onClose, onConfirm }) => {
    const { register, handleSubmit, formState: { isSubmitting } } = useForm();

    const onSubmit = async (data) => {
        await onConfirm(reminder._id, data.notes);
    };

    return (
        <div style={{ padding: '24px', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className={styles.sectionTitle} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle color="#ef4444" size={20} />
                    Close Reminder Task
                </h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={20} color="#6b7280" />
                </button>
            </div>

            <p style={{ color: '#4b5563', marginBottom: '20px' }}>
                Are you sure you want to close the follow-up for
                <strong> {reminder.customerId?.company || reminder.customerId?.customerName || 'this customer'}</strong>?
            </p>

            <form onSubmit={handleSubmit(onSubmit)}>
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                        Closing Remarks / Outcome (Optional)
                    </label>
                    <textarea
                        {...register('notes')}
                        rows={3}
                        className={styles.formTextarea}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'inherit' }}
                        placeholder="E.g. Customer not interested, Deal closed, etc."
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="destructive" isLoading={isSubmitting} style={{ backgroundColor: '#ef4444', color: 'white' }}>
                        Confirm Close
                    </Button>
                </div>
            </form>
        </div>
    );
};
