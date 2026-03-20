import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal
} from '@/components/ui';
import { Plus, FolderTree, Database, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { getAccountGroups, createAccountGroup, initializeAccounts } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const GroupMasterPage = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const { openModal, closeModal } = useModal();

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const data = await getAccountGroups();
            setGroups(data);
        } catch (error) {
            toast.error('Failed to fetch groups');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    const handleInitialize = async () => {
        if (!window.confirm('This will create all default Tally-style groups and ledgers. Continue?')) return;
        setLoading(true);
        try {
            await initializeAccounts();
            toast.success('Accounting masters initialized');
            fetchGroups();
        } catch (error) {
            toast.error('Initialization failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (data) => {
        try {
            await createAccountGroup(data);
            toast.success('Group created');
            fetchGroups();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create group');
        }
    };

    const GroupForm = () => {
        const [formData, setFormData] = useState({
            name: '',
            parentGroup: '',
            nature: 'Assets',
            affectGrossProfit: false,
            sortOrder: 0
        });

        const handleChange = (e) => {
            const { name, value, type, checked } = e.target;
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        };

        return (
            <div className="space-y-4 pt-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Group Name *</label>
                    <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Indirect Expenses" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Under Group (Parent)</label>
                        <Select
                            name="parentGroup"
                            value={formData.parentGroup}
                            onChange={handleChange}
                            options={[
                                { label: 'Primary (No Parent)', value: '' },
                                ...groups.map(g => ({ label: g.name, value: g._id }))
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nature *</label>
                        <Select
                            name="nature"
                            value={formData.nature}
                            onChange={handleChange}
                            options={[
                                { label: 'Assets', value: 'Assets' },
                                { label: 'Liabilities', value: 'Liabilities' },
                                { label: 'Income', value: 'Income' },
                                { label: 'Expenses', value: 'Expenses' }
                            ]}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input type="checkbox" name="affectGrossProfit" checked={formData.affectGrossProfit} onChange={handleChange} />
                    <label className="text-sm">Does it affect Gross Profit?</label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={() => handleSave(formData)}>Create Group</Button>
                </div>
            </div>
        );
    };

    const handleAdd = () => {
        openModal({
            title: 'Add Account Group',
            content: <GroupForm />
        });
    };

    // Simple recursive rendering for hierarchy
    const renderGroupRow = (group, depth = 0) => {
        return (
            <tr key={group._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                    <div className="flex items-center gap-3" style={{ paddingLeft: `${depth * 20}px` }}>
                        <FolderTree className={`w-4 h-4 ${depth === 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`${depth === 0 ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{group.name}</span>
                    </div>
                </td>
                <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded font-medium ${
                        group.nature === 'Assets' ? 'bg-blue-100 text-blue-700' :
                        group.nature === 'Liabilities' ? 'bg-red-100 text-red-700' :
                        group.nature === 'Income' ? 'bg-green-100 text-green-700' :
                        'bg-orange-100 text-orange-700'
                    }`}>
                        {group.nature}
                    </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                    {group.parentGroup?.name || 'Primary'}
                </td>
                <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {group.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
            </tr>
        );
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Account Groups (Masters)</h1>
                    <p className="text-gray-500 text-sm mt-1">Hierarchical structure for Chart of Accounts</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleInitialize} className="flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Initialize Defaults
                    </Button>
                    <Button onClick={handleAdd} className="flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Add Group
                    </Button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Group Name</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nature</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent Group</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {groups.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="px-6 py-10 text-center text-gray-500">
                                    No groups found. Please initialize default masters.
                                </td>
                            </tr>
                        ) : (
                            groups.map(g => renderGroupRow(g))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GroupMasterPage;
