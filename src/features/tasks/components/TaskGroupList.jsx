import React, { useState, useEffect } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { getTaskGroups, createTaskGroup, deleteTaskGroup, updateTaskGroup } from '@/services/taskApi';
import { Button, Input, useModal, Select, MultiSelect } from '@/components/ui';
import { userService } from '@/services/user.service';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

import { Users, Search, Plus, Edit2, Trash2 } from 'lucide-react';

const s = {
    pageBg: { padding: '20px 24px', background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' },
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 20, fontWeight: 700, margin: 0 },
    subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
    btnPrimary: {
        height: 32, padding: '0 16px', fontSize: 12, fontWeight: 600,
        backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
    },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
    card: {
        background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16,
        display: 'flex', flexDirection: 'column', position: 'relative', transition: 'all 0.2s'
    },
    cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4, paddingRight: 60 },
    cardNotes: { fontSize: 12, color: '#94a3b8', lineHeight: 1.4, flex: 1, minHeight: 34 },
    actionRow: { position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 },
    iconBtn: (danger) => ({
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
        color: danger ? '#ef4444' : '#94a3b8', display: 'flex', alignItems: 'center'
    }),
    memberSect: { marginTop: 16, paddingTop: 16, borderTop: '1px solid #334155' },
    memberTitle: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: 8 },
    memberPills: { display: 'flex', flexWrap: 'wrap', gap: 6 },
    pill: { background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: 10, padding: '2px 8px', borderRadius: 12 },
    footer: { marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }
};

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
    useAutoRefresh(fetchGroups);

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

    if (loading) return <div style={{ padding: 20, color: '#94a3b8' }}>Loading...</div>;

    return (
        <div style={s.pageBg}>
            <div style={s.headerRow}>
                <div>
                    <h1 style={s.title}>Task Groups</h1>
                    <p style={s.subtitle}>Create and manage dedicated groups for instant task assignments.</p>
                </div>
                <button style={s.btnPrimary} onClick={handleCreate}>
                    <Plus size={14} /> New Group
                </button>
            </div>

            <div style={s.grid}>
                {groups.map((group) => (
                    <div key={group._id} style={s.card} className="task-group-card">
                        {group.name !== 'General' && (
                            <div style={s.actionRow}>
                                <button style={s.iconBtn(false)} onClick={() => handleEdit(group)} title="Edit Group"><Edit2 size={13} /></button>
                                <button style={s.iconBtn(true)} onClick={() => handleDelete(group._id)} title="Delete Group"><Trash2 size={13} /></button>
                            </div>
                        )}
                        <h3 style={s.cardTitle}>{group.name}</h3>
                        <p style={s.cardNotes}>{group.notes || 'No notes provided.'}</p>

                        <div style={s.memberSect}>
                            <p style={s.memberTitle}><Users size={10} style={{ display: 'inline', marginRight: 4 }} /> MEMBERS ({group.userIds?.length || 0})</p>
                            <div style={s.memberPills}>
                                {group.userIds?.slice(0, 5).map(u => (
                                    <span key={u._id} style={s.pill}>{u.name || (u.firstName ? u.firstName + ' ' + u.lastName : u.email)}</span>
                                ))}
                                {group.userIds?.length > 5 && <span style={s.pill}>+{group.userIds.length - 5} more</span>}
                                {(!group.userIds || group.userIds.length === 0) && <span style={{ ...s.pill, borderStyle: 'dashed', color: '#64748b' }}>No members assigned</span>}
                            </div>
                        </div>

                        <div style={s.footer}>
                            <span>Visibility: {group.visibility}</span>
                            <span>Created: {new Date(group.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>
            {groups.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 20px', border: '1px dashed #334155', borderRadius: 10 }}>
                    No task groups found. Create one to easily assign tasks to multiple people!
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

    const ms = {
        form: { display: 'flex', flexDirection: 'column', gap: 16, width: 400 },
        field: { display: 'flex', flexDirection: 'column', gap: 6 },
        label: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
        input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 13, outline: 'none' },
        usersBox: { border: '1px solid #334155', borderRadius: 6, background: '#0f172a', padding: 8, maxHeight: 160, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
        userLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer', padding: 4, borderRadius: 4 },
        helpText: { fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 4 },
        footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #334155' },
        btnCancel: { padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
        btnSave: { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
    };

    return (
        <form onSubmit={handleSubmit} style={ms.form}>
            <div style={ms.field}>
                <label style={ms.label}>Group Name *</label>
                <input style={ms.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance Team" autoFocus required />
            </div>
            <div style={ms.field}>
                <label style={ms.label}>Notes / Description</label>
                <textarea
                    style={{ ...ms.input, resize: 'vertical', minHeight: 60 }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows="2"
                    placeholder="Optional details..."
                />
            </div>
            <div style={ms.field}>
                <label style={ms.label}>Group Members</label>
                <div>
                    {usersOptions.length > 0 ? (
                        <div style={ms.usersBox}>
                            {usersOptions.map(u => {
                                const uid = u._id || u.id;
                                const isSelected = userIds.includes(uid);
                                return (
                                    <label key={uid} style={{ ...ms.userLabel, background: isSelected ? 'rgba(37,99,235,0.1)' : 'transparent' }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) setUserIds([...userIds, uid]);
                                                else setUserIds(userIds.filter(id => id !== uid));
                                            }}
                                            style={{ accentColor: '#2563eb' }}
                                        />
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullName || u.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>Loading users...</div>
                    )}
                </div>
                <p style={ms.helpText}>When you assign a task to this group, all selected users will be assigned.</p>
            </div>
            <div style={ms.field}>
                <label style={ms.label}>Visibility</label>
                <select style={ms.input} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="COMPANY">Company (Everyone sees this group option)</option>
                    <option value="TEAM">Team (Only members see this group option)</option>
                    <option value="PRIVATE">Private (Only you see this group option)</option>
                </select>
            </div>
            <div style={ms.footer}>
                <button type="button" style={ms.btnCancel} onClick={onCancel} disabled={submitting}>Cancel</button>
                <button type="submit" style={ms.btnSave} disabled={submitting}>
                    {submitting ? 'Saving...' : (initialData ? 'Update Group' : 'Create Group')}
                </button>
            </div>
        </form>
    );
};
