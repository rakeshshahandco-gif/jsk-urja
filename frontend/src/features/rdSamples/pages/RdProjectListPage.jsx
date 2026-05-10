import React, { useState, useEffect } from 'react';
import { 
    Plus, Search, Edit2, Trash2, ExternalLink, 
    Beaker, ClipboardList, BarChart3, Clock, CheckCircle2, 
    AlertCircle, PauseCircle, XCircle 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getRdProjects, deleteRdProject } from '../../../services/rdSampleApi';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import RdProjectForm from '../components/RdProjectForm';

const RdProjectListPage = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const response = await getRdProjects({ search });
            setProjects(response.data.data || []);
        } catch (error) {
            toast.error('Failed to fetch projects');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [search]);

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this project?')) return;
        try {
            await deleteRdProject(id);
            toast.success('Project deleted successfully');
            fetchProjects();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete project');
        }
    };

    const getStatusBadge = (status) => {
        const variants = {
            'Open': 'info',
            'In Progress': 'warning',
            'Finalized': 'success',
            'Dropped': 'error',
            'Hold': 'secondary'
        };
        const icons = {
            'Open': <Clock className="w-3 h-3 mr-1" />,
            'In Progress': <Beaker className="w-3 h-3 mr-1" />,
            'Finalized': <CheckCircle2 className="w-3 h-3 mr-1" />,
            'Dropped': <XCircle className="w-3 h-3 mr-1" />,
            'Hold': <PauseCircle className="w-3 h-3 mr-1" />
        };
        return (
            <Badge variant={variants[status] || 'default'}>
                <div className="flex items-center">
                    {icons[status]}
                    {status}
                </div>
            </Badge>
        );
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="text-blue-600" />
                        R&D Projects
                    </h1>
                    <p className="text-gray-500">Manage your product development projects and sample tracking.</p>
                </div>
                <Button onClick={() => { setSelectedProject(null); setIsFormOpen(true); }} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    New Project
                </Button>
            </div>

            <Card className="mb-6">
                <div className="p-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input 
                            placeholder="Search by project name or product..." 
                            className="pl-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            <Table>
                <thead>
                    <tr>
                        <Table.Th>Project Name</Table.Th>
                        <Table.Th>Product</Table.Th>
                        <Table.Th>Owner</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Start Date</Table.Th>
                        <Table.Th className="text-right">Actions</Table.Th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><Table.Td colSpan={6} className="text-center py-10">Loading projects...</Table.Td></tr>
                    ) : projects.length === 0 ? (
                        <tr><Table.Td colSpan={6} className="text-center py-10 text-gray-500">No projects found.</Table.Td></tr>
                    ) : projects.map((project) => (
                        <tr key={project._id} className="hover:bg-gray-50 transition-colors">
                            <Table.Td className="font-semibold">{project.projectName}</Table.Td>
                            <Table.Td>
                                <div className="text-sm">
                                    <div className="font-medium text-gray-900">{project.productName}</div>
                                    <div className="text-gray-500 text-xs">{project.productCode}</div>
                                </div>
                            </Table.Td>
                            <Table.Td>{project.rdOwner?.name || 'N/A'}</Table.Td>
                            <Table.Td>{getStatusBadge(project.status)}</Table.Td>
                            <Table.Td>{new Date(project.startDate).toLocaleDateString()}</Table.Td>
                            <Table.Td className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedProject(project); setIsFormOpen(true); }}>
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(project._id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </Table.Td>
                        </tr>
                    ))}
                </tbody>
            </Table>

            {isFormOpen && (
                <RdProjectForm 
                    project={selectedProject} 
                    onClose={() => setIsFormOpen(false)} 
                    onSuccess={() => { setIsFormOpen(false); fetchProjects(); }} 
                />
            )}
        </div>
    );
};

export default RdProjectListPage;
