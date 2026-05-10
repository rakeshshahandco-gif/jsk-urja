import React, { useState, useEffect } from 'react';
import { getPrdChangeLogs, createPrdChangeLog, updatePrdChangeLog, deletePrdChangeLog, getPrdTestReports } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2, Download, Shuffle, Upload } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import toast from 'react-hot-toast';
import styles from './PrdChangeLogTab.module.scss';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import moment from 'moment';
import { getUsers } from '@/services/userApi';
import { env } from '@/config/env';

const CHANGE_TYPES = [
    { value: 'Component Replacement', label: 'Component Replacement / Cost Reduction' },
    { value: 'Circuit Redesign', label: 'Circuit Redesign / Improvement' },
    { value: 'Firmware Update', label: 'Firmware Update / Bug Fix' },
    { value: 'Mechanical Alteration', label: 'Mechanical Alteration' },
    { value: 'Other', label: 'Other ECN' },
];

const STATUS_OPTIONS = [
    { value: 'Requested', label: 'Requested - Pending Review' },
    { value: 'In Implementation', label: 'In Implementation' },
    { value: 'Implemented - Pending Test', label: 'Implemented - Pending Verification' },
    { value: 'Verified - Approved', label: 'Verified - Approved/Closed' },
    { value: 'Rejected', label: 'Rejected / Reversed' },
];

const ChangeLogForm = ({ isOpen, onClose, log, projectId, onSuccess }) => {
    const isEdit = !!log;
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
        defaultValues: {
            changeDate: new Date().toISOString().split('T')[0],
            changeType: 'Component Replacement',
            finalStatus: 'Requested'
        }
    });

    const [users, setUsers] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [tests, setTests] = useState([]);

    useEffect(() => {
        getUsers({ limit: 500, status: 'active' }).then(res => {
            const mapped = (res.users || res.data?.users || []).map(u => ({ value: u._id, label: u.name }));
            setUsers(mapped);
        });

        getPrdTestReports({ projectId }).then(res => {
            setTests(res.map(t => ({ value: t._id, label: `Test on ${moment(t.testDate).format('YYYY-MM-DD')} - ${t.testType}` })));
        });
    }, [projectId]);

    useEffect(() => {
        if (log && isOpen) {
            reset({
                ...log,
                changeDate: moment(log.changeDate).format('YYYY-MM-DD'),
                changedBy: log.changedBy?._id || log.changedBy,
                approvedBy: log.approvedBy?._id || log.approvedBy,
                testRef: log.testRef?._id || log.testRef
            });
        }
    }, [log, isOpen, reset]);

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
                await updatePrdChangeLog(log._id, formData);
                toast.success('ECN updated');
            } else {
                await createPrdChangeLog(formData);
                toast.success('ECN created');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save change log');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Engineering Change Notice' : 'Log New ECN'} size="xl">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                
                <div className={styles.headerBlock}>
                    <div className={styles.grid3}>
                        <Input type="date" label="ECN Date *" {...register('changeDate', { required: true })} />
                        <Input label="Target Revision No. *" placeholder="e.g. v2.0" {...register('revisionNo', { required: true })} />
                        <Select label="Change Type *" options={CHANGE_TYPES} {...register('changeType', { required: true })} />
                    </div>
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Context: What problem are we solving?</label>
                    <textarea className={styles.textarea} rows={2} {...register('problemBefore', { required: true })} placeholder="Describe the current issue or driving factor..." />
                </div>

                <div className={styles.grid2}>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Root Cause Analysis</label>
                        <textarea className={styles.textarea} rows={2} {...register('rootCause')} placeholder="Why exactly does this problem occur?" />
                    </div>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Implementation: Change Done</label>
                        <textarea className={styles.textarea} rows={2} {...register('changeDone', { required: true })} placeholder="What exactly was modified (e.g. Changed C12 to 10uF)?" />
                    </div>
                </div>

                {/* BEFore and After Comparison */}
                <div className={styles.comparisonBox}>
                    <h4 className={styles.boxTitle}>Parameter Comparison</h4>
                    <div className={styles.grid3}>
                        <Input label="Affected Area" placeholder="e.g. Inrush Current" {...register('affectedArea')} />
                        <Input label="Old Value / Reading" placeholder="e.g. 40A" {...register('oldValue')} />
                        <Input label="New Expected / Targeted Value" placeholder="e.g. <30A" {...register('newValue')} />
                    </div>
                </div>

                <div className={styles.grid2}>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Expected Result</label>
                        <textarea className={styles.textarea} rows={2} {...register('expectedResult')} />
                    </div>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Actual Verification Result</label>
                        <textarea className={styles.textarea} rows={2} {...register('actualResult')} />
                    </div>
                </div>

                <div className={styles.bottomBlock}>
                    <div className={styles.grid3}>
                        <Select label="Implementer (Changed By)" options={[{ value: '', label: 'Unassigned' }, ...users]} {...register('changedBy')} />
                        <Select label="Approver (QA/Management)" options={[{ value: '', label: 'None' }, ...users]} {...register('approvedBy')} />
                        <Select label="Link Verification Test" options={[{ value: '', label: '- None -' }, ...tests]} {...register('testRef')} />
                    </div>
                    
                    <div className={styles.grid2} style={{ marginTop: '16px' }}>
                        <Select label="Final Status *" options={STATUS_OPTIONS} {...register('finalStatus', { required: true })} />
                    </div>

                    <div className={styles.fullWidth} style={{ marginTop: '16px' }}>
                        <label className={styles.label}>Attach Proof Documents (Datasheets, Mails, Schematics before/after)</label>
                        <div className={styles.fileUploadBox}>
                            <input type="file" multiple onChange={handleFileChange} id="ecn-evidences" className={styles.fileInputHidden} />
                            <label htmlFor="ecn-evidences" className={styles.fileDropZone}>
                                <Upload size={24} />
                                <span>Click to attach ECN files</span>
                            </label>
                            {attachments.length > 0 && (
                                <div className={styles.selectedFiles}>
                                    {attachments.map((f, i) => <span key={i} className={styles.fileBadge}>{f.name}</span>)}
                                </div>
                            )}
                            {isEdit && log.attachments?.length > 0 && (
                                <div className={styles.existingFiles}>
                                    <div className={styles.subLabel}>Current Attachments:</div>
                                    {log.attachments.map((f, idx) => (
                                        <a key={idx} href={`${env.SOCKET_URL}/${f.url}`} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                                            {f.filename}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Save ECN Log</Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdChangeLogTab = ({ projectId }) => {
    const [changeLogs, setChangeLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editMode, setEditMode] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await getPrdChangeLogs({ projectId });
            setChangeLogs(data);
        } catch (error) {
            toast.error('Failed to load change logs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchLogs();
    }, [projectId]);

    const handleDelete = async (log) => {
        if (window.confirm(`Delete ECN record for Revision ${log.revisionNo}?`)) {
            try {
                await deletePrdChangeLog(log._id);
                toast.success('Deleted');
                fetchLogs();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Engineering Change Notice (ECN) Log</h3>
                    <p className={styles.tabDesc}>Track systematic part upgrades, cost reduction measures, and design adjustments between revisions.</p>
                </div>
                <Button variant="primary" onClick={() => { setEditMode(null); setIsFormOpen(true); }}>
                    <Shuffle size={16} /> Log ECN
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}><BrandedLoader size={80} /></div>
            ) : changeLogs.length === 0 ? (
                <div className={styles.emptyState}>No engineering changes recorded yet.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date / Rev</th>
                                <th>Change Description</th>
                                <th>Comparison (Before vs After)</th>
                                <th>Status</th>
                                <th>Changed By</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {changeLogs.map(log => (
                                <tr key={log._id}>
                                    <td>
                                        <div className={styles.smDate}>{moment(log.changeDate).format('DD MMM YYYY')}</div>
                                        <span className={styles.revBadge}>Rev: {log.revisionNo}</span>
                                    </td>
                                    <td>
                                        <span className={styles.typeBadge}>{log.changeType}</span>
                                        <div className={styles.subtextBlock}>
                                            <strong>Fix:</strong> {log.changeDone}
                                        </div>
                                    </td>
                                    <td>
                                        {log.affectedArea ? (
                                            <div className={styles.compareCard}>
                                                <div className={styles.cLabel}>{log.affectedArea}</div>
                                                <div className={styles.cValues}>
                                                    <span className={styles.oldVal}>{log.oldValue || '?'}</span> 
                                                    &rarr; 
                                                    <span className={styles.newVal}>{log.newValue || '?'}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className={styles.txtMuted}>No metric mapped</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${(log.finalStatus || 'Requested').replace(/\s+/g, '').replace(/[/\-/]/g, '')}`])}>
                                            {log.finalStatus || 'Requested'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.personVal}>{log.changedBy?.name || '-'}</div>
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button onClick={() => { setEditMode(log); setIsFormOpen(true); }} className={styles.iconBtn}><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(log)} className={clsx(styles.iconBtn, styles.deleteBtn)}><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isFormOpen && (
                <ChangeLogForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    log={editMode}
                    projectId={projectId}
                    onSuccess={fetchLogs}
                />
            )}
        </div>
    );
};

export default PrdChangeLogTab;
