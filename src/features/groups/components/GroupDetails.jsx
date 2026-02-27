import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // Fixed import (was router-dom)
import { getGroup, addMember, removeMember } from '@/services/groupApi';
import { userService } from '@/services/user.service';
import { Button, Input, Select } from '@/components/ui'; // Assuming Select exists
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Trash2, UserPlus, ArrowLeft } from 'lucide-react';
import { PATHS } from '@/routes/paths';

export const GroupDetails = () => {
    const { id } = useParams(); // Group ID
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();

    // State
    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedRole, setSelectedRole] = useState('MEMBER');

    useEffect(() => {
        loadGroupData();
        loadAllUsers();
    }, [id]);

    const loadGroupData = async () => {
        try {
            setLoading(true);
            const data = await getGroup(id);
            // API returns { group, members }
            setGroup(data.group);
            setMembers(data.members || []);
        } catch (error) {
            toast.error('Failed to load group details');
            navigate('/groups');
        } finally {
            setLoading(false);
        }
    };

    const loadAllUsers = async () => {
        try {
            const data = await userService.getAllUsers();
            setAllUsers(data.data || data.results || (Array.isArray(data) ? data : []));
        } catch (error) {
            console.error(error);
        }
    };

    // Add Member
    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!selectedUser) return toast.error('Select a user');

        try {
            await addMember(id, { userId: selectedUser, role: selectedRole });
            toast.success('Member added');
            setSelectedUser('');
            loadGroupData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add member');
        }
    };

    // Remove Member
    const handleRemoveMember = async (userId) => {
        if (!window.confirm('Remove this member?')) return;
        try {
            await removeMember(id, userId);
            toast.success('Member removed');
            loadGroupData();
        } catch (error) {
            toast.error('Failed to remove member');
        }
    };

    if (loading) return <div className="p-6">Loading...</div>;
    if (!group) return <div className="p-6">Group not found</div>;

    // Admin check removed, all users can manage members

    return (
        <div className="p-6 bg-[#0f172a] min-h-screen text-[#f1f5f9]">
            <Button variant="ghost" className="mb-4 pl-0 text-[#94a3b8] hover:text-[#f1f5f9]" onClick={() => navigate(PATHS.GROUPS.ROOT)}>
                <ArrowLeft size={16} className="mr-2" /> Back to Groups
            </Button>

            <div className="bg-[#1e293b] border border-[#334155] p-6 rounded-xl shadow-lg mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-[#f1f5f9]">
                            {group.name}
                            {group.code && <span className="bg-[#0f172a] border border-[#334155] text-sm px-2 py-1 rounded text-[#94a3b8]">{group.code}</span>}
                        </h1>
                        <p className="text-[#94a3b8] mt-1">{group.description}</p>
                    </div>
                    <div className="text-right text-sm font-semibold">
                        {/* Status badge etc */}
                        {group.isActive ? <span className="text-green-500">Active</span> : <span className="text-red-500">Inactive</span>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Members List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold text-[#f1f5f9]">Members ({members.length})</h2>
                    <div className="bg-[#1e293b] border border-[#334155] rounded-xl shadow overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#0f172a] text-[#94a3b8] font-medium border-b border-[#334155]">
                                <tr>
                                    <th className="p-3">Name</th>
                                    <th className="p-3">Email</th>
                                    <th className="p-3">Role</th>
                                    <th className="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m._id} className="border-b border-[#334155] last:border-0 hover:bg-[#334155] transition-colors">
                                        <td className="p-3 font-medium text-[#f1f5f9]">{m.user?.name}</td>
                                        <td className="p-3 text-[#94a3b8]">{m.user?.email}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${m.role === 'OWNER' ? 'bg-[#2e1065] text-[#d8b4fe] border-[#6b21a8]' : 'bg-[#1e3a8a] text-[#93c5fd] border-[#1e40af]'}`}>
                                                {m.role}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => handleRemoveMember(m.user?._id)} className="text-[#fca5a5] hover:bg-[#450a0a] hover:text-[#ef4444] p-1 rounded transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {members.length === 0 && (
                                    <tr><td colSpan="4" className="p-4 text-center text-[#94a3b8] italic">No members yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add Member Form */}
                <div>
                    <div className="bg-[#1e293b] border border-[#334155] p-5 rounded-xl shadow-lg">
                        <h3 className="font-semibold mb-4 flex items-center gap-2 text-[#f1f5f9]">
                            <UserPlus size={18} /> Add Member
                        </h3>
                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-[#94a3b8]">User</label>
                                <select
                                    className="w-full border border-[#334155] rounded-md p-2 bg-[#0f172a] text-[#f1f5f9] focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={selectedUser}
                                    onChange={(e) => setSelectedUser(e.target.value)}
                                    required
                                >
                                    <option value="">Select a user...</option>
                                    {allUsers
                                        .filter(u => !members.some(m => m.user?._id === u._id)) // Filter out existing members
                                        .map(u => (
                                            <option key={u._id} value={u._id}>{u.name}</option>
                                        ))
                                    }
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-[#94a3b8]">Role</label>
                                <select
                                    className="w-full border border-[#334155] rounded-md p-2 bg-[#0f172a] text-[#f1f5f9] focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                >
                                    <option value="MEMBER">Member</option>
                                    <option value="OWNER">Owner</option>
                                </select>
                            </div>
                            <Button type="submit" className="w-full">Add to Group</Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
