import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createRdProject, updateRdProject } from '../../../services/rdSampleApi';
import { getUsers } from '../../../services/userApi';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';

const RdProjectForm = ({ project, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        projectName: '',
        productName: '',
        productCode: '',
        developmentStage: '',
        rdOwner: '',
        status: 'Open',
        startDate: new Date().toISOString().split('T')[0],
        remarks: ''
    });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setFormData({
                ...project,
                rdOwner: project.rdOwner?._id || project.rdOwner || '',
                startDate: new Date(project.startDate).toISOString().split('T')[0]
            });
        }
        fetchUsers();
    }, [project]);

    const fetchUsers = async () => {
        try {
            const response = await getUsers({ limit: 100 });
            setUsers(response.users || []);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (project) {
                await updateRdProject(project._id, formData);
                toast.success('Project updated successfully');
            } else {
                await createRdProject(formData);
                toast.success('Project created successfully');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save project');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={project ? 'Edit R&D Project' : 'New R&D Project'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                        <Input 
                            required 
                            value={formData.projectName} 
                            onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                            placeholder="e.g., Next Gen Smart Driver"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                        <Input 
                            required 
                            value={formData.productName} 
                            onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                            placeholder="e.g., LED Smart Driver 40W"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product Code</label>
                        <Input 
                            value={formData.productCode} 
                            onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                            placeholder="e.g., SD-40-BLE"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Development Stage</label>
                        <Input 
                            value={formData.developmentStage} 
                            onChange={(e) => setFormData({ ...formData, developmentStage: e.target.value })}
                            placeholder="e.g., Prototype Testing"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Project Owner *</label>
                        <Select 
                            required
                            value={formData.rdOwner} 
                            onChange={(e) => setFormData({ ...formData, rdOwner: e.target.value })}
                        >
                            <option value="">Select Owner</option>
                            {users.map(user => (
                                <option key={user._id} value={user._id}>{user.name}</option>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <Select 
                            value={formData.status} 
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        >
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Hold">Hold</option>
                            <option value="Finalized">Finalized</option>
                            <option value="Dropped">Dropped</option>
                        </Select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <Input 
                            type="date"
                            value={formData.startDate} 
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                    <textarea 
                        className="w-full border rounded-md p-2 text-sm min-h-[100px]"
                        value={formData.remarks} 
                        onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="Add project details or observations..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={loading}>{project ? 'Update' : 'Create'} Project</Button>
                </div>
            </form>
        </Modal>
    );
};

export default RdProjectForm;
