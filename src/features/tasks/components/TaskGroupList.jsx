import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { getTaskGroups, createTaskGroup, deleteTaskGroup, updateTaskGroup } from '@/services/taskApi';
import { Button, Input, useModal, Select, MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

import { Users, Search, Plus, Edit2, Trash2 } from 'lucide-react';

import styles from './TaskGroupList.module.scss';
import clsx from 'clsx';

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

    if (loading) return <div className={styles.container}><div style={{ color: '#94a3b8' }}>Loading...</div></div>;

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

            <div className={styles.grid}>
                {groups.map((group) => (
                    <div key={group._id} className={styles.card}>
                        {group.name !== 'General' && (
                            <div className={styles.actionRow}>
                                <button className={styles.iconBtn} onClick={() => handleEdit(group)} title="Edit Group">
                                    <Edit2 size={13} />
                                </button>
                                <button className={clsx(styles.iconBtn, styles.danger)} onClick={() => handleDelete(group._id)} title="Delete Group">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        )}
                        <h3 className={styles.cardTitle}>{group.name}</h3>
                        <p className={styles.cardNotes}>{group.notes || 'No notes provided.'}</p>

                        <div className={styles.memberSect}>
                            <p className={styles.memberTitle}>
                                <Users size={12} /> MEMBERS ({group.userIds?.length || 0})
                            </p>
                            <div className={styles.memberPills}>
                                {group.userIds?.slice(0, 5).map(u => (
                                    <span key={u._id} className={styles.pill}>
                                        {u.name || (u.firstName ? u.firstName + ' ' + u.lastName : u.email)}
                                    </span>
                                ))}
                                {group.userIds?.length > 5 && <span className={styles.pill}>+{group.userIds.length - 5} more</span>}
                                {(!group.userIds || group.userIds.length === 0) && (
                                    <span className={styles.noMembers}>No members assigned</span>
                                )}
                            </div>
                        </div>

                        <div className={styles.footer}>
                            <span>Visibility: {group.visibility}</span>
                            <span>Created: {new Date(group.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
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
    const [name, setName] = useState(initialData?.name || '');
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [visibility, setVisibility] = useState(initialData?.visibility || 'COMPANY');
    const [userIds, setUserIds] = useState(initialData?.userIds?.map(u => u._id || u) || []);

    const [usersOptions, setUsersOptions] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        userService.getAssignableUsers().then(users => {
            setUsersOptions(Array.isArray(users) ? users : (users?.data || []));
        });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return toast.error('Group name is required');

        try {
            setSubmitting(true);
            const payload = { name, notes, visibility, userIds };

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

    return (
        <form onSubmit={handleSubmit} className={styles.modalForm}>
            <div className={styles.field}>
                <label className={styles.label}>Group Name *</label>
                <input 
                    className={styles.input} 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="e.g. Finance Team" 
                    autoFocus 
                    required 
                />
            </div>
            <div className={styles.field}>
                <label className={styles.label}>Notes / Description</label>
                <textarea
                    className={styles.textarea}
                    style={{ minHeight: 80 }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows="3"
                    placeholder="Optional details..."
                />
            </div>
            <div className={styles.field}>
                <label className={styles.label}>Group Members</label>
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
                <p className={styles.helpText}>When you assign a task to this group, all selected users will be assigned.</p>
            </div>
            <div className={styles.field}>
                <label className={styles.label}>Visibility</label>
                <select className={styles.select} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="COMPANY">Company (Everyone)</option>
                    <option value="TEAM">Team (Only members)</option>
                    <option value="PRIVATE">Private (Only you)</option>
                </select>
            </div>
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
