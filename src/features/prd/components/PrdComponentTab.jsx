import React, { useState, useEffect } from 'react';
import { getPrdComponents, createPrdComponent, updatePrdComponent, deletePrdComponent } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdComponentTab.module.scss';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import moment from 'moment';

const COMPONENT_TYPES = [
    { value: 'IC', label: 'Integrated Circuit (IC)' },
    { value: 'Microcontroller', label: 'Microcontroller / MCU' },
    { value: 'MOSFET', label: 'MOSFET / Transistor' },
    { value: 'Passive', label: 'Passive (Resistor, Capacitor)' },
    { value: 'Connector', label: 'Connector / Header' },
    { value: 'Other', label: 'Other' },
];

const TRIAL_STATUSES = [
    { value: 'Pending Trial', label: 'Pending Trial' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

const ComponentForm = ({ isOpen, onClose, component, projectId, onSuccess }) => {
    const isEdit = !!component;
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            componentType: 'IC',
            trialStatus: 'Pending Trial'
        }
    });

    useEffect(() => {
        if (component && isOpen) {
            reset({
                ...component,
                date: moment(component.date).format('YYYY-MM-DD')
            });
        }
    }, [component, isOpen, reset]);

    const onSubmit = async (data) => {
        try {
            data.projectId = projectId;
            if (isEdit) {
                await updatePrdComponent(component._id, data);
                toast.success('Component updated successfully');
            } else {
                await createPrdComponent(data);
                toast.success('Component added successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save component');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Component Research' : 'Add Component Research'} size="lg">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                <div className={styles.grid2}>
                    <Input type="date" label="Date of Search *" {...register('date', { required: true })} />
                    <Select label="Component Type *" options={COMPONENT_TYPES} {...register('componentType', { required: true })} />
                    <Input label="Component / Category Name *" placeholder="e.g. WiFi Module" {...register('componentName', { required: true })} />
                    <Input label="Specific Part Number *" placeholder="e.g. ESP32-WROOM-32" {...register('partNo', { required: true })} />
                    <Input label="Manufacturer" {...register('manufacturer')} />
                    <Input label="Supplier / Vendor" {...register('supplier')} />
                </div>
                
                <div className={styles.fullWidth}>
                    <Input label="Datasheet Link" placeholder="https://..." {...register('datasheet')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Key Specifications / Features</label>
                    <textarea className={styles.textarea} rows={2} {...register('keySpec')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Reason for Selection</label>
                    <textarea className={styles.textarea} rows={2} {...register('reason')} />
                </div>

                <div className={styles.grid2}>
                    <Input label="Alternative Part No" {...register('alternative')} />
                    <Select label="Trial Result Status" options={TRIAL_STATUSES} {...register('trialStatus')} />
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Save Component</Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdComponentTab = ({ projectId }) => {
    const [components, setComponents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editMode, setEditMode] = useState(null);

    const fetchComponents = async () => {
        setLoading(true);
        try {
            const data = await getPrdComponents({ projectId });
            setComponents(data);
        } catch (error) {
            toast.error('Failed to load components');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchComponents();
    }, [projectId]);

    const handleDelete = async (comp) => {
        if (window.confirm(`Delete IC Research record for ${comp.partNo}?`)) {
            try {
                await deletePrdComponent(comp._id);
                toast.success('Deleted');
                fetchComponents();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>IC & Component Research Register</h3>
                    <p className={styles.tabDesc}>Log investigated chips, alternatives, and trial selections for this project.</p>
                </div>
                <Button variant="primary" onClick={() => { setEditMode(null); setIsFormOpen(true); }}>
                    <Plus size={16} /> Add Component
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}>Loading...</div>
            ) : components.length === 0 ? (
                <div className={styles.emptyState}>No component research logged yet.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Part Number</th>
                                <th>Manufacturer</th>
                                <th>Trial Status</th>
                                <th>Entered By</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {components.map(c => (
                                <tr key={c._id}>
                                    <td>{moment(c.date).format('DD MMM YYYY')}</td>
                                    <td><span className={styles.typeBadge}>{c.componentType}</span></td>
                                    <td>
                                        <strong>{c.partNo}</strong>
                                        <div className={styles.subtext}>{c.componentName}</div>
                                    </td>
                                    <td>{c.manufacturer || '-'}</td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${(c.trialStatus || 'Pending').replace(/\s+/g, '')}`])}>
                                            {c.trialStatus || 'Pending'}
                                        </span>
                                    </td>
                                    <td>{c.enteredBy?.name || '-'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button onClick={() => { setEditMode(c); setIsFormOpen(true); }} className={styles.iconBtn}><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(c)} className={clsx(styles.iconBtn, styles.deleteBtn)}><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isFormOpen && (
                <ComponentForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    component={editMode}
                    projectId={projectId}
                    onSuccess={fetchComponents}
                />
            )}
        </div>
    );
};

export default PrdComponentTab;
