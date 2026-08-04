import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { getTaskGroups, createTaskGroup, deleteTaskGroup, updateTaskGroup, getTaskGroup } from '@/services/taskApi';
import { Button, Input, useModal, Select, MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

import { Users, Search, Plus, Edit2, Trash2 } from 'lucide-react';

import styles from './TaskGroupList.module.scss';
import clsx from 'clsx';

import { BrandedLoader } from '@/components/ui/BrandedLoading';

export const TaskGroupList = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const { openModal, closeModal } = useModal();
    const { user } = useAuth();

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const res = await getTaskGroups();
            setGroups(res.data || res || []);
        } catch (error) {
            toast.error('Failed to load task groups');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    useGlobalSync('taskgroup', (payload) => {
        if (payload.action === 'create') setGroups(prev => [...prev, payload.data]);
        else if (payload.action === 'update') setGroups(prev => prev.map(g => g._id === payload.recordId ? { ...g, ...payload.data } : g));
        else if (payload.action === 'delete') setGroups(prev => prev.filter(g => g._id !== payload.recordId));
    });

    const handleCreate = () => {
        const modalId = openModal(
            TaskGroupFormModal,
            {
                title: 'Create Task Group',
                onSuccess: () => { closeModal(modalId); fetchGroups(); },
                onCancel: () => closeModal(modalId)
            }
        );
    };

    const handleEdit = (group) => {
        const modalId = openModal(
            TaskGroupFormModal,
            {
                title: 'Edit Task Group',
                initialData: group,
                onSuccess: () => { closeModal(modalId); fetchGroups(); },
                onCancel: () => closeModal(modalId)
            }
        );
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this task group? Tasks assigned to it will lose their group association.')) return;
        try {
            await deleteTaskGroup(id);
            toast.success('Task Group deleted');
            fetchGroups();
        } catch (error) {
            toast.error('Failed to delete task group');
        }
    };

    if (loading) return <BrandedLoader size={120} />;

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h1 className={styles.title}>Task Groups</h1>
                    <p className={styles.subtitle}>Create and manage dedicated groups for instant task assignments.</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus size={16} /> New Group
                </Button>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: 50, textAlign: 'center' }}>#</th>
                            <th style={{ width: '18%' }}>Group Name</th>
                            <th>Description</th>
                            <th style={{ width: 90 }}>Recurrence</th>
                            <th style={{ width: '20%' }}>Members</th>
                            <th style={{ width: 70 }}>Tasks</th>
                            <th style={{ width: 80 }}>Highlight</th>
                            <th style={{ width: 90 }}>Visibility</th>
                            <th style={{ width: 90 }}>Status</th>
                            <th style={{ width: 80, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group, idx) => (
                            <tr key={group._id}>
                                <td style={{ textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                                <td>
                                    <div className={styles.groupName}>{group.name}</div>
                                </td>
                                <td>
                                    <div className={styles.notes} title={group.notes}>{group.notes || '—'}</div>
                                </td>
                                <td style={{ color: '#64748b', fontSize: 12 }}>{group.recurrenceType || '—'}</td>
                                <td>
                                    <div className={styles.memberPills}>
                                        {group.userIds?.slice(0, 3).map(u => (
                                            <span key={u._id} className={styles.pill}>
                                                {u.name || (u.firstName ? u.firstName + ' ' + u.lastName : u.email)}
                                            </span>
                                        ))}
                                        {group.userIds?.length > 3 && <span className={styles.pill}>+{group.userIds.length - 3}</span>}
                                        {(!group.userIds || group.userIds.length === 0) && (
                                            <span className={styles.noMembers}>No members</span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ color: '#334155', fontWeight: 700 }}>{group.taskCount ?? '—'}</td>
                                <td>{group.isHighlighted ? '⭐ Yes' : '—'}</td>
                                <td>
                                    <span className={clsx(styles.badge, styles[`visibility_${group.visibility}`])}>
                                        {group.visibility}
                                    </span>
                                </td>
                                <td style={{ color: group.isActive === false ? '#dc2626' : '#059669', fontWeight: 700 }}>
                                    {group.isActive === false ? 'Inactive' : 'Active'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <div className={styles.actions}>
                                        {group.name !== 'General' ? (
                                            <>
                                                <button className={styles.iconBtn} onClick={() => handleEdit(group)} title="Edit Group">
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    className={styles.iconBtn}
                                                    title={group.isHighlighted ? 'Remove highlight' : 'Highlight on dashboard'}
                                                    onClick={async () => {
                                                        try {
                                                            await updateTaskGroup(group._id, { isHighlighted: !group.isHighlighted });
                                                            toast.success(group.isHighlighted ? 'Highlight removed' : 'Group highlighted');
                                                            fetchGroups();
                                                        } catch {
                                                            toast.error('Failed to update highlight');
                                                        }
                                                    }}
                                                >
                                                    ★
                                                </button>
                                                <button className={clsx(styles.iconBtn, styles.danger)} onClick={() => handleDelete(group._id)} title="Delete Group">
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <span style={{ fontSize: 10, color: '#94a3b8', paddingRight: 8 }}>System</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {groups.length === 0 && (
                <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>No task groups found</p>
                    <p className={styles.emptyText}>Create one to easily assign tasks to multiple people!</p>
                </div>
            )}
        </div>
    );
};

// Form Modal Component
const TaskGroupFormModal = ({ title, onSuccess, onCancel, initialData }) => {
    const [activeTab, setActiveTab] = useState('details');
    const [name, setName] = useState(initialData?.name || '');
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [groupType, setGroupType] = useState(initialData?.groupType || 'Compliance');
    const [visibility, setVisibility] = useState(initialData?.visibility || 'COMPANY');
    const [userIds, setUserIds] = useState(initialData?.userIds?.map(u => u._id || u) || []);
    const [recurrenceType, setRecurrenceType] = useState(initialData?.recurrenceType || 'MONTHLY');
    const [showInTaskHub, setShowInTaskHub] = useState(initialData?.showInTaskHub !== false);
    const [isHighlighted, setIsHighlighted] = useState(!!initialData?.isHighlighted);
    const [highlightStyle, setHighlightStyle] = useState(initialData?.highlightStyle || 'blue');
    const [showInGeneralTaskLists, setShowInGeneralTaskLists] = useState(!!initialData?.showInGeneralTaskLists);
    const [notifyAllMembers, setNotifyAllMembers] = useState(initialData?.notifyAllMembers !== false);
    const [allowMembersUpdate, setAllowMembersUpdate] = useState(initialData?.allowMembersUpdate !== false);
    const [isActive, setIsActive] = useState(initialData?.isActive !== false);
    const [sampleTasks, setSampleTasks] = useState(
        Array.isArray(initialData?.sampleTasks) ? initialData.sampleTasks : []
    );

    const [usersOptions, setUsersOptions] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        userService.getAssignableUsers().then(users => {
            setUsersOptions(Array.isArray(users) ? users : (users?.data || []));
        });
        if (initialData?._id) {
            getTaskGroup(initialData._id).then((data) => {
                const g = data?.group || data;
                if (Array.isArray(g?.sampleTasks)) setSampleTasks(g.sampleTasks);
            }).catch(() => {});
        }
    }, [initialData?._id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return toast.error('Group name is required');

        try {
            setSubmitting(true);
            const payload = {
                name,
                notes,
                groupType,
                visibility,
                userIds,
                recurrenceType,
                showInTaskHub,
                isHighlighted,
                highlightStyle,
                showInGeneralTaskLists,
                notifyAllMembers,
                allowMembersUpdate,
                isActive,
                sampleTasks: sampleTasks.filter((t) => String(t.title || '').trim()),
            };

            if (initialData?._id) {
                await updateTaskGroup(initialData._id, payload);
                toast.success('Task Group updated');
            } else {
                await createTaskGroup(payload);
                toast.success('Task Group created');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save group');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleRow = (label, checked, onChange, help) => (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</span>
                {help ? <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{help}</span> : null}
            </span>
        </label>
    );

    return (
        <form onSubmit={handleSubmit} className={styles.modalForm}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['details', 'samples'].map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        style={{
                            border: '1px solid #e2e8f0',
                            background: activeTab === tab ? '#eff6ff' : '#fff',
                            color: activeTab === tab ? '#1d4ed8' : '#475569',
                            fontWeight: 700,
                            fontSize: 12,
                            borderRadius: 8,
                            padding: '6px 12px',
                            cursor: 'pointer',
                        }}
                    >
                        {tab === 'details' ? 'Group Details' : 'Sample Tasks'}
                    </button>
                ))}
            </div>

            {activeTab === 'details' ? (
                <>
                    <div className={styles.field}>
                        <label className={styles.label}>Group Name *</label>
                        <input
                            className={styles.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. GSTR1 — Monthly"
                            autoFocus
                            required
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Group Type</label>
                        <select className={styles.select} value={groupType} onChange={(e) => setGroupType(e.target.value)}>
                            <option value="Compliance">Compliance</option>
                            <option value="Accounts">Accounts</option>
                            <option value="Payroll">Payroll</option>
                            <option value="Operations">Operations</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Notes / Description</label>
                        <textarea
                            className={styles.textarea}
                            style={{ minHeight: 70 }}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows="2"
                            placeholder="Optional details..."
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Recurrence</label>
                        <select className={styles.select} value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value)}>
                            <option value="MONTHLY">Monthly</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="QUARTERLY">Quarterly</option>
                            <option value="YEARLY">Yearly</option>
                            <option value="DAILY">Daily</option>
                            <option value="NONE">None</option>
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Assigned Members / Visible to Group Members</label>
                        <div>
                            {usersOptions.length > 0 ? (
                                <div className={styles.usersBox}>
                                    {usersOptions.map(u => {
                                        const uid = u._id || u.id;
                                        const isSelected = userIds.includes(uid);
                                        return (
                                            <label key={uid} className={clsx(styles.userLabel, isSelected && styles.selected)}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setUserIds([...userIds, uid]);
                                                        else setUserIds(userIds.filter(id => id !== uid));
                                                    }}
                                                />
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {u.fullName || u.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>Loading users...</div>
                            )}
                        </div>
                        <p className={styles.helpText}>Shared group tasks are visible to all mapped members (one task, not duplicated per user).</p>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Visibility</label>
                        <select className={styles.select} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                            <option value="COMPANY">Company (Everyone)</option>
                            <option value="TEAM">Team (Only members)</option>
                            <option value="PRIVATE">Private (Only you)</option>
                        </select>
                    </div>

                    <div className={styles.field} style={{ marginTop: 8 }}>
                        <label className={styles.label}>Hub options</label>
                        {toggleRow('Show in Task Hub', showInTaskHub, setShowInTaskHub)}
                        {toggleRow('⭐ Highlight this Group on Dashboard', isHighlighted, setIsHighlighted, 'Highlighted groups appear in the quick-access area for selected group members.')}
                        {isHighlighted && (
                            <div style={{ margin: '8px 0 12px', padding: 12, border: '1px solid #dbeafe', borderRadius: 10, background: '#eff6ff' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>Live preview</div>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{name || 'Group name'}</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>Recurring · {recurrenceType.charAt(0) + recurrenceType.slice(1).toLowerCase()}</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>⭐ · Accent: {highlightStyle}</div>
                                <select className={styles.select} style={{ marginTop: 8 }} value={highlightStyle} onChange={(e) => setHighlightStyle(e.target.value)}>
                                    {['blue', 'teal', 'indigo', 'amber', 'rose', 'violet', 'emerald', 'slate'].map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {toggleRow('Show Group Tasks in General Date-Wise Lists', showInGeneralTaskLists, setShowInGeneralTaskLists, 'Default OFF — group tasks stay out of Today / Upcoming / Overdue until this group is opened.')}
                        {toggleRow('Notify All Group Members', notifyAllMembers, setNotifyAllMembers)}
                        {toggleRow('Allow Group Members to Update Tasks', allowMembersUpdate, setAllowMembersUpdate)}
                        {toggleRow('Active', isActive, setIsActive)}
                    </div>
                </>
            ) : (
                <div className={styles.field}>
                    <label className={styles.label}>Sample / template tasks</label>
                    <p className={styles.helpText}>Prepare recurring task titles for this group (e.g. Prepare Sales Register). Generation still uses the existing recurrence engine.</p>
                    {sampleTasks.map((row, idx) => (
                        <div key={row._id || idx} style={{ display: 'grid', gap: 6, marginBottom: 10, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <input
                                className={styles.input}
                                placeholder="Task title"
                                value={row.title || ''}
                                onChange={(e) => {
                                    const next = [...sampleTasks];
                                    next[idx] = { ...next[idx], title: e.target.value };
                                    setSampleTasks(next);
                                }}
                            />
                            <input
                                className={styles.input}
                                placeholder="Due-day rule (e.g. 10, LWD, BEFORE_11)"
                                value={row.dueDayRule || ''}
                                onChange={(e) => {
                                    const next = [...sampleTasks];
                                    next[idx] = { ...next[idx], dueDayRule: e.target.value };
                                    setSampleTasks(next);
                                }}
                            />
                            <select
                                className={styles.select}
                                value={row.priority || 'MEDIUM'}
                                onChange={(e) => {
                                    const next = [...sampleTasks];
                                    next[idx] = { ...next[idx], priority: e.target.value };
                                    setSampleTasks(next);
                                }}
                            >
                                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <button
                                type="button"
                                onClick={() => setSampleTasks(sampleTasks.filter((_, i) => i !== idx))}
                                style={{ justifySelf: 'start', border: 'none', background: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSampleTasks([...sampleTasks, { title: '', dueDayRule: '10', priority: 'MEDIUM', recurrenceType }])}
                    >
                        + Add sample task
                    </Button>
                </div>
            )}

            <div className={styles.modalFooter}>
                <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : (initialData ? 'Update Group' : 'Create Group')}
                </Button>
            </div>
        </form>
    );
};
