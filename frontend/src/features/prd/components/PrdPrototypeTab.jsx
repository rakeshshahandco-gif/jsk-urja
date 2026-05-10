import React, { useState, useEffect } from 'react';
import { getPrdPrototypes, createPrdPrototype, updatePrdPrototype, deletePrdPrototype } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import toast from 'react-hot-toast';
import styles from './PrdPrototypeTab.module.scss';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import moment from 'moment';

const STATUS_OPTIONS = [
    { value: 'Built', label: 'Built - Awaiting Testing' },
    { value: 'Tested - Pass', label: 'Tested - Pass' },
    { value: 'Tested - Fail', label: 'Tested - Fail' },
    { value: 'Scrapped', label: 'Scrapped' },
];

const SAMPLE_TYPES = [
    { value: 'Alpha (Internal)', label: 'Alpha (Internal R&D)' },
    { value: 'Beta (Verification)', label: 'Beta (QA Verification)' },
    { value: 'Pre-Production', label: 'Pre-Production Run' },
    { value: 'Customer Sample', label: 'Customer Sample' },
];

const PrototypeForm = ({ isOpen, onClose, prototype, projectId, onSuccess }) => {
    const isEdit = !!prototype;
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
        defaultValues: {
            buildDate: new Date().toISOString().split('T')[0],
            sampleType: 'Alpha (Internal)',
            status: 'Built',
            qty: 1
        }
    });

    useEffect(() => {
        if (prototype && isOpen) {
            reset({
                ...prototype,
                buildDate: moment(prototype.buildDate).format('YYYY-MM-DD'),
            });
        }
    }, [prototype, isOpen, reset]);

    const onSubmit = async (data) => {
        try {
            data.projectId = projectId;
            if (isEdit) {
                await updatePrdPrototype(prototype._id, data);
                toast.success('Prototype build updated');
            } else {
                await createPrdPrototype(data);
                toast.success('Prototype build recorded');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save prototype record');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Prototype Build' : 'Log Prototype Build'} size="lg">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                <div className={styles.grid2}>
                    <Input type="date" label="Build Date *" {...register('buildDate', { required: true })} />
                    <Input label="Corresponding Revision No. *" placeholder="e.g. v1.2" {...register('revisionNo', { required: true })} />
                    
                    <Select label="Sample Type *" options={SAMPLE_TYPES} {...register('sampleType')} />
                    <Input type="number" label="Quantity Built *" {...register('qty', { required: true, min: 1 })} />
                </div>
                
                <div className={styles.grid2}>
                    <Input label="PCB Version Used" placeholder="e.g. RevB" {...register('pcbVersion')} />
                    <Input label="Firmware Version Flashed" placeholder="e.g. FW_1.0.4" {...register('firmwareVersion')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Critical Components Used (Optional)</label>
                    <textarea className={styles.textarea} rows={2} {...register('componentsUsed')} placeholder="IC Part Numbers, specific inductor ratings applied..." />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Assembly Notes & Issues Faced</label>
                    <textarea className={styles.textarea} rows={2} {...register('assemblyNotes')} placeholder="Any component fitting issues, soldering difficulties..." />
                </div>

                <div className={styles.grid2}>
                    <Select label="Current Status" options={STATUS_OPTIONS} {...register('status')} />
                    <Input label="General Remarks" {...register('remarks')} />
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Save Build Record</Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdPrototypeTab = ({ projectId }) => {
    const [prototypes, setPrototypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editMode, setEditMode] = useState(null);

    const fetchPrototypes = async () => {
        setLoading(true);
        try {
            const data = await getPrdPrototypes({ projectId });
            setPrototypes(data);
        } catch (error) {
            toast.error('Failed to load prototype builds');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchPrototypes();
    }, [projectId]);

    const handleDelete = async (proto) => {
        if (window.confirm(`Delete prototype build record for Revision ${proto.revisionNo}?`)) {
            try {
                await deletePrdPrototype(proto._id);
                toast.success('Deleted');
                fetchPrototypes();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Prototype Build Records</h3>
                    <p className={styles.tabDesc}>Log physical sample assemblies, firmware flashes, and initial build statuses before formal testing.</p>
                </div>
                <Button variant="primary" onClick={() => { setEditMode(null); setIsFormOpen(true); }}>
                    <Plus size={16} /> Log Build
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}><BrandedLoader size={80} /></div>
            ) : prototypes.length === 0 ? (
                <div className={styles.emptyState}>No prototype builds logged yet.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Build Date</th>
                                <th>Rev No.</th>
                                <th>Sample Type</th>
                                <th>Qty</th>
                                <th>PCB / FW Ver</th>
                                <th>Status</th>
                                <th>Built By</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prototypes.map(p => (
                                <tr key={p._id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{moment(p.buildDate).format('DD MMM YYYY')}</td>
                                    <td><span className={styles.revBadge}>{p.revisionNo}</span></td>
                                    <td><span className={styles.typeBadge}>{p.sampleType}</span></td>
                                    <td><strong>{p.qty}</strong></td>
                                    <td>
                                        <div className={styles.smText}>PCB: {p.pcbVersion || '-'}</div>
                                        <div className={styles.smText}>FW: {p.firmwareVersion || '-'}</div>
                                    </td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${(p.status || 'Built').replace(/\W/g, '')}`])}>
                                            {p.status || 'Built'}
                                        </span>
                                    </td>
                                    <td>{p.assembledBy?.name || '-'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button onClick={() => { setEditMode(p); setIsFormOpen(true); }} className={styles.iconBtn}><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(p)} className={clsx(styles.iconBtn, styles.deleteBtn)}><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isFormOpen && (
                <PrototypeForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    prototype={editMode}
                    projectId={projectId}
                    onSuccess={fetchPrototypes}
                />
            )}
        </div>
    );
};

export default PrdPrototypeTab;
