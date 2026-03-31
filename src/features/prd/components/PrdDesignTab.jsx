import React, { useState, useEffect } from 'react';
import { getPrdDesigns, createPrdDesign, updatePrdDesign, deletePrdDesign } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdDesignTab.module.scss';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import moment from 'moment';
import { getUsers } from '@/services/userApi';
import { env } from '@/config/env';

const DESIGN_TYPES = [
    { value: 'Schematic', label: 'Schematic Diagram' },
    { value: 'PCB Layout', label: 'PCB Layout / Gerber' },
    { value: 'Firmware', label: 'Firmware / Source Code' },
    { value: 'Mechanical', label: 'Mechanical / Enclosure 3D' },
    { value: 'Other', label: 'Other Document' },
];

const STATUS_OPTIONS = [
    { value: 'Draft', label: 'Draft' },
    { value: 'In Review', label: 'In Review' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

const DesignForm = ({ isOpen, onClose, design, projectId, onSuccess }) => {
    const isEdit = !!design;
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            designType: 'Schematic',
            status: 'Draft'
        }
    });

    const [users, setUsers] = useState([]);
    const [attachments, setAttachments] = useState([]);

    useEffect(() => {
        getUsers({ limit: 500, status: 'active' }).then(res => {
            const mapped = (res.users || res.data?.users || []).map(u => ({ value: u._id, label: u.name }));
            setUsers(mapped);
        });
    }, []);

    useEffect(() => {
        if (design && isOpen) {
            reset({
                ...design,
                date: moment(design.date).format('YYYY-MM-DD'),
                checkedBy: design.checkedBy?._id || design.checkedBy,
                approvedBy: design.approvedBy?._id || design.approvedBy,
            });
        }
    }, [design, isOpen, reset]);

    const handleFileChange = (e) => {
        if (e.target.files) setAttachments(Array.from(e.target.files));
    };

    const onSubmit = async (data) => {
        try {
            const formData = new FormData();
            formData.append('projectId', projectId);
            
            Object.keys(data).forEach(key => {
                if (data[key]) formData.append(key, data[key]);
            });

            attachments.forEach(file => {
                formData.append('attachments', file);
            });

            if (isEdit) {
                await updatePrdDesign(design._id, formData);
                toast.success('Design updated');
            } else {
                await createPrdDesign(formData);
                toast.success('Design logged');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save design');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Design Version' : 'Upload New Design Version'} size="lg">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                <div className={styles.grid3}>
                    <Input type="date" label="Date *" {...register('date', { required: true })} />
                    <Select label="Design Type *" options={DESIGN_TYPES} {...register('designType', { required: true })} />
                    <Input label="Revision No. *" placeholder="e.g. v1.2" {...register('revisionNo', { required: true })} />
                </div>
                
                <div className={styles.fullWidth}>
                    <Input label="Summary/Title *" placeholder="e.g. Added surge protection circuit" {...register('summary', { required: true })} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Detailed Description / Changes</label>
                    <textarea className={styles.textarea} rows={3} {...register('description')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Reason for Change (if applicable)</label>
                    <textarea className={styles.textarea} rows={2} {...register('reason')} />
                </div>

                <div className={styles.grid3}>
                    <Select label="Checked By" options={[{ value: '', label: '-' }, ...users]} {...register('checkedBy')} />
                    <Select label="Approved By" options={[{ value: '', label: '-' }, ...users]} {...register('approvedBy')} />
                    <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Design Files (Zip, PDF, Gerber)</label>
                    <div className={styles.fileUploadBox}>
                        <input type="file" multiple onChange={handleFileChange} id="design-files" className={styles.fileInputHidden} />
                        <label htmlFor="design-files" className={styles.fileDropZone}>
                            <Upload size={24} />
                            <span>Click to attach files</span>
                        </label>
                        {attachments.length > 0 && (
                            <div className={styles.selectedFiles}>
                                {attachments.map((f, i) => <span key={i} className={styles.fileBadge}>{f.name}</span>)}
                            </div>
                        )}
                        {isEdit && design.attachments?.length > 0 && (
                            <div className={styles.existingFiles}>
                                <div className={styles.subLabel}>Current Files:</div>
                                {design.attachments.map((f, idx) => (
                                    <a key={idx} href={`${env.SOCKET_URL}/${f.url}`} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                                        {f.filename}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Save Design</Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdDesignTab = ({ projectId }) => {
    const [designs, setDesigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editMode, setEditMode] = useState(null);

    const fetchDesigns = async () => {
        setLoading(true);
        try {
            const data = await getPrdDesigns({ projectId });
            setDesigns(data);
        } catch (error) {
            toast.error('Failed to load designs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchDesigns();
    }, [projectId]);

    const handleDelete = async (dsg) => {
        if (window.confirm(`Delete design revision ${dsg.revisionNo}?`)) {
            try {
                await deletePrdDesign(dsg._id);
                toast.success('Deleted');
                fetchDesigns();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Design & Schematic Register</h3>
                    <p className={styles.tabDesc}>Maintain version control over PCB files, Firmware, and mechanical designs.</p>
                </div>
                <Button variant="primary" onClick={() => { setEditMode(null); setIsFormOpen(true); }}>
                    <Plus size={16} /> Log Design Version
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}>Loading...</div>
            ) : designs.length === 0 ? (
                <div className={styles.emptyState}>No designs logged yet.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Rev No.</th>
                                <th>Type</th>
                                <th>Summary</th>
                                <th>Files</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {designs.map(d => (
                                <tr key={d._id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{moment(d.date).format('DD MMM YYYY')}</td>
                                    <td><span className={styles.revBadge}>{d.revisionNo}</span></td>
                                    <td><span className={styles.typeBadge}>{d.designType}</span></td>
                                    <td>
                                        <strong>{d.summary}</strong>
                                        <div className={styles.subtext}>By: {d.changedBy?.name || '-'}</div>
                                    </td>
                                    <td>
                                        {d.attachments?.length > 0 ? (
                                            <div className={styles.fileCount}>
                                                <Download size={14} /> {d.attachments.length} files
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${(d.status || 'Draft').replace(/\s+/g, '')}`])}>
                                            {d.status || 'Draft'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button onClick={() => { setEditMode(d); setIsFormOpen(true); }} className={styles.iconBtn}><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(d)} className={clsx(styles.iconBtn, styles.deleteBtn)}><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isFormOpen && (
                <DesignForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    design={editMode}
                    projectId={projectId}
                    onSuccess={fetchDesigns}
                />
            )}
        </div>
    );
};

export default PrdDesignTab;
