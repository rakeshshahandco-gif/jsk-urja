import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import { Plus, Edit2, Trash2, Wallet, Landmark } from 'lucide-react';
import { getCashBankAccounts, createCashBankAccount, updateCashBankAccount } from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import styles from './CashBankMasterPage.module.scss';
import clsx from 'clsx';

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
            <div className={styles.formContainer}>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Account Name *</label>
                        <Input
                            name="accountName"
                            value={formData.accountName}
                            onChange={handleChange}
                            placeholder="e.g. HDFC Bank Main"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Account Type *</label>
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
                    <div className={styles.bankDetailsBox}>
                        <div className={styles.bankDetailsHeader}>Bank Details</div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Bank Name</label>
                            <Input name="bankName" value={formData.bankName} onChange={handleChange} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Account Number</label>
                            <Input name="accountNumber" value={formData.accountNumber} onChange={handleChange} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Branch</label>
                            <Input name="branchName" value={formData.branchName} onChange={handleChange} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>IFSC Code</label>
                            <Input name="ifscCode" value={formData.ifscCode} onChange={handleChange} />
                        </div>
                    </div>
                )}

                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Opening Balance</label>
                        <Input
                            type="number"
                            name="openingBalance"
                            value={formData.openingBalance}
                            onChange={handleChange}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Status</label>
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

                <div className={styles.formActions}>
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
        <div className={styles.pageContainer}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Cash / Bank Master</h1>
                    <p className={styles.subtitle}>Manage all your cash and bank accounts</p>
                </div>
                <Button onClick={handleAdd} className={styles.addButton}>
                    <Plus className="w-4 h-4" /> Add New Account
                </Button>
            </div>

            <div className={styles.grid}>
                {accounts.map(acc => (
                    <div key={acc._id} className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={clsx(styles.iconWrapper, acc.accountType === 'Cash' ? styles.cash : styles.bank)}>
                                {acc.accountType === 'Cash' ? <Wallet className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
                            </div>
                            <div className={styles.actionButtons}>
                                <button className={styles.iconButton} onClick={() => handleEdit(acc)}>
                                    <Edit2 />
                                </button>
                            </div>
                        </div>
                        
                        <div className={styles.cardBody}>
                            <h3 className={styles.accountName}>{acc.accountName}</h3>
                            <p className={styles.accountType}>{acc.accountType}</p>
                        </div>
                        
                        <div className={styles.cardFooter}>
                            <div>
                                <p className={styles.balanceLabel}>Current Balance</p>
                                <p className={styles.balanceAmount}>₹{(acc.currentBalance || 0).toLocaleString()}</p>
                            </div>
                            <span className={clsx(styles.statusBadge, acc.status === 'Active' ? styles.active : styles.inactive)}>
                                {acc.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {accounts.length === 0 && !loading && (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIconWrapper}>
                        <Wallet className="w-8 h-8" />
                    </div>
                    <h3 className={styles.emptyTitle}>No accounts found</h3>
                    <p className={styles.emptyText}>Get started by creating your first cash or bank account.</p>
                    <Button variant="outline" className={styles.emptyButton} onClick={handleAdd}>Add New Account</Button>
                </div>
            )}
        </div>
    );
};

export default CashBankMasterPage;
