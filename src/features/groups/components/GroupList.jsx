import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
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

    useGlobalSync('group', (payload) => {
        if (payload.action === 'create') setGroups(prev => [...prev, payload.data]);
        else if (payload.action === 'update') setGroups(prev => prev.map(g => g._id === payload.recordId ? { ...g, ...payload.data } : g));
        else if (payload.action === 'delete') setGroups(prev => prev.filter(g => g._id !== payload.recordId));
    });

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
        <div className="p-6 bg-[#0f172a] min-h-screen text-[#f1f5f9]">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-[#f1f5f9]">Groups & Projects</h1>
                <Button onClick={handleCreateGroup}>Create Group</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                    <div key={group._id} className="bg-[#1e293b] border border-[#334155] p-5 rounded-xl shadow-lg hover:shadow-xl hover:bg-[#0f172a] transition-all cursor-pointer" onClick={() => navigate(PATHS.GROUPS.DETAILS(group._id))}>
                        <h3 className="text-lg font-semibold text-[#f1f5f9]">{group.name}</h3>
                        {group.code && <span className="text-xs bg-[#0f172a] border border-[#334155] px-2 py-1 rounded text-[#94a3b8]">{group.code}</span>}
                        <p className="text-[#94a3b8] mt-2 truncate text-sm">{group.description || 'No description'}</p>
                        <div className="mt-4 text-xs text-[#64748b] bg-[#0f172a] p-2 rounded-lg border border-[#334155] inline-block">
                            Created: {new Date(group.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
                {groups.length === 0 && (
                    <div className="col-span-full text-center text-[#94a3b8] py-10 border border-[#334155] border-dashed rounded-xl bg-[#1e293b]">
                        No groups found. Create one to get started.
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
                <label className="block text-sm font-medium mb-1 text-[#94a3b8]">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing Dept" required className="bg-[#0f172a] border-[#334155] text-[#f1f5f9]" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1 text-[#94a3b8]">Code</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BILL" className="bg-[#0f172a] border-[#334155] text-[#f1f5f9]" />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1 text-[#94a3b8]">Description</label>
                <textarea
                    className="w-full border border-[#334155] rounded-md p-2 bg-[#0f172a] text-[#f1f5f9] focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
