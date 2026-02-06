import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
// import { X } from 'lucide-react'; // If we had a modal header with close, but modal provider usually handles it or we inject content.
// Assuming this is used inside ModalProvider's content.

export const ChangeDateModal = ({ reminder, onClose, onSave, isSubmitting }) => {
    const { register, handleSubmit, formState: { errors }, reset } = useForm({
        defaultValues: {
            reminderDate: reminder?.reminderDate ? new Date(reminder.reminderDate).toISOString().split('T')[0] : '',
            reminderTime: reminder?.reminderTime || '',
            note: ''
        }
    });

    const onSubmit = (data) => {
        onSave(reminder._id, data);
    };

    return (
        <div style={{ padding: '20px', minWidth: '400px' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.25rem', fontWeight: 600 }}>Reschedule Reminder</h2>
            <div style={{ marginBottom: '15px' }}>
                <strong>Current Date:</strong> {new Date(reminder.reminderDate).toLocaleDateString()} {reminder.reminderTime}
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
                <Input
                    label="New Reminder Date"
                    type="date"
                    {...register('reminderDate', { required: 'Date is required' })}
                    error={errors.reminderDate}
                />
                <Input
                    label="New Reminder Time"
                    type="time"
                    {...register('reminderTime')}
                    error={errors.reminderTime}
                />

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                        Reason / Note (Optional)
                    </label>
                    <textarea
                        {...register('note')}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                        rows={3}
                        placeholder="Why are you rescheduling?"
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontFamily: 'inherit' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        Save Changes
                    </Button>
                </div>
            </form>
        </div>
    );
};
