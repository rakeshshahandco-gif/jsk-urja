import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import { getAssignableGroups } from '@/services/groupApi';
import { createTask, updateTask, getTaskGroups } from '@/services/taskApi';
import { getTaskCategories } from '@/services/taskCategoryApi';
import toast from 'react-hot-toast';
import { GroupForm } from './GroupForm';
import { useModal } from '@/components/ui';
import { Plus, RefreshCw } from 'lucide-react';

// Shared native input style — 32px height, compact
const f = {
    base: {
        height: 32, fontSize: 12, padding: '0 8px',
        border: '1px solid #d1d5db', borderRadius: 6,
        background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box'
    },
    sel: {
        height: 32, fontSize: 12, padding: '0 24px 0 8px',
        border: '1px solid #d1d5db', borderRadius: 6,
        background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
        appearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em'
    },
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3, letterSpacing: '0.04em' },
    btn: (primary) => ({
        height: 32, fontSize: 12, padding: '0 14px', borderRadius: 6, fontWeight: 600,
        cursor: 'pointer', border: primary ? 'none' : '1px solid #d1d5db',
        background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151',
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
    }),
    err: { color: '#ef4444', fontSize: 10, marginTop: 2 }
};

const col = (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 10, alignItems: 'end' });

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
            recurrence: { enabled: false, frequency: 'MONTHLY', interval: 1 }
        }
    });

    const [usersOptions, setUsersOptions] = useState([]);
    const [groupsOptions, setGroupsOptions] = useState([]);
    const [teamsOptions, setTeamsOptions] = useState([]);
    const [categoriesOptions, setCategoriesOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const assignmentMode = watch('assignmentMode');
    const recurrenceEnabled = watch('recurrence.enabled');
    const recurrenceEndType = watch('recurrence.recurrenceEndType');
    const selectedGroupId = watch('groupId');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [users, taskGroups, categories, teams] = await Promise.all([
                    userService.getAssignableUsers().catch(() => []),
                    getTaskGroups().catch(() => ({ data: [] })),
                    getTaskCategories().catch(() => ({ data: [] })),
                    getAssignableGroups().catch(() => ({ data: [] }))
                ]);
                setUsersOptions(Array.isArray(users) ? users : (users?.data || []));
                const tgData = taskGroups?.data || taskGroups || [];
                setGroupsOptions(Array.isArray(tgData) ? tgData : []);
                const teamData = teams?.data || teams || [];
                setTeamsOptions(Array.isArray(teamData) ? teamData : []);
                setCategoriesOptions(Array.isArray(categories.data) ? categories.data : (Array.isArray(categories) ? categories : []));
                if (!task && Array.isArray(tgData)) {
                    const general = tgData.find(g => g.name === 'General');
                    if (general) setValue('groupId', general._id || general.id);
                }
            } catch (err) {
                toast.error('Failed to load form options');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCreateNewGroup = () => {
        const modalId = openModal(GroupForm, {
            title: 'Create New Group',
            onSuccess: (newGroup) => {
                setGroupsOptions(prev => [newGroup, ...prev]);
                setValue('groupId', newGroup._id || newGroup.id);
                closeModal(modalId);
            },
            onCancel: () => closeModal(modalId)
        });
    };

    const onSubmit = async (data) => {
        const selectedGroup = groupsOptions.find(g => (g._id || g.id) === data.groupId);
        const hasFixedUsers = selectedGroup && selectedGroup.userIds && selectedGroup.userIds.length > 0;

        // Strict Option 2 frontend validation
        if (!hasFixedUsers && (data.assignmentMode === 'SINGLE' || data.assignmentMode === 'MULTI') && (!data.assigneeIds || data.assigneeIds.length === 0)) {
            toast.error('Please select at least one assignee.');
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                ...data,
                dueDate: new Date(data.dueDate).toISOString(),
                assignedGroupId: data.assignmentMode === 'GROUP' ? data.assignedGroupId : null,
                groupId: data.groupId || null,
                taskCategoryId: data.taskCategoryId || null,
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

    if (loading) {
        return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Loading form options...</div>;
    }

    const selectedGroupDef = groupsOptions.find(g => (g._id || g.id) === selectedGroupId);
    const hasFixedUsers = selectedGroupDef && selectedGroupDef.userIds && selectedGroupDef.userIds.length > 0;

    const needsAssignee = !hasFixedUsers && (assignmentMode === 'SINGLE' || assignmentMode === 'MULTI');
    const needsGroup = !hasFixedUsers && (assignmentMode === 'GROUP');

    return (
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── ROW 1: Group | +New | Title ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 80px 1fr', gap: 10, alignItems: 'end' }}>
                <div>
                    <label style={f.label}>Group *</label>
                    <select style={f.sel} {...register('groupId', { required: 'Group required' })}>
                        <option value="">— Select Group —</option>
                        {groupsOptions.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                    </select>
                    {errors.groupId && <div style={f.err}>{errors.groupId.message}</div>}
                </div>
                <div>
                    <label style={f.label}>&nbsp;</label>
                    <button type="button" onClick={handleCreateNewGroup} style={f.btn(false)}>
                        <Plus size={12} /> New
                    </button>
                </div>
                <div>
                    <label style={f.label}>Task Title *</label>
                    <input
                        style={{ ...f.base, fontWeight: 600 }}
                        {...register('title', { required: 'Title is required' })}
                        placeholder="What needs to be done?"
                    />
                    {errors.title && <div style={f.err}>{errors.title.message}</div>}
                </div>
            </div>

            {/* ── ROW 2: Category | Priority | Assignment Mode | Assignee ── */}
            <div style={col(4)}>
                <div>
                    <label style={f.label}>Category</label>
                    <select style={f.sel} {...register('taskCategoryId')}>
                        <option value="">No Category</option>
                        {categoriesOptions.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={f.label}>Priority</label>
                    <select style={f.sel} {...register('priority')}>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                </div>
                {!hasFixedUsers && (
                    <div>
                        <label style={f.label}>Assign To</label>
                        <select style={f.sel} {...register('assignmentMode')}>
                            <option value="SELF">Self (Me)</option>
                            <option value="SINGLE">Single User</option>
                            <option value="MULTI">Multiple Users</option>
                            <option value="ALL">All Users</option>
                            <option value="GROUP">Specific Group</option>
                        </select>
                    </div>
                )}
                {hasFixedUsers && (
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={f.label}>Assignment</label>
                        <div style={{ ...f.base, background: '#f3f4f6', color: '#6b7280', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                            Fixed to Group Users ({selectedGroupDef.userIds.length})
                        </div>
                    </div>
                )}
                {needsAssignee && (
                    <div>
                        <label style={f.label}>Assignee(s) *</label>
                        <div style={{ fontSize: 12 }}>
                            <MultiSelect
                                name="assigneeIds"
                                control={control}
                                options={usersOptions.map(u => ({ value: u.id || u._id, label: u.fullName || u.name }))}
                                placeholder="Select..."
                            />
                        </div>
                    </div>
                )}
                {needsGroup && (
                    <div>
                        <label style={f.label}>Select Group *</label>
                        <select style={f.sel} {...register('assignedGroupId')}>
                            <option value="">— Select —</option>
                            {(teamsOptions.length > 0 ? teamsOptions : groupsOptions).map(g => (
                                <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {!needsAssignee && !needsGroup && !hasFixedUsers && <div />}
            </div>

            {/* ── ROW 3: Due Date | Recurring toggle | Frequency | Interval ── */}
            <div style={col(4)}>
                <div>
                    <label style={f.label}>Due Date & Time *</label>
                    <input
                        type="datetime-local"
                        style={f.base}
                        {...register('dueDate', { required: 'Due date required' })}
                    />
                    {errors.dueDate && <div style={f.err}>{errors.dueDate.message}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                    <label style={{ ...f.label, margin: 0 }}>&nbsp;</label>
                    <input type="checkbox" id="recurrenceEnabled" {...register('recurrence.enabled')} style={{ width: 14, height: 14 }} />
                    <label htmlFor="recurrenceEnabled" style={{ fontSize: 12, fontWeight: 600, color: recurrenceEnabled ? '#7c3aed' : '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw size={12} /> Recurring
                    </label>
                </div>
                {recurrenceEnabled ? (
                    <>
                        <div>
                            <label style={f.label}>Frequency</label>
                            <select style={{ ...f.sel, borderColor: '#c4b5fd' }} {...register('recurrence.frequency')}>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="QUARTERLY">Quarterly</option>
                                <option value="YEARLY">Yearly</option>
                            </select>
                        </div>
                        <div>
                            <label style={f.label}>Every X</label>
                            <input type="number" style={{ ...f.base, borderColor: '#c4b5fd' }} {...register('recurrence.interval')} min="1" />
                        </div>
                    </>
                ) : (
                    <><div /><div /></>
                )}
            </div>

            {/* ── Recurrence End Rule (only if recurring) ── */}
            {recurrenceEnabled && (
                <div style={col(recurrenceEndType === 'DATE' || recurrenceEndType === 'ON_COUNT' ? 3 : 2)}>
                    <div>
                        <label style={f.label}>End Rule</label>
                        <select style={{ ...f.sel, borderColor: '#c4b5fd' }} {...register('recurrence.recurrenceEndType')}>
                            <option value="NEVER">Never ends</option>
                            <option value="DATE">Ends on date</option>
                            <option value="ON_COUNT">After N occurrences</option>
                        </select>
                    </div>
                    {recurrenceEndType === 'DATE' && (
                        <div>
                            <label style={f.label}>End Date</label>
                            <input type="date" style={{ ...f.base, borderColor: '#c4b5fd' }} {...register('recurrence.recurrenceEndDate')} />
                        </div>
                    )}
                    {recurrenceEndType === 'ON_COUNT' && (
                        <div>
                            <label style={f.label}>Occurrences</label>
                            <input type="number" style={{ ...f.base, borderColor: '#c4b5fd' }} {...register('recurrence.recurrenceEndCount')} min="1" />
                        </div>
                    )}
                </div>
            )}

            {/* ── ROW 4: Description ── */}
            <div>
                <label style={f.label}>Description</label>
                <textarea
                    style={{ ...f.base, height: 52, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
                    {...register('description')}
                    placeholder="Add any specific details or instructions..."
                />
            </div>

            {/* ── Buttons ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 2 }}>
                <button type="button" onClick={onCancel} style={f.btn(false)}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ ...f.btn(true), opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Saving...' : (task ? '✓ Update Task' : '🚀 Create Task')}
                </button>
            </div>
        </form>
    );
};
