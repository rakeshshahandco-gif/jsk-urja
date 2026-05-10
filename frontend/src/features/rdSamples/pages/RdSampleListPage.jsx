import React, { useState, useEffect } from 'react';
import { 
    Plus, Search, Edit2, Trash2, Filter, 
    ChevronRight, Microscope, Info, CheckCircle2, 
    AlertTriangle, XCircle, MoreVertical,
    DollarSign, Truck, Globe, IndianRupee
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getRdSamples, deleteRdSample, getRdProjects } from '../../../services/rdSampleApi';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import RdSampleForm from '../components/RdSampleForm';

const RdSampleListPage = () => {
    const [samples, setSamples] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingSample, setEditingSample] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [samplesRes, projectsRes] = await Promise.all([
                getRdSamples({ search, project: selectedProject }),
                getRdProjects()
            ]);
            setSamples(samplesRes.data.data || []);
            setProjects(projectsRes.data.data || []);
        } catch (error) {
            toast.error('Failed to fetch sample data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [search, selectedProject]);

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this sample entry?')) return;
        try {
            await deleteRdSample(id);
            toast.success('Sample deleted successfully');
            fetchData();
        } catch (error) {
            toast.error('Failed to delete sample');
        }
    };

    const getTestStatusBadge = (status) => {
        const variants = {
            'Pending': 'secondary',
            'Under Test': 'warning',
            'Approved': 'success',
            'Rejected': 'error',
            'Alternative': 'info',
            'Final Selected': 'success'
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Microscope className="text-purple-600" />
                        Sample Tracker
                    </h1>
                    <p className="text-gray-500">Track and compare R&D samples from various suppliers.</p>
                </div>
                <Button onClick={() => { setEditingSample(null); setIsFormOpen(true); }} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    New Sample Entry
                </Button>
            </div>

            <Card className="mb-6">
                <div className="p-4 flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input 
                            placeholder="Search by item name, supplier, part number..." 
                            className="pl-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="w-64">
                        <Select 
                            value={selectedProject} 
                            onChange={(e) => setSelectedProject(e.target.value)}
                        >
                            <option value="">All Projects</option>
                            {projects.map(p => (
                                <option key={p._id} value={p._id}>{p.projectName}</option>
                            ))}
                        </Select>
                    </div>
                </div>
            </Card>

            <Table>
                <thead>
                    <tr>
                        <Table.Th>Entry No</Table.Th>
                        <Table.Th>Item Details</Table.Th>
                        <Table.Th>Supplier / Source</Table.Th>
                        <Table.Th>Costing</Table.Th>
                        <Table.Th>Test Status</Table.Th>
                        <Table.Th>Receipt Date</Table.Th>
                        <Table.Th className="text-right">Actions</Table.Th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><Table.Td colSpan={7} className="text-center py-10">Loading samples...</Table.Td></tr>
                    ) : samples.length === 0 ? (
                        <tr><Table.Td colSpan={7} className="text-center py-10 text-gray-500">No samples found.</Table.Td></tr>
                    ) : samples.map((sample) => (
                        <tr key={sample._id} className="hover:bg-gray-50 transition-colors">
                            <Table.Td className="font-mono text-xs">{sample.entryNo}</Table.Td>
                            <Table.Td>
                                <div className="text-sm">
                                    <div className="font-semibold text-gray-900">{sample.itemName}</div>
                                    <div className="text-gray-500 text-xs italic">{sample.project?.projectName}</div>
                                    {sample.partNumber && <div className="text-blue-600 text-[10px] uppercase font-bold mt-1">PN: {sample.partNumber}</div>}
                                </div>
                            </Table.Td>
                            <Table.Td>
                                <div className="text-sm">
                                    <div className="flex items-center gap-1 font-medium">
                                        {sample.supplierCountry === 'China' ? <Globe className="w-3 h-3 text-red-500" /> : <IndianRupee className="w-3 h-3 text-green-600" />}
                                        {sample.supplierName}
                                    </div>
                                    <div className="text-gray-500 text-xs">{sample.purchaseSource}</div>
                                </div>
                            </Table.Td>
                            <Table.Td>
                                <div className="text-sm">
                                    <div className="font-mono font-bold text-gray-900">
                                        {sample.currency} {sample.unitRate}
                                    </div>
                                    <div className="text-gray-500 text-xs">LC: ₹{sample.landedCost}</div>
                                </div>
                            </Table.Td>
                            <Table.Td>
                                {getTestStatusBadge(sample.testStatus)}
                                {sample.finalSelectionStatus === 'Final Selected' && (
                                    <div className="mt-1">
                                        <Badge variant="success" className="text-[10px] py-0">SELECTED</Badge>
                                    </div>
                                )}
                            </Table.Td>
                            <Table.Td className="text-sm">{sample.receiptDate ? new Date(sample.receiptDate).toLocaleDateString() : '-'}</Table.Td>
                            <Table.Td className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { setEditingSample(sample); setIsFormOpen(true); }}>
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(sample._id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </Table.Td>
                        </tr>
                    ))}
                </tbody>
            </Table>

            {isFormOpen && (
                <RdSampleForm 
                    sample={editingSample} 
                    onClose={() => setIsFormOpen(false)} 
                    onSuccess={() => { setIsFormOpen(false); fetchData(); }} 
                />
            )}
        </div>
    );
};

export default RdSampleListPage;
