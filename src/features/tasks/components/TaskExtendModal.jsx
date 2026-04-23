import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { extendTask } from '@/services/taskApi';
import toast from 'react-hot-toast';

export const TaskExtendModal = ({ task, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: {
            newDueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
            reason: ''
        }
    });

    const [submitting, setSubmitting] = useState(false);

    const onSubmit = async (data) => {
        try {
            setSubmitting(true);
            await extendTask(task._id, {
                newDueDate: new Date(data.newDueDate).toISOString(),
                reason: data.reason
            });
            toast.success('Task duration extended');
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to extend task');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-1">
            <p className="text-sm text-gray-600 mb-4">
                Extending task: <span className="font-bold">{task.title}</span>
            </p>

            <div>
                <label className="block text-sm font-medium mb-1">New Due Date *</label>
                <Input
                    type="date"
                    {...register('newDueDate', { required: 'Please select a new date' })}
                />
                {errors.newDueDate && <span className="text-red-500 text-xs">{errors.newDueDate.message}</span>}
            </div>

            <div>
                <label className="block text-sm font-medium mb-1">Reason for Extension *</label>
                <textarea
                    className="w-full border rounded p-2 text-sm"
                    {...register('reason', { required: 'Reason is required' })}
                    rows="3"
                    placeholder="Provide a brief explanation..."
                />
                {errors.reason && <span className="text-red-500 text-xs">{errors.reason.message}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                    {submitting ? 'Extending...' : 'Extend Due Date'}
                </Button>
            </div>
        </form>
    );
};
