import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Select, MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import { getAssignableGroups } from '@/services/groupApi';
import { createTask, updateTask } from '@/services/taskApi';
import { getTaskCategories } from '@/services/taskCategoryApi';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { GroupForm } from './GroupForm';
import { useModal } from '@/components/ui';

export const TaskForm = ({ task, onSuccess, onCancel }) => {
    const { openModal, closeModal } = useModal();
    const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
        defaultValues: task ? {
            ...task,
            groupId: task.groupId?._id || task.groupId || '',
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
    const selectedGroupId = watch('groupId');

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

                // Auto-select "General" group if creating a new task and General group exists
                if (!task && Array.isArray(groups)) {
                    const general = groups.find(g => g.name === 'General');
                    if (general) {
                        setValue('groupId', general._id || general.id);
                    }
                }
            } catch (error) {
                console.error('Failed to load form options:', error);
                toast.error('Failed to load some form options');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCreateNewGroup = () => {
        openModal({
            title: 'Create New Group',
            content: (
                <GroupForm
                    onSuccess={(newGroup) => {
                        setGroupsOptions(prev => [newGroup, ...prev]);
                        setValue('groupId', newGroup._id || newGroup.id);
                        closeModal();
                    }}
                    onCancel={closeModal}
                />
            )
        });
    };

    const onSubmit = async (data) => {
        try {
            setSubmitting(true);
            const payload = {
                ...data,
                dueDate: new Date(data.dueDate).toISOString(),
                assignedGroupId: data.assignmentMode === 'GROUP' ? data.assignedGroupId : null,
                groupId: data.groupId || null,
                taskCategoryId: data.taskCategoryId || null,
                customerId: data.customerId || null,
                assigneeIds: (data.assignmentMode === 'SINGLE' || data.assignmentMode === 'MULTI') ? data.assigneeIds : [],
                recurrence: data.recurrence.enabled ? {
                    ...data.recurrence,
                    recurrenceEndDate: data.recurrence.recurrenceEndType === 'DATE' ? new Date(data.recurrence.recurrenceEndDate).toISOString() : null,
                    recurrenceEndCount: data.recurrence.recurrenceEndType === 'ON_COUNT' ? parseInt(data.recurrence.recurrenceEndCount) : null,
                    interval: parseInt(data.recurrence.interval)
                } : { enabled: false }
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-h-[85vh] overflow-y-auto p-1">
            {/* Group Selection Section - MANDATORY TOP */}
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <label className="text-sm font-black text-blue-900 uppercase tracking-wider">
                        1. Select or Create Group *
                    </label>
                    <button
                        type="button"
                        onClick={handleCreateNewGroup}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-white px-2 py-1 rounded border border-blue-200 shadow-sm"
                    >
                        + New Group
                    </button>
                </div>
                <div>
                    <select
                        className={`w-full border rounded-lg p-3 bg-white text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary outline-none transition-all ${!selectedGroupId ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                        {...register('groupId', { required: 'Group is mandatory' })}
                    >
                        <option value="">-- Choose a Group First --</option>
                        {groupsOptions.map(g => (
                            <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                        ))}
                    </select>
                    {errors.groupId && <span className="text-red-500 text-xs font-bold mt-1 block">{errors.groupId.message}</span>}
                </div>
                {!selectedGroupId && (
                    <p className="text-[11px] text-blue-700 font-medium italic">
                        ⚠️ Please select a group to unlock the rest of the task form.
                    </p>
                )}
            </div>

            {/* Task Form - LOCKED until Group is selected */}
            <div className={`space-y-4 transition-all duration-300 ${!selectedGroupId ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="bg-white p-4 rounded-xl border border-gray-100 space-y-4 shadow-sm">
                    <label className="text-sm font-black text-gray-900 uppercase tracking-wider block border-b pb-2 mb-4">
                        2. Task Details
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1 text-gray-700">Title *</label>
                            <Input {...register('title', { required: selectedGroupId ? 'Title is required' : false })} placeholder="What needs to be done?" className="font-medium" />
                            {errors.title && <span className="text-red-500 text-xs font-bold">{errors.title.message}</span>}
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1 text-gray-700">Description</label>
                            <textarea
                                className="w-full border rounded-lg p-3 text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary transition-all"
                                {...register('description')}
                                rows="2"
                                placeholder="Add any specific details or instructions..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1 text-gray-700">Category Tag</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none" {...register('taskCategoryId')}>
                                <option value="">No Category</option>
                                {categoriesOptions.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1 text-gray-700">Priority</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none" {...register('priority')}>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                                <option value="CRITICAL">Critical</option>
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1 text-gray-700">Link to Customer</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none" {...register('customerId')}>
                                <option value="">No Customer</option>
                                {customerOptions.map(c => (
                                    <option key={c._id} value={c._id}>{c.firstName} {c.lastName} ({c.mobile})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 space-y-4 shadow-sm">
                    <label className="text-sm font-black text-gray-900 uppercase tracking-wider block border-b pb-2 mb-4">
                        3. Assignment & Recurrence
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1 text-gray-700">Assignment Mode</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none" {...register('assignmentMode')}>
                                <option value="SELF">Self (Assigned to Me)</option>
                                <option value="SINGLE">Single User</option>
                                <option value="MULTI">Multiple Users</option>
                                <option value="ALL">All Users</option>
                                <option value="GROUP">Specific Group</option>
                            </select>
                        </div>

                        {(assignmentMode === 'SINGLE' || assignmentMode === 'MULTI') && (
                            <div className="col-span-2">
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
                            <div className="col-span-2">
                                <label className="block text-sm font-bold mb-1 text-gray-700">Select Group *</label>
                                <select className="w-full border rounded-lg p-2.5 bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary outline-none" {...register('assignedGroupId')}>
                                    <option value="">Select Group</option>
                                    {groupsOptions.map(g => (
                                        <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="border-t pt-4 mt-2">
                        <div className="flex items-center gap-2 mb-3">
                            <input type="checkbox" id="recurrenceEnabled" {...register('recurrence.enabled')} className="w-4 h-4 rounded text-primary focus:ring-primary" />
                            <label htmlFor="recurrenceEnabled" className="text-sm font-black text-gray-700">Recurring Task</label>
                        </div>

                        {recurrenceEnabled && (
                            <div className="grid grid-cols-2 gap-4 p-4 bg-purple-50 rounded-xl border border-purple-100 shadow-inner">
                                <div>
                                    <label className="block text-xs font-black text-purple-900 uppercase">Frequency</label>
                                    <select className="w-full border-0 rounded-lg p-2 bg-white text-sm font-bold mt-1" {...register('recurrence.frequency')}>
                                        <option value="DAILY">Daily</option>
                                        <option value="WEEKLY">Weekly</option>
                                        <option value="MONTHLY">Monthly</option>
                                        <option value="QUARTERLY">Quarterly</option>
                                        <option value="YEARLY">Yearly</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-purple-900 uppercase">Every X</label>
                                    <Input type="number" {...register('recurrence.interval')} min="1" className="bg-white border-0 mt-1 font-bold" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-black text-purple-900 uppercase">End Rule</label>
                                    <select className="w-full border-0 rounded-lg p-2 bg-white text-sm font-bold mt-1" {...register('recurrence.recurrenceEndType')}>
                                        <option value="NEVER">Never ends</option>
                                        <option value="DATE">Ends on date</option>
                                        <option value="ON_COUNT">Ends after N occurrences</option>
                                    </select>
                                </div>
                                {watch('recurrence.recurrenceEndType') === 'DATE' && (
                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-purple-900 uppercase">End Date</label>
                                        <Input type="date" {...register('recurrence.recurrenceEndDate')} className="bg-white border-0 mt-1 font-bold" />
                                    </div>
                                )}
                                {watch('recurrence.recurrenceEndType') === 'ON_COUNT' && (
                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-purple-900 uppercase">Number of Occurrences</label>
                                        <Input type="number" {...register('recurrence.recurrenceEndCount')} min="1" className="bg-white border-0 mt-1 font-bold" />
                                    </div>
                                )}
                                <p className="col-span-2 text-[10px] text-purple-700 font-bold italic text-center mt-2">
                                    ✨ A new task will be created automatically under the same group when this one is closed.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <label className="block text-sm font-black text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">
                        4. Timing
                    </label>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-gray-700">Due Date *</label>
                        <Input type="datetime-local" {...register('dueDate', { required: selectedGroupId ? 'Due Date is required' : false })} className="font-bold" />
                        {errors.dueDate && <span className="text-red-500 text-xs font-bold">{errors.dueDate.message}</span>}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t mt-8">
                <Button type="button" variant="outline" onClick={onCancel} className="font-bold px-6">Cancel</Button>
                <Button type="submit" disabled={submitting || !selectedGroupId} className={`font-black px-10 ${!selectedGroupId ? 'bg-gray-200 cursor-not-allowed' : ''}`}>
                    {submitting ? 'Saving...' : (task ? 'Update Task' : '🚀 Create Task')}
                </Button>
            </div>
        </form>
    );
};

