import React, { useState, useEffect } from 'react';
import { getPrdIssues, createPrdIssue, updatePrdIssue, deletePrdIssue, getPrdTestReports, getPrdChangeLogs } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2, Download, AlertTriangle, Upload } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import toast from 'react-hot-toast';
import styles from './PrdIssueTab.module.scss';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import moment from 'moment';
import { getUsers } from '@/services/userApi';
import { env } from '@/config/env';

const SEVERITY_LEVELS = [
    { value: 'Low', label: 'Low - Cosmetic/Minor' },
    { value: 'Medium', label: 'Medium - Functional but Usable' },
    { value: 'High', label: 'High - Critical Failure/Safety Risk' },
    { value: 'Blocker', label: 'Blocker - Halts Production/Testing' },
];

const CATEGORIES = [
    { value: 'Hardware/PCB', label: 'Hardware/PCB Issue' },
    { value: 'Firmware/Software', label: 'Firmware/Software Bug' },
    { value: 'Mechanical/Enclosure', label: 'Mechanical/Enclosure Fitment' },
    { value: 'Component Failure', label: 'Component/IC Failure' },
    { value: 'Other', label: 'Other/Systematic' },
];

const STATUS_OPTIONS = [
    { value: 'Open', label: 'Open / Investigating' },
    { value: 'In Progress', label: 'In Progress / Root Cause Found' },
    { value: 'Resolved', label: 'Resolved / Fix Applied' },
    { value: 'Closed', label: 'Closed / Verified' }
];

const FOUND_DURING_OPTIONS = [
    { value: 'R&D Alpha Testing', label: 'R&D Alpha Testing' },
    { value: 'QA Beta Testing', label: 'QA Beta Testing' },
    { value: 'Pilot Production', label: 'Pilot Production' },
    { value: 'Field/Customer', label: 'Field/Customer Report' }
];

const IssueForm = ({ isOpen, onClose, issue, projectId, onSuccess }) => {
    const isEdit = !!issue;
    const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            status: 'Open',
            severity: 'Medium',
            category: 'Hardware/PCB',
            foundDuring: 'R&D Alpha Testing'
        }
    });

    const [users, setUsers] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [tests, setTests] = useState([]);
    const [ecns, setEcns] = useState([]);

    useEffect(() => {
        getUsers({ limit: 500, status: 'active' }).then(res => {
            const mapped = (res.users || res.data?.users || []).map(u => ({ value: u._id, label: u.name }));
            setUsers(mapped);
        });

        getPrdTestReports({ projectId }).then(res => {
            setTests(res.map(t => ({ value: t._id, label: `Test on ${moment(t.testDate).format('YYYY-MM-DD')} - ${t.testType}` })));
        });

        getPrdChangeLogs({ projectId }).then(res => {
            setEcns(res.map(c => ({ value: c._id, label: `ECN on ${moment(c.changeDate).format('YYYY-MM-DD')} - ${c.changeType}` })));
        });
    }, [projectId]);

    useEffect(() => {
        if (issue && isOpen) {
            reset({
                ...issue,
                date: moment(issue.date).format('YYYY-MM-DD'),
                assignedTo: issue.assignedTo?._id || issue.assignedTo,
                linkedTestId: issue.linkedTestId?._id || issue.linkedTestId,
                linkedChangeId: issue.linkedChangeId?._id || issue.linkedChangeId
            });
        }
    }, [issue, isOpen, reset]);

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
                await updatePrdIssue(issue._id, formData);
                toast.success('Issue updated');
            } else {
                await createPrdIssue(formData);
                toast.success('Issue logged');
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save issue record');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Failure Analysis' : 'Log New Failure/Issue'} size="xl">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                
                <div className={styles.headerBlock}>
                    <div className={styles.grid3}>
                        <Input type="date" label="Report Date *" {...register('date', { required: true })} />
                        <Input label="Discovered in Rev *" placeholder="e.g. v1.2" {...register('revisionNo', { required: true })} />
                        <Select label="Found During *" options={FOUND_DURING_OPTIONS} {...register('foundDuring', { required: true })} />
                    </div>
                </div>

                <div className={styles.fullWidth}>
                    <Input label="Issue Title / Summary *" placeholder="e.g. Mosfet overheating at 240V" {...register('title', { required: true })} />
                </div>

                <div className={styles.grid3}>
                    <Select label="Category *" options={CATEGORIES} {...register('category', { required: true })} />
                    <Select label="Severity *" options={SEVERITY_LEVELS} {...register('severity', { required: true })} />
                    <Select label="Assigned To (Resolver)" options={[{ value: '', label: 'Unassigned' }, ...users]} {...register('assignedTo')} />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Detailed Problem Description</label>
                    <textarea className={styles.textarea} rows={3} {...register('detailedProblem')} placeholder="Describe exactly how the failure occurs..." />
                </div>

                <div className={styles.fullWidth}>
                    <label className={styles.label}>Investigated Root Cause</label>
                    <textarea className={styles.textarea} rows={2} {...register('rootCause')} placeholder="Why did this happen?" />
                </div>

                <div className={styles.grid2}>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Corrective Action</label>
                        <textarea className={styles.textarea} rows={2} {...register('correctiveAction')} placeholder="How are we fixing this right now?" />
                    </div>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Preventive Action</label>
                        <textarea className={styles.textarea} rows={2} {...register('preventiveAction')} placeholder="How are we preventing this in future designs?" />
                    </div>
                </div>

                <div className={styles.bottomBlock}>
                    <div className={styles.grid3}>
                        <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
                        <Select label="Linked Test Run (Optional)" options={[{ value: '', label: '- None -' }, ...tests]} {...register('linkedTestId')} />
                        <Select label="Resulting ECN (Optional)" options={[{ value: '', label: '- None -' }, ...ecns]} {...register('linkedChangeId')} />
                    </div>
                    
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Closure Remarks (if closed)</label>
                        <textarea className={styles.textarea} rows={1} {...register('closureRemark')} />
                    </div>

                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Attach Proof/Photos/Logs</label>
                        <div className={styles.fileUploadBox}>
                            <input type="file" multiple onChange={handleFileChange} id="issue-evidences" className={styles.fileInputHidden} />
                            <label htmlFor="issue-evidences" className={styles.fileDropZone}>
                                <Upload size={24} />
                                <span>Click to attach evidence files</span>
                            </label>
                            {attachments.length > 0 && (
                                <div className={styles.selectedFiles}>
                                    {attachments.map((f, i) => <span key={i} className={styles.fileBadge}>{f.name}</span>)}
                                </div>
                            )}
                            {isEdit && issue.attachments?.length > 0 && (
                                <div className={styles.existingFiles}>
                                    <div className={styles.subLabel}>Current Attachments:</div>
                                    {issue.attachments.map((f, idx) => (
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
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Save Issue Record</Button>
                </div>
            </form>
        </Modal>
    );
};

const PrdIssueTab = ({ projectId }) => {
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editMode, setEditMode] = useState(null);

    const fetchIssues = async () => {
        setLoading(true);
        try {
            const data = await getPrdIssues({ projectId });
            setIssues(data);
        } catch (error) {
            toast.error('Failed to load issues');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchIssues();
    }, [projectId]);

    const handleDelete = async (iss) => {
        if (window.confirm(`Delete issue log: "${iss.title}"?`)) {
            try {
                await deletePrdIssue(iss._id);
                toast.success('Deleted');
                fetchIssues();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Failure Analysis & Bug Tracking</h3>
                    <p className={styles.tabDesc}>Log unexpected bugs, hardware failures, or design regressions.</p>
                </div>
                <Button variant="primary" onClick={() => { setEditMode(null); setIsFormOpen(true); }}>
                    <AlertTriangle size={16} /> Log New Issue
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}><BrandedLoader size={80} /></div>
            ) : issues.length === 0 ? (
                <div className={styles.emptyState}>No issues logged yet. All clean!</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date / Rev</th>
                                <th>Issue Summary</th>
                                <th>Category</th>
                                <th>Severity</th>
                                <th>Status</th>
                                <th>Assigned To</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {issues.map(iss => (
                                <tr key={iss._id}>
                                    <td>
                                        <div className={styles.smDate}>{moment(iss.date).format('DD MMM YYYY')}</div>
                                        <span className={styles.revBadge}>Rev: {iss.revisionNo}</span>
                                    </td>
                                    <td>
                                        <strong>{iss.title}</strong>
                                        <div className={styles.subtext}>Found via: {iss.foundDuring}</div>
                                    </td>
                                    <td><span className={styles.catBadge}>{iss.category}</span></td>
                                    <td>
                                        <span className={clsx(styles.sevBadge, styles[`sev_${(iss.severity || 'Medium').toLowerCase()}`])}>
                                            {iss.severity || 'Medium'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${(iss.status || 'Open').replace(/\s+/g, '')}`])}>
                                            {iss.status || 'Open'}
                                        </span>
                                    </td>
                                    <td>{iss.assignedTo?.name || '-'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button onClick={() => { setEditMode(iss); setIsFormOpen(true); }} className={styles.iconBtn}><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(iss)} className={clsx(styles.iconBtn, styles.deleteBtn)}><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isFormOpen && (
                <IssueForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    issue={editMode}
                    projectId={projectId}
                    onSuccess={fetchIssues}
                />
            )}
        </div>
    );
};

export default PrdIssueTab;
