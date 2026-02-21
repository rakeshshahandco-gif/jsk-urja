import React from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Select } from '@/components/ui';
import { createTaskGroup } from '@/services/taskApi';
import toast from 'react-hot-toast';

export const GroupForm = ({ onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
        defaultValues: {
            name: '',
            notes: '',
            visibility: 'COMPANY'
        }
    });

    const onSubmit = async (data) => {
        try {
            const result = await createTaskGroup(data);
            toast.success('Group created successfully');
            onSuccess(result);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create group');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-1">
            <div>
                <label className="block text-sm font-bold mb-1 text-gray-700">Group Name *</label>
                <Input
                    {...register('name', { required: 'Group name is required' })}
                    placeholder="e.g., Marketing Campaign, Onboarding"
                    className="font-medium"
                />
                {errors.name && <span className="text-red-500 text-xs">{errors.name.message}</span>}
            </div>

            <div>
                <label className="block text-sm font-bold mb-1 text-gray-700">Notes (Optional)</label>
                <textarea
                    className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary transition-all"
                    {...register('notes')}
                    rows="3"
                    placeholder="Describe the purpose of this group..."
                />
            </div>

            <div>
                <label className="block text-sm font-bold mb-1 text-gray-700">Visibility</label>
                <select
                    className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                    {...register('visibility')}
                >
                    <option value="PRIVATE">Private (Only Me)</option>
                    <option value="TEAM">Team (Assigned Group)</option>
                    <option value="COMPANY">Company (Everyone)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1 italic">
                    Controls who can see tasks within this group.
                </p>
            </div>

            <div className="flex justify-end gap-2 pt-6 border-t mt-4">
                <Button type="button" variant="outline" onClick={onCancel} className="font-bold">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="font-bold px-8">
                    {isSubmitting ? 'Creating...' : 'Create Group'}
                </Button>
            </div>
        </form>
    );
};
