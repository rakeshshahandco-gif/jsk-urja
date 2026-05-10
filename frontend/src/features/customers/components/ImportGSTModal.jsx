import React, { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { previewGSTImport, confirmGSTImport } from '@/services/customerApi';
import styles from './ImportGSTModal.module.scss';
import { toast } from 'react-hot-toast';

export const ImportGSTModal = ({ isOpen, onClose, onSuccess }) => {
    const [step, setStep] = useState(1);
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // Preview Data
    const [previewData, setPreviewData] = useState([]);
    const [summary, setSummary] = useState(null);
    const [finalResult, setFinalResult] = useState(null);

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) processFileSelection(files[0]);
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) processFileSelection(e.target.files[0]);
    };

    const processFileSelection = (selectedFile) => {
        if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            setFile(selectedFile);
        } else {
            toast.error('Please select a valid Excel file (.xlsx or .xls)');
        }
    };

    const handlePreview = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const result = await previewGSTImport(formData);
            setPreviewData(result.previews || []);
            
            setSummary({
                totalRows: result.totalRows || 0,
                readyToUpdate: (result.previews || []).filter(p => p.action === 'Update').length,
                skips: (result.previews || []).filter(p => p.action === 'Skip').length,
            });
            
            setStep(2);
        } catch (error) {
            toast.error(error.message || 'Failed to generate preview');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const payload = {
                fileName: file.name,
                previews: previewData
            };
            
            const result = await confirmGSTImport(payload);
            setFinalResult(result.data || result);
            setStep(3);
            if (onSuccess) onSuccess();
        } catch (error) {
            toast.error(error.message || 'Failed to update GST numbers');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep(1);
        setFile(null);
        setPreviewData([]);
        setSummary(null);
        setFinalResult(null);
        onClose();
    };

    const renderStepNumbers = () => (
        <div className={styles.stepIndicator}>
            <div className={`${styles.step} ${step >= 1 ? styles.active : ''} ${step > 1 ? styles.completed : ''}`}>
                <div className={styles.stepNum}>1</div> Upload
            </div>
            <div className={styles.divider} />
            <div className={`${styles.step} ${step >= 2 ? styles.active : ''} ${step > 2 ? styles.completed : ''}`}>
                <div className={styles.stepNum}>2</div> Preview
            </div>
            <div className={styles.divider} />
            <div className={`${styles.step} ${step === 3 ? styles.active : ''}`}>
                <div className={styles.stepNum}>3</div> Result
            </div>
        </div>
    );

    const renderStep1 = () => (
        <div
            className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${file ? styles.hasFile : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {file ? (
                <div className={styles.fileSelected}>
                    <FileSpreadsheet size={48} className={styles.fileIcon} />
                    <div className={styles.fileName}>{file.name}</div>
                    <div className={styles.fileSize}>{(file.size / 1024).toFixed(2)} KB</div>
                    <Button variant="outline" size="sm" onClick={() => setFile(null)} className={styles.removeButton}>
                        Remove File
                    </Button>
                </div>
            ) : (
                <>
                    <Upload size={48} className={styles.uploadIcon} />
                    <h4>Safe Update Missing GST No.</h4>
                    <p>Only missing GST numbers will be updated.</p>
                    <label htmlFor="gst-file-input" className={styles.browseButton}>
                        <span className={styles.browseButtonText}>Browse Excel File</span>
                    </label>
                    <input id="gst-file-input" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className={styles.fileInput} />
                    <p className={styles.hint}>Headers: "Company", "Customer Name", or "Mobile" & "GST No."</p>
                </>
            )}
        </div>
    );

    const renderStep2 = () => (
        <div className={styles.previewSection}>
            <div className={styles.summaryStats}>
                <div className={styles.statPill + ' ' + styles.blue}>
                    <span>Rows Found: {summary.totalRows}</span>
                </div>
                <div className={styles.statPill + ' ' + styles.green}>
                    <CheckCircle size={16} />
                    <span>Ready to Update: {summary.readyToUpdate}</span>
                </div>
                <div className={styles.statPill + ' ' + (summary.skips > 0 ? styles.orange : styles.green)}>
                    <AlertCircle size={16} />
                    <span>Skipping: {summary.skips}</span>
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table>
                    <thead>
                        <tr>
                            <th>Excel Company</th>
                            <th>Excel GST</th>
                            <th>Matched Customer</th>
                            <th>Existing CRM GST</th>
                            <th>Action / Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {previewData.map((row, idx) => (
                            <tr key={idx}>
                                <td className={styles.bold}>{row.excelCompany || '-'}</td>
                                <td>{row.excelGst || '-'}</td>
                                <td className={row.matchedCompany ? styles.success : styles.error}>
                                    {row.matchedCompany || 'Not Found'}
                                </td>
                                <td>{row.existingGst || '-'}</td>
                                <td>
                                    {row.action === 'Update' ? (
                                        <span className={styles.badge + ' ' + styles.update}>Will Update</span>
                                    ) : (
                                        <span className={styles.badge + ' ' + styles.skip}>{row.status}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {previewData.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No readable data found in the Excel file.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            {summary.readyToUpdate === 0 && (
                <div style={{ color: '#dc2626', fontSize: '0.9rem', textAlign: 'center', marginTop: '1rem' }}>
                    There are 0 valid rows to safely update. Please review the skip reasons above.
                </div>
            )}
        </div>
    );

    const renderStep3 = () => (
        <div className={styles.resultsSection}>
            <CheckCircle size={64} className={styles.successIcon} />
            <h3>Update Complete</h3>
            <p>Your existing customers have been safely updated.</p>
            
            <div className={styles.resultPills}>
                <div className={styles.pill + ' ' + (finalResult.updatedCount > 0 ? styles.success : '')}>
                    <span className={styles.count}>{finalResult.updatedCount || 0}</span>
                    <span className={styles.label}>Successfully Updated</span>
                </div>
                <div className={styles.pill + ' ' + (finalResult.skippedCount > 0 ? styles.warning : '')}>
                    <span className={styles.count}>{finalResult.skippedCount || 0}</span>
                    <span className={styles.label}>Total Skipped</span>
                </div>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Update Missing GST Numbers" size="xl">
            <div className={styles.modalContent}>
                {renderStepNumbers()}

                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}

                <div className={styles.actions}>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        {step === 3 ? 'Close' : 'Cancel'}
                    </Button>
                    
                    {step === 1 && (
                        <Button onClick={handlePreview} disabled={!file || loading}>
                            {loading ? <><Loader2 size={16} className={styles.spinner} /> Processing...</> : 'Generate Preview'}
                        </Button>
                    )}
                    
                    {step === 2 && (
                        <Button onClick={handleConfirm} disabled={summary.readyToUpdate === 0 || loading}>
                            {loading ? <><Loader2 size={16} className={styles.spinner} /> Executing Updates...</> : 'Confirm & Execute Updates'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};
