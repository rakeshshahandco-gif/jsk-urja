import React, { useState, useEffect } from 'react';
import {
    Button, Input, Select, useModal
} from '@/components/ui';
import { Plus, Edit2, Trash2, FileText, Hash, Layers } from 'lucide-react';
import { getVoucherTypes, createVoucherType, updateVoucherType, deleteVoucherType } from '@/services/accountApi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { TableSkeleton } from '@/components/ui/BrandedLoading';

const VoucherTypeMasterPage = () => {
    const navigate = useNavigate();
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

    const handleSave = async (data, isEdit = false, id = null) => {
        try {
            if (isEdit) {
                await updateVoucherType(id, data);
                toast.success('Voucher Type updated');
            } else {
                await createVoucherType(data);
                toast.success('Voucher Type created');
            }
            fetchVoucherTypes();
            closeModal();
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} voucher type`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this voucher type?')) return;
        try {
            await deleteVoucherType(id);
            toast.success('Voucher Type deleted');
            fetchVoucherTypes();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete voucher type');
        }
    };

    const VoucherTypeForm = ({ initialData = null }) => {
        const [formData, setFormData] = useState(initialData || {
            name: '',
            nature: 'Receipt',
            prefix: '',
            startingNumber: 1,
            remarks: '',
            active: true
        });

        const isEdit = !!initialData;

        const handleChange = (e) => {
            const { name, value, type, checked } = e.target;
            setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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
                                { label: 'Journal', value: 'Journal' },
                                { label: 'Sales', value: 'Sales' },
                                { label: 'Purchase', value: 'Purchase' },
                                { label: 'Expense', value: 'Expense' }
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

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="active" 
                        name="active" 
                        checked={formData.active} 
                        onChange={handleChange}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="active" className="text-sm font-medium">Active Status</label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button onClick={() => handleSave(formData, isEdit, initialData?._id)}>
                        {isEdit ? 'Update Type' : 'Create Type'}
                    </Button>
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

    const handleEdit = (type) => {
        openModal({
            title: 'Edit Voucher Type',
            content: <VoucherTypeForm initialData={type} />
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
                {loading ? (
                    <TableSkeleton rows={8} cols={6} />
                ) : voucherTypes.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        No voucher types found. Create one to get started.
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        {/* ... existing table code ... */}
                    </table>
                )}
            </div>
        </div>
    );
};

export default VoucherTypeMasterPage;
