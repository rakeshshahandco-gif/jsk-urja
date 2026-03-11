import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal
} from '@/components/ui';
import { Plus, Edit2, Trash2, FileText, Hash } from 'lucide-react';
import { getVoucherTypes, createVoucherType } from '@/services/accountApi';
import { toast } from 'react-hot-toast';

const VoucherTypeMasterPage = () => {
    const [voucherTypes, setVoucherTypes] = useState([]);
    const [loading, setLoading] = useState(false);
    const { openModal, closeModal } = useModal();

    const fetchVoucherTypes = async () => {
        setLoading(true);
        try {
            const data = await getVoucherTypes();
            setVoucherTypes(data);
        } catch (error) {
            toast.error('Failed to fetch voucher types');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVoucherTypes();
    }, []);

    const handleSave = async (data) => {
        try {
            await createVoucherType(data);
            toast.success('Voucher Type created');
            fetchVoucherTypes();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create voucher type');
        }
    };

    const VoucherTypeForm = () => {
        const [formData, setFormData] = useState({
            name: '',
            nature: 'Receipt',
            prefix: '',
            startingNumber: 1,
            remarks: ''
        });

        const handleChange = (e) => {
            const { name, value } = e.target;
            setFormData(prev => ({ ...prev, [name]: value }));
        };

        return (
            <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Voucher Name *</label>
                        <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. CASHRCPT" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nature *</label>
                        <Select
                            name="nature"
                            value={formData.nature}
                            onChange={handleChange}
                            options={[
                                { label: 'Receipt', value: 'Receipt' },
                                { label: 'Payment', value: 'Payment' },
                                { label: 'Contra', value: 'Contra' },
                                { label: 'Journal', value: 'Journal' }
                            ]}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Prefix</label>
                        <Input name="prefix" value={formData.prefix} onChange={handleChange} placeholder="e.g. RCPT/" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Starting Number</label>
                        <Input type="number" name="startingNumber" value={formData.startingNumber} onChange={handleChange} />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Remarks</label>
                    <Input name="remarks" value={formData.remarks} onChange={handleChange} />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={() => handleSave(formData)}>Create Type</Button>
                </div>
            </div>
        );
    };

    const handleAdd = () => {
        openModal({
            title: 'Add Voucher Type',
            content: <VoucherTypeForm />
        });
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Voucher Type Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Define numbering rules and prefixes for different voucher types</p>
                </div>
                <Button onClick={handleAdd} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Voucher Type
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Voucher Name</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nature</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prefix</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Number</th>
                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {voucherTypes.map(type => (
                            <tr key={type._id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-md text-primary">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <span className="font-bold text-gray-900">{type.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{type.nature}</span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 font-mono">{type.prefix || '-'}</td>
                                <td className="px-6 py-4 text-sm font-semibold">{type.nextNumber}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${type.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {type.active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VoucherTypeMasterPage;
