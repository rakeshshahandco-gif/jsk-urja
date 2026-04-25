import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import { getAssignableGroups } from '@/services/groupApi';
import { createTask, updateTask, getTaskGroups, createTaskMaster, updateTaskMaster } from '@/services/taskApi';
import { getTaskCategories } from '@/services/taskCategoryApi';
import toast from 'react-hot-toast';
import { GroupForm } from './GroupForm';
import { useModal } from '@/components/ui';
import { Plus, RefreshCw, Landmark, CreditCard, Receipt } from 'lucide-react';

import styles from './TaskForm.module.scss';
import clsx from 'clsx';

export const TaskForm = ({ task, onSuccess, onCancel }) => {
    console.log("TaskForm v1.1 - Every 15 Days included");
    const { openModal, closeModal } = useModal();
    const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
        defaultValues: task ? {
            ...task,
            groupId: task.groupId?._id || task.groupId || '',
            assignmentMode: task.assignmentMode || 'SINGLE',
            assignedGroupId: task.assignedGroupId?._id || task.assignedGroupId || '',
            taskCategoryId: task.taskCategoryId?._id || task.taskCategoryId || '',
            assigneeIds: task.assigneeIds ? task.assigneeIds.map(u => u._id || u.id || u) : [],
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
            recurrence: {
                enabled: task.recurrence?.enabled || !!task.taskMasterId || false,
                frequency: task.recurrence?.frequency || task.taskMasterId?.recurrence?.frequency || 'MONTHLY',
                interval: task.recurrence?.interval || task.taskMasterId?.recurrence?.interval || 1,
            },
            amount: task.amount || 0,
            billNumber: task.billNumber || '',
            referenceNumber: task.referenceNumber || '',
            remarks: task.remarks || '',
            isPaid: task.isPaid || false,
            enableBilling: !!(task.amount > 0 || task.billNumber || task.referenceNumber || task.remarks || task.isPaid)
        } : {
            priority: 'MEDIUM',
            status: 'OPEN',
            assignmentMode: 'SELF',
            assigneeIds: [],
            recurrence: { enabled: false, frequency: 'MONTHLY', interval: 1 },
            amount: 0,
            isPaid: false,
            enableBilling: false
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
    const enableBilling = watch('enableBilling');

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

        if (!hasFixedUsers && (data.assignmentMode === 'SINGLE' || data.assignmentMode === 'MULTI') && (!data.assigneeIds || data.assigneeIds.length === 0)) {
            toast.error('Please select at least one assignee.');
            return;
        }

        try {
            setSubmitting(true);
            
            // If RECURRING is enabled for a NEW task, we create a TaskMaster
            if (data.recurrence.enabled && !task) {
                const masterPayload = {
                    title: data.title,
                    description: data.description,
                    category: data.taskCategoryId || null,
                    priority: data.priority,
                    assignmentMode: data.assignmentMode,
                    assigneeIds: data.assigneeIds || [],
                    group: data.groupId || null,
                    defaultAmount: data.amount || 0,
                    defaultBillNumber: data.billNumber || '',
                    defaultReferenceNumber: data.referenceNumber || '',
                    defaultRemarks: data.remarks || '',
                    recurrence: {
                        frequency: data.recurrence.frequency,
                        interval: parseInt(data.recurrence.interval),
                        startDate: new Date(data.dueDate),
                        endType: data.recurrence.recurrenceEndType || 'NEVER',
                        // Only include these if they have values to avoid Joi null errors
                        ...(data.recurrence.recurrenceEndCount && { occurrenceCount: parseInt(data.recurrence.recurrenceEndCount) }),
                        ...(data.recurrence.recurrenceEndDate && { endDate: new Date(data.recurrence.recurrenceEndDate) })
                    }
                };
                await createTaskMaster(masterPayload);
                toast.success('Recurring Task Template Created');
            } else {
                const payload = {
                    ...data,
                    dueDate: new Date(data.dueDate).toISOString(),
                    assignmentMode: hasFixedUsers ? 'GROUP' : data.assignmentMode,
                    assignedGroupId: hasFixedUsers ? data.groupId : (data.assignmentMode === 'GROUP' ? data.assignedGroupId : null),
                    groupId: data.groupId || null,
                    taskCategoryId: data.taskCategoryId || null,
                    assigneeIds: hasFixedUsers ? selectedGroup.userIds.map(u => u._id || u.id || u) : ((data.assignmentMode === 'SINGLE' || data.assignmentMode === 'MULTI') ? data.assigneeIds : []),
                    recurrence: data.recurrence.enabled ? {
                        ...data.recurrence,
                        recurrenceEndDate: data.recurrence.recurrenceEndType === 'DATE' ? new Date(data.recurrence.recurrenceEndDate).toISOString() : null,
                        recurrenceEndCount: data.recurrence.recurrenceEndType === 'ON_COUNT' ? parseInt(data.recurrence.recurrenceEndCount) : null,
                        interval: parseInt(data.recurrence.interval)
                    } : { enabled: false }
                };

                if (task?._id) {
                    const { _id, id, groupId, createdAt, updatedAt, createdBy, __v, extensionHistory, ...sanitizedPayload } = payload;
                    await updateTask(task._id, sanitizedPayload);
                    toast.success('Task updated');
                } else {
                    await createTask(payload);
                    toast.success('Task created');
                }
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save task');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className={styles.loading}>Loading form options...</div>;
    }

    const selectedGroupDef = groupsOptions.find(g => (g._id || g.id) === selectedGroupId);
    const hasFixedUsers = selectedGroupDef && selectedGroupDef.userIds && selectedGroupDef.userIds.length > 0;

    const needsAssignee = !hasFixedUsers && (assignmentMode === 'SINGLE' || assignmentMode === 'MULTI');
    const needsGroup = !hasFixedUsers && (assignmentMode === 'GROUP');

    return (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
            {/* ── ROW 1: Group | +New | Title ── */}
            <div className={clsx(styles.row, styles.mixedCols)}>
                <div className={styles.field}>
                    <label className={styles.label}>Group *</label>
                    <select className={styles.select} {...register('groupId', { required: 'Group required' })}>
                        <option value="">— Select Group —</option>
                        {groupsOptions.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                    </select>
                    {errors.groupId && <div className={styles.error}>{errors.groupId.message}</div>}
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>&nbsp;</label>
                    <button type="button" onClick={handleCreateNewGroup} className={clsx(styles.btn, styles.secondary)}>
                        <Plus size={12} /> New
                    </button>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Task Title *</label>
                    <input
                        className={clsx(styles.input, styles.bold)}
                        {...register('title', { required: 'Title is required' })}
                        placeholder="What needs to be done?"
                    />
                    {errors.title && <div className={styles.error}>{errors.title.message}</div>}
                </div>
            </div>

            {/* ── ROW 2: Category | Priority | Assignment Mode | Assignee ── */}
            <div className={clsx(styles.row, styles.fourCols)}>
                <div className={styles.field}>
                    <label className={styles.label}>Category</label>
                    <select className={styles.select} {...register('taskCategoryId')}>
                        <option value="">No Category</option>
                        {categoriesOptions.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Priority</label>
                    <select className={styles.select} {...register('priority')}>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                </div>
                {!hasFixedUsers ? (
                    <div className={styles.field}>
                        <label className={styles.label}>Assign To</label>
                        <select className={styles.select} {...register('assignmentMode')}>
                            <option value="SELF">Self (Me)</option>
                            <option value="SINGLE">Single User</option>
                            <option value="MULTI">Multiple Users</option>
                            <option value="ALL">All Users</option>
                            <option value="GROUP">Specific Group</option>
                        </select>
                    </div>
                ) : (
                    <div className={styles.field}>
                        <label className={styles.label}>Assignment</label>
                        <div className={styles.fixedUsersBadge}>
                            Fixed to Group Users ({selectedGroupDef.userIds.length})
                        </div>
                    </div>
                )}
                {needsAssignee && (
                    <div className={styles.field}>
                        <label className={styles.label}>Assignee(s) *</label>
                        <MultiSelect
                            name="assigneeIds"
                            control={control}
                            options={usersOptions.map(u => ({ value: u.id || u._id, label: u.fullName || u.name }))}
                            placeholder="Select..."
                        />
                    </div>
                )}
                {needsGroup && (
                    <div className={styles.field}>
                        <label className={styles.label}>Select Group *</label>
                        <select className={styles.select} {...register('assignedGroupId')}>
                            <option value="">— Select —</option>
                            {(teamsOptions.length > 0 ? teamsOptions : groupsOptions).map(g => (
                                <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ── ROW 3: Due Date | Recurring toggle | Frequency | Interval ── */}
            <div className={clsx(styles.row, styles.fourCols)}>
                <div className={styles.field}>
                    <label className={styles.label}>Due Date *</label>
                    <input
                        type="date"
                        className={styles.input}
                        {...register('dueDate', { required: 'Due date required' })}
                    />
                    {errors.dueDate && <div className={styles.error}>{errors.dueDate.message}</div>}
                </div>
                <div className={styles.recurrenceBox}>
                    <input type="checkbox" id="recurrenceEnabled" {...register('recurrence.enabled')} />
                    <label
                        htmlFor="recurrenceEnabled"
                        className={clsx({ [styles.active]: recurrenceEnabled })}
                    >
                        <RefreshCw size={12} /> Recurring
                    </label>
                </div>

                {recurrenceEnabled && (
                    <>
                        <div className={styles.field}>
                            <label className={styles.label}>Frequency</label>
                            <select className={styles.select} {...register('recurrence.frequency')}>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="EVERY_15_DAYS">Every 15 Days</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="EVERY_2_MONTHS">Every 2 Months</option>
                                <option value="EVERY_6_MONTHS">Every 6 Months</option>
                                <option value="QUARTERLY">Quarterly</option>
                                <option value="YEARLY">Yearly</option>
                            </select>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label}>Every X</label>
                            <input type="number" className={styles.input} {...register('recurrence.interval')} min="1" />
                        </div>
                    </>
                )}
            </div>

            {/* ── Recurrence End Rule (only if recurring) ── */}
            {recurrenceEnabled && (
                <div className={clsx(styles.row, { [styles.threeCols]: (recurrenceEndType === 'DATE' || recurrenceEndType === 'ON_COUNT'), [styles.twoCols]: !(recurrenceEndType === 'DATE' || recurrenceEndType === 'ON_COUNT') })}>
                    <div className={styles.field}>
                        <label className={styles.label}>End Rule</label>
                        <select className={styles.select} {...register('recurrence.recurrenceEndType')}>
                            <option value="NEVER">Never ends</option>
                            <option value="DATE">Ends on date</option>
                            <option value="ON_COUNT">After N occurrences</option>
                        </select>
                    </div>
                    {recurrenceEndType === 'DATE' && (
                        <div className={styles.field}>
                            <label className={styles.label}>End Date</label>
                            <input type="date" className={styles.input} {...register('recurrence.recurrenceEndDate')} />
                        </div>
                    )}
                    {recurrenceEndType === 'ON_COUNT' && (
                        <div className={styles.field}>
                            <label className={styles.label}>Occurrences</label>
                            <input type="number" className={styles.input} {...register('recurrence.recurrenceEndCount')} min="1" />
                        </div>
                    )}
                </div>
            )}

            {/* ── Billing & Payment Details ── */}
            <div className={styles.field} style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                <div className={styles.recurrenceBox} style={{ display: 'inline-flex' }}>
                    <input type="checkbox" id="enableBilling" {...register('enableBilling')} />
                    <label
                        htmlFor="enableBilling"
                        className={clsx({ [styles.active]: enableBilling })}
                    >
                        <Receipt size={14} style={{ marginRight: '6px' }} /> Add Billing & Payment Details
                    </label>
                </div>
            </div>

            {enableBilling && (
                <div className={styles.billingSectionWrapper} style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #f3f4f6', marginBottom: '1rem' }}>
                    <div className={clsx(styles.row, styles.fourCols)} style={{ marginBottom: '1rem' }}>
                        <div className={styles.field}>
                            <label className={styles.label}>Amount (₹)</label>
                            <div className={styles.inputWithIcon}>
                                <span className={styles.prefix}>₹</span>
                                <input type="number" step="0.01" className={styles.input} {...register('amount')} placeholder="0.00" />
                            </div>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label}>Bill Number</label>
                            <div className={styles.inputWithIcon}>
                                <Receipt size={14} className={styles.icon} />
                                <input className={styles.input} {...register('billNumber')} placeholder="Invoice #" />
                            </div>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label}>Reference / Ref #</label>
                            <div className={styles.inputWithIcon}>
                                <Landmark size={14} className={styles.icon} />
                                <input className={styles.input} {...register('referenceNumber')} placeholder="UTR / Ref" />
                            </div>
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label}>Payment Status</label>
                            <div className={styles.paymentToggle}>
                                <input type="checkbox" id="isPaid" {...register('isPaid')} />
                                <label htmlFor="isPaid" className={clsx(styles.paidLabel, { [styles.paid]: watch('isPaid') })}>
                                    <CreditCard size={14} /> {watch('isPaid') ? 'PAID' : 'UNPAID'}
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>Billing Remarks</label>
                        <input className={styles.input} {...register('remarks')} placeholder="Payment method, date, etc." />
                    </div>
                </div>
            )}

            {/* ── ROW 4: Description ── */}
            <div className={styles.field}>
                <label className={styles.label}>Additional Description</label>
                <textarea
                    className={styles.textarea}
                    {...register('description')}
                    placeholder="Add any specific details or instructions..."
                />
            </div>

            {/* ── Buttons ── */}
            <div className={styles.footer}>
                <button type="button" onClick={() => { if (window.confirm('Discard changes?')) onCancel(); }} className={clsx(styles.btn, styles.secondary)}>Cancel</button>
                <button type="submit" disabled={submitting} className={clsx(styles.btn, styles.primary)}>
                    {submitting ? 'Saving...' : (task ? '✓ Update Task' : '🚀 Create Task')}
                </button>
            </div>
        </form>
    );
};
