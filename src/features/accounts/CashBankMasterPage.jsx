import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Edit2, Trash2, Wallet, Landmark } from 'lucide-react';
import { getCashBankAccounts, createCashBankAccount, updateCashBankAccount } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const CashBankMasterPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const { openModal, closeModal } = useModal();

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const data = await getCashBankAccounts();
            setAccounts(data);
        } catch (error) {
            toast.error('Failed to fetch accounts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const handleSave = async (data, id = null) => {
        try {
            if (id) {
                await updateCashBankAccount(id, data);
                toast.success('Account updated');
            } else {
                await createCashBankAccount(data);
                toast.success('Account created');
            }
            fetchAccounts();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save account');
        }
    };

    const AccountForm = ({ initialData = {}, id = null }) => {
        const [formData, setFormData] = useState({
            accountName: '',
            accountType: 'Cash',
            bankName: '',
            branchName: '',
            accountNumber: '',
            ifscCode: '',
            openingBalance: 0,
            status: 'Active',
            ...initialData
        });

        const handleChange = (e) => {
            const { name, value } = e.target;
            setFormData(prev => ({ ...prev, [name]: value }));
        };

        return (
            <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Account Name *</label>
                        <Input
                            name="accountName"
                            value={formData.accountName}
                            onChange={handleChange}
                            placeholder="e.g. HDFC Bank Main"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Account Type *</label>
                        <Select
                            name="accountType"
                            value={formData.accountType}
                            onChange={handleChange}
                            options={[
                                { label: 'Cash', value: 'Cash' },
                                { label: 'Bank', value: 'Bank' }
                            ]}
                        />
                    </div>
                </div>

                {formData.accountType === 'Bank' && (
                    <div className="grid grid-cols-2 gap-4 border p-3 rounded-lg bg-gray-50">
                        <div className="space-y-2 col-span-2 font-semibold text-xs uppercase text-gray-500">Bank Details</div>
                        <div className="space-y-2">
                            <label className="text-sm">Bank Name</label>
                            <Input name="bankName" value={formData.bankName} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm">Account Number</label>
                            <Input name="accountNumber" value={formData.accountNumber} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm">Branch</label>
                            <Input name="branchName" value={formData.branchName} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm">IFSC Code</label>
                            <Input name="ifscCode" value={formData.ifscCode} onChange={handleChange} />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Opening Balance</label>
                        <Input
                            type="number"
                            name="openingBalance"
                            value={formData.openingBalance}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Status</label>
                        <Select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            options={[
                                { label: 'Active', value: 'Active' },
                                { label: 'Inactive', value: 'Inactive' }
                            ]}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={() => handleSave(formData, id)}>Save Account</Button>
                </div>
            </div>
        );
    };

    const handleAdd = () => {
        openModal({
            title: 'Add Cash/Bank Account',
            content: <AccountForm />
        });
    };

    const handleEdit = (acc) => {
        openModal({
            title: 'Edit Account',
            content: <AccountForm initialData={acc} id={acc._id} />
        });
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Cash / Bank Master</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage all your cash and bank accounts</p>
                </div>
                <Button onClick={handleAdd} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add New Account
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {accounts.map(acc => (
                    <div key={acc._id} className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-md transition-shadow border-l-4 border-l-primary/10">
                        <div className="flex justify-between items-start">
                            <div className={`p-2 rounded-lg ${acc.accountType === 'Cash' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                {acc.accountType === 'Cash' ? <Wallet className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
                            </div>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(acc)}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <h3 className="font-bold text-lg text-gray-800">{acc.accountName}</h3>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{acc.accountType}</p>
                        </div>
                        <div className="mt-6 flex justify-between items-end">
                            <div>
                                <p className="text-xs text-gray-400">Current Balance</p>
                                <p className="font-bold text-xl text-primary">₹{acc.currentBalance.toLocaleString()}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${acc.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {acc.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {accounts.length === 0 && !loading && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <div className="bg-gray-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet className="w-8 h-8 text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No accounts found</h3>
                    <p className="text-gray-500 mt-1">Get started by creating your first cash or bank account.</p>
                    <Button variant="outline" className="mt-6" onClick={handleAdd}>Add New Account</Button>
                </div>
            )}
        </div>
    );
};

export default CashBankMasterPage;
