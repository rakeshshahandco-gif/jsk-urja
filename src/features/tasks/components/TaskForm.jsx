import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Select, MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import { getAssignableGroups } from '@/services/groupApi';
import { createTask, updateTask } from '@/services/taskApi';
import { getTaskCategories } from '@/services/taskCategoryApi';
import api from '@/services/api';
import toast from 'react-hot-toast';

export const TaskForm = ({ task, onSuccess, onCancel }) => {
    const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
        defaultValues: task ? {
            ...task,
            assignmentMode: task.assignmentMode || 'SINGLE',
            assignedGroupId: task.assignedGroupId?._id || task.assignedGroupId || '',
            taskCategoryId: task.taskCategoryId?._id || task.taskCategoryId || '',
            assigneeIds: task.assigneeIds ? task.assigneeIds.map(u => u._id || u.id || u) : [],
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : null,
            customerId: task.customerId?._id || task.customerId || '',
            recurrence: {
                enabled: task.recurrence?.enabled || false,
                frequency: task.recurrence?.frequency || 'MONTHLY',
                interval: task.recurrence?.interval || 1,
            }
        } : {
            priority: 'MEDIUM',
            status: 'OPEN',
            assignmentMode: 'SELF',
            assigneeIds: [],
            customerId: task?.customerId || '',
            recurrence: {
                enabled: false,
                frequency: 'MONTHLY',
                interval: 1,
            }
        }
    });

    const [usersOptions, setUsersOptions] = useState([]);
    const [groupsOptions, setGroupsOptions] = useState([]);
    const [categoriesOptions, setCategoriesOptions] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const assignmentMode = watch('assignmentMode');
    const recurrenceEnabled = watch('recurrence.enabled');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [users, groups, categories, customers] = await Promise.all([
                    userService.getAssignableUsers().catch(() => api.get('/users').then(r => r.data.data)),
                    getAssignableGroups().catch(() => api.get('/groups').then(r => r.data.data)),
                    getTaskCategories().catch(() => ({ data: [] })),
                    api.get('/customers').catch(() => ({ data: { results: [] } }))
                ]);

                setUsersOptions(Array.isArray(users) ? users : []);
                setGroupsOptions(Array.isArray(groups?.data) ? groups.data : (Array.isArray(groups) ? groups : []));
                setCategoriesOptions(Array.isArray(categories.data) ? categories.data : []);
                setCustomerOptions(customers.data?.results || customers.data?.data || []);
            } catch (error) {
                console.error('Failed to load form options:', error);
                toast.error('Failed to load some form options');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const onSubmit = async (data) => {
        try {
            setSubmitting(true);
            const payload = {
                ...data,
                dueDate: new Date(data.dueDate).toISOString(),
                assignedGroupId: data.assignmentMode === 'GROUP' ? data.assignedGroupId : null,
                taskCategoryId: data.taskCategoryId || null,
                customerId: data.customerId || null,
                assigneeIds: (data.assignmentMode === 'SINGLE' || data.assignmentMode === 'MULTI') ? data.assigneeIds : [],
            };

            if (task?._id) {
                await updateTask(task._id, payload);
                toast.success('Task updated');
            } else {
                await createTask(payload);
                toast.success('Task created');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save task');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[80vh] overflow-y-auto p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Title *</label>
                    <Input {...register('title', { required: 'Title is required' })} placeholder="Task Title" />
                    {errors.title && <span className="text-red-500 text-xs">{errors.title.message}</span>}
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                        className="w-full border rounded p-2 text-sm"
                        {...register('description')}
                        rows="2"
                        placeholder="Details..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Category (Grouping)</label>
                    <select className="w-full border rounded p-2 bg-white text-sm" {...register('taskCategoryId')}>
                        <option value="">No Category</option>
                        {categoriesOptions.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Link to Customer (Optional)</label>
                    <select className="w-full border rounded p-2 bg-white text-sm" {...register('customerId')}>
                        <option value="">No Customer</option>
                        {customerOptions.map(c => (
                            <option key={c._id} value={c._id}>{c.firstName} {c.lastName} ({c.mobile})</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Priority</label>
                    <select className="w-full border rounded p-2 bg-white text-sm" {...register('priority')}>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                </div>

                <div className="col-span-2 border-t pt-4 mt-2">
                    <label className="block text-sm font-bold mb-3">Assignment Settings</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Assignment Mode</label>
                            <select className="w-full border rounded p-2 bg-white text-sm" {...register('assignmentMode')}>
                                <option value="SELF">Self (Assigned to Me)</option>
                                <option value="SINGLE">Single User</option>
                                <option value="MULTI">Multiple Users</option>
                                <option value="ALL">All Users</option>
                                <option value="GROUP">Specific Group</option>
                            </select>
                        </div>

                        {(assignmentMode === 'SINGLE' || assignmentMode === 'MULTI') && (
                            <div>
                                <MultiSelect
                                    label="Assignees *"
                                    name="assigneeIds"
                                    control={control}
                                    options={usersOptions.map(u => ({
                                        value: u.id || u._id,
                                        label: `${u.fullName || u.name} (${u.username})`
                                    }))}
                                    placeholder="Select Users"
                                />
                            </div>
                        )}

                        {assignmentMode === 'GROUP' && (
                            <div>
                                <label className="block text-sm font-medium mb-1">Select Group *</label>
                                <select className="w-full border rounded p-2 bg-white text-sm" {...register('assignedGroupId')}>
                                    <option value="">Select Group</option>
                                    {groupsOptions.map(g => (
                                        <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="col-span-2 border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                        <input type="checkbox" id="recurrenceEnabled" {...register('recurrence.enabled')} />
                        <label htmlFor="recurrenceEnabled" className="text-sm font-bold">Recurring Task</label>
                    </div>

                    {recurrenceEnabled && (
                        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded border">
                            <div>
                                <label className="block text-sm font-medium mb-1">Frequency</label>
                                <select className="w-full border rounded p-2 bg-white text-sm" {...register('recurrence.frequency')}>
                                    <option value="DAILY">Daily</option>
                                    <option value="WEEKLY">Weekly</option>
                                    <option value="MONTHLY">Monthly</option>
                                    <option value="QUARTERLY">Quarterly</option>
                                    <option value="YEARLY">Yearly</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Interval (Every X)</label>
                                <Input type="number" {...register('recurrence.interval')} min="1" />
                            </div>
                            <p className="col-span-2 text-xs text-gray-500 italic">
                                A new task will be created automatically when this one is completed.
                            </p>
                        </div>
                    )}
                </div>

                <div className="col-span-2 border-t pt-4">
                    <label className="block text-sm font-medium mb-1">Due Date *</label>
                    <Input type="datetime-local" {...register('dueDate', { required: 'Due Date is required' })} />
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : (task ? 'Update Task' : 'Create Task')}
                </Button>
            </div>
        </form>
    );
};

