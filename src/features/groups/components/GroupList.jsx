import React, { useState, useEffect } from 'react';
import { getGroups, createGroup, deleteGroup } from '@/services/groupApi'; // Absolute import
import { Button, Input, useModal } from '@/components/ui'; // Assuming these exist
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

export const GroupList = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();
    const { openModal, closeModal } = useModal();

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const data = await getGroups();
            // Handle array directly or if wrapped
            setGroups(Array.isArray(data) ? data : (data.results || []));
        } catch (error) {
            toast.error('Failed to load groups');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = () => {
        const modalId = openModal(
            CreateGroupForm,
            {
                title: 'Create Group',
                onSuccess: () => { closeModal(modalId); fetchGroups(); }
            }
        );
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this group?')) return;
        try {
            await deleteGroup(id);
            toast.success('Group deleted');
            fetchGroups();
        } catch (error) {
            toast.error('Failed to delete group');
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Groups & Projects</h1>
                {user?.role === 'admin' && (
                    <Button onClick={handleCreateGroup}>Create Group</Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                    <div key={group._id} className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(PATHS.GROUPS.DETAILS(group._id))}>
                        <h3 className="text-lg font-semibold">{group.name}</h3>
                        {group.code && <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-600">{group.code}</span>}
                        <p className="text-gray-500 mt-2 truncate">{group.description || 'No description'}</p>
                        <div className="mt-4 text-xs text-gray-400">
                            Created: {new Date(group.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
                {groups.length === 0 && (
                    <div className="col-span-full text-center text-gray-500 py-10">
                        No groups found. {user?.role === 'admin' ? 'Create one to get started.' : ''}
                    </div>
                )}
            </div>
        </div>
    );
};

// Simple internal form component for Modal
const CreateGroupForm = ({ onSuccess }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return toast.error('Name is required');

        try {
            setSubmitting(true);
            await createGroup({ name, code, description });
            toast.success('Group created!');
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create group');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing Dept" required />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Code</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BILL" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                    className="w-full border rounded p-2"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows="3"
                />
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <Button type="submit" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Group'}
                </Button>
            </div>
        </form>
    );
};
