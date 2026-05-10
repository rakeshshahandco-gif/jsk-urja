import React, { useState, useEffect } from 'react';
import { 
    Plus, 
    Edit2, 
    Trash2, 
    CheckCircle, 
    XCircle, 
    Calendar,
    Settings,
    Star,
    ChevronRight
} from 'lucide-react';
import { 
    Button, 
    Table, 
    Card, 
    Input, 
    Modal, 
    useModal,
    Badge
} from '@/components/ui';
import { 
    getFinancialYears, 
    createFinancialYear, 
    updateFinancialYear, 
    deleteFinancialYear,
    setCurrentFinancialYear 
} from '@/services/financialYearApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import toast from 'react-hot-toast';
import moment from 'moment';

const FinancialYearMaster = () => {
    const [fys, setFys] = useState([]);
    const [loading, setLoading] = useState(false);
    const { openModal, closeModal } = useModal();
    const { refreshFYs } = useFinancialYear();

    const fetchFYs = async () => {
        try {
            setLoading(true);
            const response = await getFinancialYears();
            setFys(response.data || []);
        } catch (error) {
            toast.error('Failed to fetch financial years');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFYs();
    }, []);

    const handleSetCurrent = async (id) => {
        try {
            await setCurrentFinancialYear(id);
            toast.success('Current financial year updated');
            fetchFYs();
            refreshFYs();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update current year');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this financial year?')) return;
        try {
            await deleteFinancialYear(id);
            toast.success('Financial year deleted');
            fetchFYs();
            refreshFYs();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    const openFYModal = (fy = null) => {
        openModal(FinancialYearForm, {
            fy,
            onSuccess: () => {
                fetchFYs();
                refreshFYs();
                closeModal();
            }
        });
    };

    const columns = [
        {
            header: 'Financial Year',
            accessor: 'name',
            cell: (row) => (
                <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.name}</span>
                    {row.isCurrent && (
                        <Badge variant="success" className="flex items-center gap-1">
                            <Star size={10} fill="currentColor" /> Current
                        </Badge>
                    )}
                </div>
            )
        },
        {
            header: 'Start Date',
            accessor: 'startDate',
            cell: (row) => moment(row.startDate).format('DD-MM-YYYY')
        },
        {
            header: 'End Date',
            accessor: 'endDate',
            cell: (row) => moment(row.endDate).format('DD-MM-YYYY')
        },
        {
            header: 'Status',
            accessor: 'status',
            cell: (row) => (
                <Badge 
                    variant={row.status === 'Active' ? 'success' : row.status === 'Closed' ? 'error' : 'warning'}
                >
                    {row.status}
                </Badge>
            )
        },
        {
            header: 'Actions',
            cell: (row) => (
                <div className="flex gap-2">
                    {!row.isCurrent && row.status === 'Active' && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleSetCurrent(row._id)}
                            title="Set as Current"
                        >
                            <CheckCircle size={14} className="text-green-600" />
                        </Button>
                    )}
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => openFYModal(row)}
                    >
                        <Edit2 size={14} />
                    </Button>
                    {!row.isCurrent && (
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(row._id)}
                        >
                            <Trash2 size={14} />
                        </Button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="p-6">
            <div className="flex items-center gap-2 mb-4 text-xs font-medium text-gray-500">
                <span>Account Master</span>
                <ChevronRight size={12} />
                <span className="text-primary-600 font-bold">Financial Year Master</span>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Calendar className="text-primary-600" />
                        Financial Year Management
                    </h1>
                    <p className="text-gray-500">Manage fiscal years, statuses, and the active working year.</p>
                </div>
                <Button onClick={() => openFYModal()} className="flex items-center gap-2">
                    <Plus size={18} /> Add Financial Year
                </Button>
            </div>

            <Card>
                <Table 
                    columns={columns}
                    data={fys}
                    loading={loading}
                />
            </Card>
        </div>
    );
};

const FinancialYearForm = ({ fy, onSuccess }) => {
    const [formData, setFormData] = useState(fy || {
        name: '',
        startDate: '',
        endDate: '',
        status: 'Active',
        isCurrent: false,
        remarks: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (fy) {
                await updateFinancialYear(fy._id, formData);
                toast.success('Financial year updated');
            } else {
                await createFinancialYear(formData);
                toast.success('Financial year created');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                <Input 
                    label="Financial Year Name (e.g. 2025-2026)"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="2025-2026"
                    required
                />
                <div className="grid grid-cols-2 gap-4">
                    <Input 
                        label="Start Date"
                        type="date"
                        value={formData.startDate ? moment(formData.startDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                        required
                    />
                    <Input 
                        label="End Date"
                        type="date"
                        value={formData.endDate ? moment(formData.endDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select 
                        className="w-full border border-gray-300 rounded-md p-2"
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                        <option value="Active">Active</option>
                        <option value="Closed">Closed</option>
                        <option value="Archived">Archived</option>
                    </select>
                </div>
                <Input 
                    label="Remarks"
                    value={formData.remarks}
                    onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                />
            </div>
            <div className="flex justify-end gap-2 mt-6">
                <Button type="submit" variant="primary">
                    {fy ? 'Update' : 'Create'} Financial Year
                </Button>
            </div>
        </form>
    );
};

export default FinancialYearMaster;
