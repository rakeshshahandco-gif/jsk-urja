import React, { useState, useEffect } from 'react';
import { getPrdTestReports, createPrdTestReport, getTestParameters, getPrdPrototypes, deletePrdTestReport } from '@/services/prdApi';
import { Button, Input, Modal, Select } from '@/components/ui';
import { Plus, Edit, Trash2, Download, Upload, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdTestingTab.module.scss';
import clsx from 'clsx';
import { useForm, useFieldArray } from 'react-hook-form';
import moment from 'moment';
import { env } from '@/config/env';

const TEST_TYPES = [
    { value: 'Initial Prototype Test', label: 'Initial Prototype Test' },
    { value: 'Thermal / Stress Test', label: 'Thermal / Stress Test' },
    { value: 'Pre-Production Verification', label: 'Pre-Production Verification' },
    { value: 'Customer Sample Validation', label: 'Customer Sample Validation' },
    { value: 'Regression Test', label: 'Regression Test (Post-ECN)' },
];

const STATUS_OPTIONS = [
    { value: 'Pass', label: 'Pass - Meets all criteria' },
    { value: 'Fail', label: 'Fail - Needs review/redesign' },
    { value: 'Conditional Pass', label: 'Conditional Pass (Deviations accepted)' },
];

const determinePassFail = (val, param) => {
    if (param.inputType === 'Numeric') {
        const num = parseFloat(val);
        if (isNaN(num)) return '';
        if (param.lowerLimit !== null && num < param.lowerLimit) return 'Fail';
        if (param.upperLimit !== null && num > param.upperLimit) return 'Fail';
        return 'Pass';
    }
    if (param.inputType === 'Pass-Fail') {
        return val === 'Pass' ? 'Pass' : 'Fail';
    }
    return ''; // Text or multiple points rely on manual observation
};

const TestingForm = ({ isOpen, onClose, projectId, projectCategory, onSuccess }) => {
    const [prototypes, setPrototypes] = useState([]);
    const [parameters, setParameters] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [overallStatus, setOverallStatus] = useState('Pass');

    const { register, handleSubmit, watch, setValue, control, formState: { isSubmitting } } = useForm({
        defaultValues: {
            testDate: new Date().toISOString().split('T')[0],
            testType: 'Initial Prototype Test',
            testStatus: 'Pass',
            details: []
        }
    });

    const { fields, replace } = useFieldArray({ control, name: 'details' });

    useEffect(() => {
        const initData = async () => {
            try {
                const [protosRes, paramsRes] = await Promise.all([
                    getPrdPrototypes({ projectId }),
                    getTestParameters({ productCategory: projectCategory, isActive: true })
                ]);
                
                setPrototypes(protosRes.map(p => ({ value: p._id, label: `Rev ${p.revisionNo} (${p.sampleType})` })));
                setParameters(paramsRes);

                // Initialize form array
                replace(paramsRes.map(p => ({
                    parameterId: p._id,
                    parameterName: p.parameterName,
                    inputType: p.inputType,
                    unit: p.unit,
                    lowerLimit: p.lowerLimit,
                    upperLimit: p.upperLimit,
                    isMandatory: p.isMandatory,
                    dynamicPoints: p.dynamicPoints || [],
                    
                    actualReading: p.inputType === 'Multiple-Points' ? Array((p.dynamicPoints||[]).length).fill('') : '',
                    passFail: '',
                    observation: ''
                })));
            } catch (error) {
                toast.error('Failed to load form dependencies');
            }
        };
        if (isOpen) {
            initData();
        }
    }, [isOpen, projectId, projectCategory, replace]);

    const handleFileChange = (e) => {
        if (e.target.files) setAttachments(Array.from(e.target.files));
    };

    const detailsWatcher = watch('details');

    // Auto-calculate passed/fail when readings change
    const handleReadingBlur = (index) => {
        const row = detailsWatcher[index];
        const result = determinePassFail(row.actualReading, row);
        if (result && row.passFail !== result) {
            setValue(`details.${index}.passFail`, result, { shouldDirty: true });
            
            // Auto update overall status if any strict fail
            if (result === 'Fail') {
                setValue('testStatus', 'Fail');
                setOverallStatus('Fail');
            }
        }
    };

    const onSubmit = async (data) => {
        try {
            const formData = new FormData();
            formData.append('projectId', projectId);
            formData.append('testDate', data.testDate);
            formData.append('prototypeId', data.prototypeId);
            formData.append('testType', data.testType);
            formData.append('testStatus', data.testStatus);
            formData.append('location', data.location || '');
            formData.append('ambientTemp', data.ambientTemp || '');
            formData.append('overallRemarks', data.overallRemarks || '');

            // Convert details array to JSON string for backend parsing
            const sanitizedDetails = data.details.map(d => ({
                parameterId: d.parameterId,
                actualReading: d.actualReading,
                passFail: d.passFail,
                observation: d.observation
            }));
            formData.append('details', JSON.stringify(sanitizedDetails));

            attachments.forEach(file => {
                formData.append('attachments', file);
            });

            await createPrdTestReport(formData);
            toast.success('Test Report submitted');
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to submit test');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Execute New Test Run" size="xl">
            <form onSubmit={handleSubmit(onSubmit)} className={styles.formContainer}>
                
                <div className={styles.headerBlock}>
                    <div className={styles.grid3}>
                        <Input type="date" label="Test Date *" {...register('testDate', { required: true })} />
                        <Select label="Linked Prototype/Revision *" options={prototypes} {...register('prototypeId', { required: true })} />
                        <Select label="Test Type *" options={TEST_TYPES} {...register('testType', { required: true })} />
                    </div>
                    <div className={styles.grid3}>
                        <Input label="Environment Location" placeholder="e.g. In-house Lab" {...register('location')} />
                        <Input label="Ambient Temp (°C)" placeholder="e.g. 25" {...register('ambientTemp')} />
                        <Select label="Overall Result *" options={STATUS_OPTIONS} {...register('testStatus', { required: true })} />
                    </div>
                </div>

                <div className={styles.testingGrid}>
                    <table className={styles.paramTable}>
                        <thead>
                            <tr>
                                <th>Parameter Name</th>
                                <th>Expected Criteria</th>
                                <th>Actual Reading</th>
                                <th width="120">Result</th>
                                <th>Observation / Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map((field, index) => {
                                const p = field;
                                return (
                                <tr key={field.id} className={p.isMandatory ? styles.mandatoryRow : ''}>
                                    <td>
                                        <strong>{p.parameterName}</strong>
                                        {p.isMandatory && <span className={styles.asterisk}>*</span>}
                                    </td>
                                    <td className={styles.criteriaCol}>
                                        {p.inputType === 'Numeric' && (p.lowerLimit !== null || p.upperLimit !== null) && (
                                            `Range: ${p.lowerLimit ?? '-∞'} to ${p.upperLimit ?? '+∞'} ${p.unit||''}`
                                        )}
                                        {p.inputType === 'Pass-Fail' && 'Must Pass'}
                                        {p.inputType === 'Text' && 'Manual Observation'}
                                    </td>
                                    <td>
                                        {p.inputType === 'Numeric' && (
                                            <div className={styles.inputWithUnit}>
                                                <input 
                                                    type="number" 
                                                    step="any" 
                                                    className={styles.compactInput} 
                                                    {...register(`details.${index}.actualReading`, { required: p.isMandatory })}
                                                    onBlur={() => handleReadingBlur(index)}
                                                />
                                                <span className={styles.unitSpan}>{p.unit}</span>
                                            </div>
                                        )}
                                        {p.inputType === 'Pass-Fail' && (
                                            <select className={styles.compactSelect} {...register(`details.${index}.actualReading`, { required: p.isMandatory })} onBlur={() => handleReadingBlur(index)}>
                                                <option value="">-Select-</option>
                                                <option value="Pass">Pass</option>
                                                <option value="Fail">Fail</option>
                                            </select>
                                        )}
                                        {p.inputType === 'Text' && (
                                            <input type="text" className={styles.compactInput} {...register(`details.${index}.actualReading`, { required: p.isMandatory })} />
                                        )}
                                        {p.inputType === 'Multiple-Points' && (
                                            <div className={styles.multiPointStack}>
                                                {p.dynamicPoints.map((dp, i) => (
                                                    <div key={i} className={styles.multiRow}>
                                                        <span className={styles.pointLabel}>{dp.pointLabel}</span>
                                                        <input type="text" className={styles.compactInput} {...register(`details.${index}.actualReading.${i}`)} placeholder="Reading..." />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <select 
                                            className={clsx(styles.compactSelect, styles[`result_${detailsWatcher[index]?.passFail}`])} 
                                            {...register(`details.${index}.passFail`, { required: p.isMandatory })}
                                        >
                                            <option value="">-Set-</option>
                                            <option value="Pass">Pass</option>
                                            <option value="Fail">Fail</option>
                                            <option value="N/A">N/A</option>
                                        </select>
                                    </td>
                                    <td>
                                        <input type="text" className={styles.compactInput} placeholder="Remarks..." {...register(`details.${index}.observation`)} />
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>

                <div className={styles.bottomBlock}>
                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Overall Test Remarks / Conclusions</label>
                        <textarea className={styles.textarea} rows={2} {...register('overallRemarks')} />
                    </div>

                    <div className={styles.fullWidth}>
                        <label className={styles.label}>Attach Test Evidences (Thermal Images, Excel Graphs, PDFs)</label>
                        <div className={styles.fileUploadBox}>
                            <input type="file" multiple onChange={handleFileChange} id="test-evidences" className={styles.fileInputHidden} />
                            <label htmlFor="test-evidences" className={styles.fileDropZone}>
                                <Upload size={24} />
                                <span>Click to attach evidence files</span>
                            </label>
                            {attachments.length > 0 && (
                                <div className={styles.selectedFiles}>
                                    {attachments.map((f, i) => <span key={i} className={styles.fileBadge}>{f.name}</span>)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" type="submit" isLoading={isSubmitting}>Submit Quality Result</Button>
                </div>
            </form>
        </Modal>
    );
};

const TestDetailModal = ({ isOpen, onClose, report }) => {
    if (!report) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Test Report Details - ${moment(report.testDate).format('DD MMM YYYY')}`} size="xl">
            <div className={styles.detailView}>
                <div className={styles.topCards}>
                    <div className={styles.infoCard}>
                        <div className={styles.lbl}>Test Type</div>
                        <div className={styles.val}>{report.testType}</div>
                    </div>
                    <div className={styles.infoCard}>
                        <div className={styles.lbl}>Prototype / Rev</div>
                        <div className={styles.val}>{report.prototypeId?.revisionNo || 'N/A'}</div>
                    </div>
                    <div className={styles.infoCard}>
                        <div className={styles.lbl}>Tested By</div>
                        <div className={styles.val}>{report.testedBy?.name || 'Unknown'}</div>
                    </div>
                    <div className={clsx(styles.infoCard, styles[`bg_${(report.testStatus || 'Pass').replace(/\W/g, '')}`])}>
                        <div className={styles.lbl}>Final Status</div>
                        <div className={styles.valResult}>{report.testStatus || 'Pass'}</div>
                    </div>
                </div>

                {report.overallRemarks && (
                    <div className={styles.remarksBox}>
                        <strong>Conclusions: </strong> {report.overallRemarks}
                    </div>
                )}

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Criteria</th>
                                <th>Reading</th>
                                <th>Result</th>
                                <th>Observation</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.details.map((d, i) => (
                                <tr key={i}>
                                    <td><strong>{d.parameterId?.parameterName || 'Unknown'}</strong></td>
                                    <td className={styles.smCode}>
                                        {d.parameterId?.inputType === 'Numeric' ? `Range: ${d.parameterId?.lowerLimit ?? '-∞'} to ${d.parameterId?.upperLimit ?? '+∞'} ${d.parameterId?.unit || ''}` : d.parameterId?.inputType}
                                    </td>
                                    <td>
                                        {Array.isArray(d.actualReading) ? (
                                            d.actualReading.map((r, idx) => <span key={idx} className={styles.arrPill}>{r}</span>)
                                        ) : (
                                            <span className={styles.rdgBadge}>{d.actualReading} {d.parameterId?.inputType === 'Numeric' ? d.parameterId?.unit : ''}</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={clsx(styles.resBadge, d.passFail === 'Pass' ? styles.resPass : d.passFail === 'Fail' ? styles.resFail : '')}>
                                            {d.passFail}
                                        </span>
                                    </td>
                                    <td>{d.observation || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {report.attachments?.length > 0 && (
                    <div className={styles.attBox}>
                        <h4>Evidences ({report.attachments.length})</h4>
                        <div className={styles.attGrid}>
                                {report.attachments.map((f, i) => (
                                    <a key={i} href={`${env.SOCKET_URL}/${f.url}`} target="_blank" rel="noreferrer" className={styles.attLink}>
                                        <Download size={14}/> {f.filename}
                                    </a>
                                ))}
                        </div>
                    </div>
                )}

                <div className={styles.footer}>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

const PrdTestingTab = ({ projectId, projectCategory }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [viewReport, setViewReport] = useState(null);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const data = await getPrdTestReports({ projectId });
            setReports(data);
        } catch (error) {
            toast.error('Failed to load test history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchReports();
    }, [projectId]);

    const handleDelete = async (rep) => {
        if (window.confirm(`Delete Test Report on ${moment(rep.testDate).format('YYYY-MM-DD')}?`)) {
            try {
                await deletePrdTestReport(rep._id);
                toast.success('Deleted');
                fetchReports();
            } catch (error) {
                toast.error(error.message || 'Error deleting');
            }
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Product Testing Results</h3>
                    <p className={styles.tabDesc}>Execute dynamic test procedures tied to `{projectCategory}` configurations.</p>
                </div>
                <Button variant="primary" onClick={() => setIsFormOpen(true)}>
                    <CheckCircle size={16} /> Run New Test
                </Button>
            </div>

            {loading ? (
                <div className={styles.loader}>Loading...</div>
            ) : reports.length === 0 ? (
                <div className={styles.emptyState}>No test reports logged yet for this project.</div>
            ) : (
                <div className={styles.gridCards}>
                    {reports.map(rep => (
                        <div key={rep._id} className={clsx(styles.reportCard, rep.testStatus === 'Pass' ? styles.borderPass : rep.testStatus === 'Fail' ? styles.borderFail : styles.borderCond)}>
                            <div className={styles.cardHeader}>
                                <div className={styles.hTop}>
                                    <span className={styles.date}>{moment(rep.testDate).format('DD MMM YYYY')}</span>
                                    {rep.attachments?.length > 0 && <span className={styles.attIco}><Download size={14}/></span>}
                                </div>
                                <h4 className={styles.testName}>{rep.testType}</h4>
                                <div className={styles.protoBadge}>Rev: {rep.prototypeId?.revisionNo || 'Unknown'}</div>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.row}>
                                    <span className={styles.lbl}>Tested By:</span>
                                    <span className={styles.val}>{rep.testedBy?.name || '-'}</span>
                                </div>
                                <div className={styles.row}>
                                    <span className={styles.lbl}>Result:</span>
                                    <span className={clsx(styles.resTxt, styles[`txt_${(rep.testStatus || 'Pass').replace(/\W/g, '')}`])}>
                                        {rep.testStatus || 'Pass'}
                                    </span>
                                </div>
                            </div>
                            <div className={styles.cardFooter}>
                                <button onClick={() => setViewReport(rep)} className={styles.btnView}>View Full Detail</button>
                                <button onClick={() => handleDelete(rep)} className={styles.btnDel}><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isFormOpen && (
                <TestingForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    projectId={projectId}
                    projectCategory={projectCategory}
                    onSuccess={fetchReports}
                />
            )}

            {viewReport && (
                <TestDetailModal
                    isOpen={!!viewReport}
                    onClose={() => setViewReport(null)}
                    report={viewReport}
                />
            )}
        </div>
    );
};

export default PrdTestingTab;
