import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal
} from '@/components/ui';
import { Plus, BookOpen, CreditCard, Landmark, Contact, ShieldCheck, MapPin } from 'lucide-react';
import { getAccountGroups, getLedgers, createLedger } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const LedgerMasterPage = () => {
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const { openModal, closeModal } = useModal();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [gData, lData] = await Promise.all([getAccountGroups(), getLedgers()]);
            setGroups(gData);
            setLedgers(lData);
        } catch (error) {
            toast.error('Failed to fetch ledger data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSave = async (data) => {
        try {
            await createLedger(data);
            toast.success('Ledger created successfully');
            fetchData();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create ledger');
        }
    };

    const LedgerForm = () => {
        const [formData, setFormData] = useState({
            name: '',
            printName: '',
            alias: '',
            underGroup: '',
            openingBalance: 0,
            drCr: 'Dr',
            isBillWise: false,
            creditPeriod: 0,
            gstApplicable: false,
            gstin: '',
            pan: '',
            registrationType: 'Regular',
            mobile: '',
            email: '',
            address: '',
            city: '',
            state: '',
            pincode: '',
            bankName: '',
            accountNo: '',
            ifsc: ''
        });

        const handleChange = (e) => {
            const { name, value, type, checked } = e.target;
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        };

        return (
            <div className="space-y-6 pt-4 max-h-[70vh] overflow-y-auto px-1">
                {/* Basic Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2 border-b pb-1 uppercase tracking-wider">
                        <BookOpen className="w-4 h-4" /> Basic Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Ledger Name *</label>
                            <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. ABC Trading Co." />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Under Group *</label>
                            <Select
                                name="underGroup"
                                value={formData.underGroup}
                                onChange={handleChange}
                                options={groups.map(g => ({ label: g.name, value: g._id }))}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Print Name</label>
                            <Input name="printName" value={formData.printName || formData.name} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Alias</label>
                            <Input name="alias" value={formData.alias} onChange={handleChange} />
                        </div>
                    </div>
                </div>

                {/* Balances & Behaviour */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2 border-b pb-1 uppercase tracking-wider">
                        <CreditCard className="w-4 h-4" /> Balances & Behaviour
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Opening Balance</label>
                            <Input type="number" name="openingBalance" value={formData.openingBalance} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Dr / Cr</label>
                            <Select
                                name="drCr"
                                value={formData.drCr}
                                onChange={handleChange}
                                options={[{ label: 'Dr', value: 'Dr' }, { label: 'Cr', value: 'Cr' }]}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Credit Period (Days)</label>
                            <Input type="number" name="creditPeriod" value={formData.creditPeriod} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="isBillWise" checked={formData.isBillWise} onChange={handleChange} />
                            Maintain Bill-wise?
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="gstApplicable" checked={formData.gstApplicable} onChange={handleChange} />
                            GST Applicable?
                        </label>
                    </div>
                </div>

                {/* Statutory Details */}
                {formData.gstApplicable && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-primary flex items-center gap-2 border-b pb-1 uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4" /> Statutory (GST / PAN)
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">GSTIN</label>
                                <Input name="gstin" value={formData.gstin} onChange={handleChange} placeholder="22AAAAA0000A1Z5" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">PAN</label>
                                <Input name="pan" value={formData.pan} onChange={handleChange} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Registration Type</label>
                                <Select
                                    name="registrationType"
                                    value={formData.registrationType}
                                    onChange={handleChange}
                                    options={['Regular', 'Composition', 'Unregistered', 'Consumer'].map(v => ({ label: v, value: v }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Contact & Address */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2 border-b pb-1 uppercase tracking-wider">
                        <MapPin className="w-4 h-4" /> Address & Contact
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Mobile</label>
                            <Input name="mobile" value={formData.mobile} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input type="email" name="email" value={formData.email} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Address</label>
                        <Input name="address" value={formData.address} onChange={handleChange} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <Input name="city" value={formData.city} onChange={handleChange} placeholder="City" />
                        <Input name="state" value={formData.state} onChange={handleChange} placeholder="State" />
                        <Input name="pincode" value={formData.pincode} onChange={handleChange} placeholder="Pincode" />
                    </div>
                </div>

                {/* Banking Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2 border-b pb-1 uppercase tracking-wider">
                        <Landmark className="w-4 h-4" /> Bank Details
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                        <Input name="bankName" value={formData.bankName} onChange={handleChange} placeholder="Bank Name" />
                        <Input name="accountNo" value={formData.accountNo} onChange={handleChange} placeholder="Account No" />
                        <Input name="ifsc" value={formData.ifsc} onChange={handleChange} placeholder="IFSC Code" />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 sticky bottom-0 bg-white pb-4 border-t mt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={() => handleSave(formData)}>Save Ledger</Button>
                </div>
            </div>
        );
    };

    const handleAdd = () => {
        openModal({
            title: 'Create Ledger Master',
            content: <LedgerForm />,
            size: 'lg'
        });
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Ledger Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage accounts, customers, suppliers, and tax ledgers</p>
                </div>
                <Button onClick={handleAdd} className="flex items-center gap-2 shadow-sm">
                    <Plus className="w-4 h-4" /> Create Ledger
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ledger Name</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Under Group</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Balance</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">GSTIN</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {ledgers.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                    No ledgers found.
                                </td>
                            </tr>
                        ) : (
                            ledgers.map(l => (
                                <tr key={l._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 rounded-md text-indigo-600">
                                                <BookOpen className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{l.name}</div>
                                                {l.alias && <div className="text-[10px] text-gray-400">Alias: {l.alias}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-medium text-gray-700">{l.underGroup?.name}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className={`font-bold ${l.currentBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                            ₹{Math.abs(l.currentBalance).toLocaleString()} {l.drCr}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-mono text-gray-500 uppercase">
                                        {l.gstin || '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${l.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {l.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LedgerMasterPage;
