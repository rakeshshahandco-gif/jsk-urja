import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select } from '@/components/ui';
import { createProject, updateProject } from '@/services/prdApi';
import { getUsers } from '@/services/userApi';
import toast from 'react-hot-toast';
import styles from './PrdProjectForm.module.scss';
import clsx from 'clsx';
import { Upload, X } from 'lucide-react';

const CATEGORY_OPTIONS = [
    { value: 'Dimmable Driver', label: 'Dimmable Driver' },
    { value: 'Smart Switch', label: 'Smart Switch' },
    { value: 'Controller', label: 'Controller' },
    { value: 'DALI Driver', label: 'DALI Driver' },
    { value: 'Other', label: 'Other' },
];

const STAGE_OPTIONS = [
    { value: 'Concept', label: 'Concept' },
    { value: 'Component Search', label: 'Component Search' },
    { value: 'Schematic Design', label: 'Schematic Design' },
    { value: 'PCB Design', label: 'PCB Design' },
    { value: 'Prototype Assembly', label: 'Prototype Assembly' },
    { value: 'Initial Testing', label: 'Initial Testing' },
    { value: 'Design Change', label: 'Design Change' },
    { value: 'Re-Testing', label: 'Re-Testing' },
    { value: 'Approval', label: 'Approval' },
    { value: 'Released to Production', label: 'Released to Production' },
];

const STATUS_OPTIONS = [
    { value: 'Open', label: 'Open' },
    { value: 'Under Development', label: 'Under Development' },
    { value: 'Prototype Ready', label: 'Prototype Ready' },
    { value: 'Testing Running', label: 'Testing Running' },
    { value: 'Change Required', label: 'Change Required' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Released', label: 'Released' },
];

const PrdProjectForm = ({ isOpen, onClose, project, onSuccess }) => {
    const isEdit = !!project;
    
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm({
        defaultValues: {
            category: 'Other',
            currentStage: 'Concept',
            status: 'Open'
        }
    });

    const [users, setUsers] = useState([]);
    const [attachments, setAttachments] = useState([]);

    useEffect(() => {
        // Fetch all users for R&D assignments
        getUsers({ limit: 500, status: 'active' }).then(res => {
            const mapped = (res.users || res.data?.users || []).map(u => ({ value: u._id, label: u.name }));
            setUsers(mapped);
        }).catch(err => console.error('Failed to load users', err));
    }, []);

    useEffect(() => {
        if (project && isOpen) {
            reset({
                ...project,
                rdOwner: project.rdOwner?._id || project.rdOwner,
                hardwareDeveloper: project.hardwareDeveloper?._id || project.hardwareDeveloper,
                firmwareDeveloper: project.firmwareDeveloper?._id || project.firmwareDeveloper,
                testingEngineer: project.testingEngineer?._id || project.testingEngineer,
                startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
                targetCompletionDate: project.targetCompletionDate ? new Date(project.targetCompletionDate).toISOString().split('T')[0] : ''
            });
        } else if (!project && isOpen) {
            reset({
                category: 'Other',
                currentStage: 'Concept',
                status: 'Open',
                startDate: new Date().toISOString().split('T')[0]
            });
        }
    }, [project, isOpen, reset]);

    const handleFileChange = (e) => {
        if (e.target.files) {
            setAttachments(Array.from(e.target.files));
        }
    };

    const onSubmit = async (data) => {
        try {
            const formData = new FormData();
            
            // Append primitives
            Object.keys(data).forEach(key => {
                if (data[key]) {
                    formData.append(key, data[key]);
                }
            });

            // Append new files
            attachments.forEach(file => {
                formData.append('attachments', file);
            });

            if (isEdit) {
                await updateProject(project._id, formData);
                toast.success('Project updated successfully');
            } else {
                await createProject(formData);
                toast.success('Project created successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || `Failed to ${isEdit ? 'update' : 'create'} project`);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? `Edit PRD Project: ${project.productCode}` : 'Create New PRD Project'}
            size="xl"
        >
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                
                <div className={styles.sectionTitle}>Basic Details</div>
                <div className={styles.grid2}>
                    <Input
                        label="Product Code *"
                        {...register('productCode', { required: 'Code is required' })}
                        error={errors.productCode?.message}
                        disabled={isEdit}
                    />
                    <Input
                        label="Product Name *"
                        {...register('productName', { required: 'Name is required' })}
                        error={errors.productName?.message}
                    />
                    <Select
                        label="Category *"
                        options={CATEGORY_OPTIONS}
                        {...register('category', { required: 'Category is required' })}
                    />
                    <Input
                        label="Product Type (Wattage/Variant)"
                        {...register('productType')}
                    />
                    <Input
                        label="Customer Name (Optional)"
                        {...register('customerName')}
                    />
                </div>

                <div className={styles.sectionTitle}>Ownership & Team</div>
                <div className={styles.grid2}>
                    <Select
                        label="R&D Project Owner *"
                        options={[{ value: '', label: 'Select Owner' }, ...users]}
                        {...register('rdOwner', { required: 'Owner is required' })}
                        error={errors.rdOwner?.message}
                    />
                    <Select
                        label="Hardware Developer"
                        options={[{ value: '', label: '-' }, ...users]}
                        {...register('hardwareDeveloper')}
                    />
                    <Select
                        label="Firmware Developer"
                        options={[{ value: '', label: '-' }, ...users]}
                        {...register('firmwareDeveloper')}
                    />
                    <Select
                        label="Testing Engineer"
                        options={[{ value: '', label: '-' }, ...users]}
                        {...register('testingEngineer')}
                    />
                </div>

                <div className={styles.sectionTitle}>Timeline & Status</div>
                <div className={styles.grid3}>
                    <Input
                        type="date"
                        label="Start Date *"
                        {...register('startDate', { required: 'Required' })}
                        error={errors.startDate?.message}
                    />
                    <Input
                        type="date"
                        label="Target Completion Date"
                        {...register('targetCompletionDate')}
                    />
                    {isEdit && (
                        <Input
                            label="Current Revision No"
                            {...register('currentRevisionNo')}
                            readOnly
                            disabled
                        />
                    )}
                </div>

                {isEdit && (
                    <div className={styles.grid2}>
                        <Select
                            label="Current Stage"
                            options={STAGE_OPTIONS}
                            {...register('currentStage')}
                        />
                        <Select
                            label="Overall Status"
                            options={STATUS_OPTIONS}
                            {...register('status')}
                        />
                    </div>
                )}

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Remarks / Objectives</label>
                    <textarea 
                        className={styles.textarea}
                        {...register('remarks')}
                        rows={3}
                        placeholder="Define product goals, specific requirements, special certifications..."
                    />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Initial Specifications / Documents (PDF, ZIP, Images)</label>
                    <div className={styles.fileUploadBox}>
                        <input
                            type="file"
                            multiple
                            onChange={handleFileChange}
                            id="prd-attachments"
                            className={styles.fileInputHidden}
                            accept=".pdf,.png,.jpg,.jpeg,.zip,.xls,.xlsx"
                        />
                        <label htmlFor="prd-attachments" className={styles.fileDropZone}>
                            <Upload size={24} color="#64748b" />
                            <span>Click to browse and upload files</span>
                        </label>
                        {attachments.length > 0 && (
                            <div className={styles.selectedFiles}>
                                {attachments.map((f, i) => (
                                    <span key={i} className={styles.fileBadge}>{f.name}</span>
                                ))}
                            </div>
                        )}
                        {isEdit && project.attachments?.length > 0 && (
                            <div className={styles.existingFiles}>
                                <div className={styles.subLabel}>Existing Documents:</div>
                                {project.attachments.map((f, idx) => (
                                    <a key={idx} href={`${import.meta.env.VITE_API_URL || ''}/${f.url}`} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                                        {f.filename}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>
                        {isEdit ? 'Save Changes' : 'Create Project Master'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default PrdProjectForm;
